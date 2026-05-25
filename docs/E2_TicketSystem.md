# Sistema de Tickets e Incidentes — Entrega 2: Cómputo y Datos
**Universidad Galileo · Postgrado en Diseño y Desarrollo de Software · Infraestructura en la Nube**
**Ciclo Mayo–Junio 2026**

**Equipo:**
- Luis André Morales
- Erick Estuardo Saban

---

## [EN CONSTRUCCIÓN — Secciones por completar]
- [x] Resumen de cambios desde E1
- [ ] Diagrama de contexto
- [ ] Decisión de cómputo
- [ ] Modelo de datos
- [ ] Preguntas abiertas
- [ ] Anexo IA

---

## Resumen de cambios desde E1

No se recibió retroalimentación formal del instructor sobre E1. Los cambios que se documentan a continuación surgieron al comenzar la implementación en el curso paralelo de Automatización con IaC (DevOps), donde las decisiones de diseño se volvieron concretas por primera vez. Iterar entre diseño e implementación reveló dos ajustes necesarios al modelo propuesto en E1.

### Cambio 1 — Cómputo de la API: de ECS Fargate a EKS

En E1 se propuso ECS Fargate como plataforma de cómputo para la API REST. Al implementar los módulos Terraform en Automatización, el equipo eligió **EKS (Elastic Kubernetes Service)** para la API por dos razones concretas: (a) el equipo ya tiene experiencia operando Kubernetes y el curso de Automatización ofrece puntos adicionales por el track EKS, y (b) EKS ofrece mayor control sobre el scheduling y el modelo de red de los pods, lo que facilita la separación de capas que se diseñará en E3.

Como consecuencia, el mapeo a conceptos del curso en §5 de E1 se actualiza: donde decía "ECS Fargate" para el componente de Cómputo (API), ahora dice **EKS con managed node group**.

### Cambio 2 — Cómputo del worker asíncrono: decisión nueva (no estaba en E1)

E1 mencionaba "SQS + workers" como procesamiento asíncrono pero no especificaba dónde correrían esos workers. Al implementar, el equipo decidió **AWS Lambda** (Python 3.12, 128 MB, dentro de la VPC) para el worker asíncrono, en lugar de un segundo servicio en ECS o EKS. La razón principal: evitar redundancia de planos de contenedores — si la API ya corre en EKS, correr el worker también en contenedor duplica infraestructura sin beneficio. Lambda es event-driven por naturaleza (SQS trigger) y tiene costo cercano a cero en la escala del sistema.

Esta separación — **EKS para la API síncrona, Lambda para el worker asíncrono** — es la decisión de cómputo central de E2 y se documenta con trade-offs completos en §3.

---

## 1. Diagrama de contexto

El diagrama muestra el sistema como una caja negra (nivel C4-1). Se distinguen tres categorías: actores primarios que interactúan directamente, sistemas externos aún por decidir, y servicios cloud propios ya definidos.

```
[Reportante]  ─────────────────────────────┐
[Agente/SRE]  ──────────────────────────── ▶  [Sistema de Tickets · AWS us-east-1]
[Administrador] ──────────────────────────┘         │              │              │
                                                     │              │              │
                [Identity Provider] ─────────────────┘              │              │
                     (por definir · E5)                             │              │
                                                      [Notificaciones]   [Amazon S3]
                                                      (por definir·E4)  (adjuntos)
                                                                              │
                                                                    [Amazon RDS Postgres]
                                                                      (tickets y eventos)
```

**Actores primarios** (color púrpura en el diagrama): Reportante, Agente / SRE, Administrador. Los tres interactúan con el sistema vía API REST sobre HTTPS.

**Sistemas externos por definir:**
- **Identity Provider:** provee el JWT con el rol del usuario. La tecnología concreta (Cognito, Auth0, Keycloak) se decide en E5 — Seguridad.
- **Servicio de notificaciones:** recibe eventos del sistema y los entrega por email y/o Slack. El canal concreto se decide en E4 — Asíncrono.

**Servicios cloud propios** (ya decididos):
- **Amazon S3:** almacena adjuntos de tickets. Bucket con versioning, SSE-S3 y lifecycle en `attachments/`.
- **Amazon RDS PostgreSQL 16:** almacena tickets, historial de eventos y reglas de SLA.

---

## 2. Decisión de cómputo

### Contexto
El sistema tiene dos cargas de trabajo con perfiles completamente distintos:

| Carga | Patrón | Característica clave |
|---|---|---|
| **API REST** | Síncrona · baja latencia | Recibe `POST /tickets`, `PATCH`, `GET`. El usuario espera respuesta inmediata. |
| **Worker asíncrono** | Event-driven · tolerante a latencia | Procesa eventos de SQS: envía notificaciones y evalúa SLA vencidos. |

Estas dos cargas justifican dos decisiones de cómputo separadas.

---

### 2.1 API REST → EKS (Elastic Kubernetes Service)

**Decisión:** La API REST corre en un cluster EKS con managed node group en AWS.

**Justificación:**
- El equipo tiene experiencia previa operando Kubernetes, lo que reduce el riesgo operativo.
- EKS permite control granular sobre el modelo de red de los pods, lo que facilitará la separación de capas en E3 (VPC, subnets públicas/privadas).
- Kubernetes permite desplegar múltiples réplicas del API pod con health checks y rolling updates sin downtime.
- En el curso de Automatización, el módulo `eks` ya está implementado con managed node group, lo que garantiza coherencia entre el diseño y la implementación.

**Trade-offs explícitos:**

| | EKS (elegido) | ECS Fargate (descartado) |
|---|---|---|
| Complejidad operativa | Alta — hay que gestionar el control plane y los node groups | Baja — AWS gestiona todo |
| Control de red | Alto — integración con VPC CNI nativa | Medio — networking manejado por AWS |
| Costo | Medio — $0.10/h el control plane + instancias EC2 de los nodos | Medio — pago por task-hora |
| Curva de aprendizaje | Baja para el equipo (experiencia previa) | Media |

**Desventaja reconocida:** EKS tiene mayor costo base que ECS Fargate — el control plane de Kubernetes cobra $0.10/hora (~$73/mes) independientemente del tráfico. Para un sistema con tráfico bajo o intermitente, ECS Fargate o Lambda para la API serían más económicos. En este proyecto la decisión se justifica por la experiencia del equipo y la alineación con el curso de Automatización, no por optimización de costo.

---

### 2.2 Worker asíncrono → AWS Lambda

**Decisión:** El worker asíncrono (notificaciones y evaluación de SLA) corre como función AWS Lambda, Python 3.12, 128 MB, 30s timeout, desplegada dentro de la VPC.

**Justificación:**
- El worker es event-driven por naturaleza: se activa cuando llegan mensajes a SQS, no necesita estar corriendo permanentemente.
- Evita redundancia de planos de contenedores: si la API ya corre en EKS, correr el worker también en contenedor duplica infraestructura sin beneficio.
- Lambda tiene event source mapping nativo con SQS — no hay servidor de polling que mantener.
- El IAM role puede restringirse al mínimo sin wildcards: únicamente `logs:CreateLogStream` y `logs:PutLogEvents` sobre el ARN específico del log group, más el managed policy `AWSLambdaVPCAccessExecutionRole` para acceso a la VPC.

**Trade-offs explícitos:**

| | Lambda (elegido) | ECS Fargate (descartado) |
|---|---|---|
| Costo | ~$0 (free tier: 1M invocaciones/mes) | ~$9/mes 24/7 aunque no haya tráfico |
| Cold start en VPC | 1–5 segundos | No aplica (contenedor siempre activo) |
| Redundancia con EKS | Ninguna | Alta — dos planos de contenedores |
| Escalado | Automático por mensajes en cola | Requiere auto-scaling policy |

**Desventaja reconocida:** Lambda dentro de la VPC agrega un cold start de 1–5 segundos por el tiempo de provisioning de la ENI. Para el worker asíncrono esto es aceptable — el escalamiento de SLA y el envío de notificaciones no son operaciones que el usuario esté esperando sincrónicamente. Si en el futuro el sistema requiriera procesamiento de alta frecuencia (>100 eventos/segundo sostenidos), habría que re-evaluar.

---

### Resumen de la decisión de cómputo

```
Capa pública     →  EKS (API REST · pods replicados)
Capa asíncrona   →  Lambda (worker SQS · event-driven)
Almacenamiento   →  RDS PostgreSQL 16 + S3
```

---

## 3. Modelo de datos

### 3.1 Qué va en base de datos vs almacenamiento de objetos

| Tipo de dato | Dónde vive | Razón |
|---|---|---|
| Metadatos del ticket (tipo, severidad, estado, prioridad, timestamps, IDs) | RDS PostgreSQL | Queries de filtrado, ordenamiento y JOIN con historial |
| Historial de eventos del ticket (inmutable) | RDS PostgreSQL | FK a `tickets`, queries por ticket_id con ordenamiento por timestamp |
| Reglas de SLA por tipo/severidad | RDS PostgreSQL | Leídas frecuentemente por el worker; actualizadas solo por el admin |
| Usuarios y roles | RDS PostgreSQL | JOIN con tickets para asignación y permisos |
| Preferencias de notificación por usuario | RDS PostgreSQL | Leídas por el worker al enviar notificaciones |
| Adjuntos (capturas, logs, archivos) | Amazon S3 (`attachments/`) | Binarios de tamaño variable; no se consultan con SQL |

**Regla de separación:** si el dato se consulta con SQL (filtros, JOINs, rangos de fecha), va a RDS. Si el dato es un archivo binario de tamaño variable que solo se lee o descarga, va a S3.

---

### 3.2 Esquema de base de datos

#### Tabla `tickets`
Entidad central del sistema. Una fila por ticket.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` PK | Identificador único del ticket |
| `number` | `TEXT` UNIQUE | Número legible: `TKT-0001`, `TKT-0002`... |
| `type` | `ENUM('incident','request')` | Tipo de ticket |
| `severity` | `ENUM('critical','high','medium','low')` | Severidad declarada por el reportante |
| `priority` | `INTEGER` | Prioridad calculada por el backend (menor = más urgente) |
| `title` | `TEXT` | Título del ticket |
| `description` | `TEXT` | Descripción completa |
| `state` | `ENUM('open','in_progress','resolved','closed')` | Estado actual |
| `escalation_level` | `INTEGER` DEFAULT 0 | Nivel de escalamiento: 0=L1, 1=L2, 2=L3 |
| `reporter_id` | `UUID` FK → `users.id` | Quien abrió el ticket |
| `assignee_id` | `UUID` FK → `users.id` NULL | Agente asignado (null si no asignado) |
| `sla_rule_id` | `UUID` FK → `sla_rules.id` | Regla de SLA aplicable |
| `sla_due_at` | `TIMESTAMPTZ` | Deadline de primera respuesta según SLA |
| `resolved_at` | `TIMESTAMPTZ` NULL | Timestamp de resolución |
| `created_at` | `TIMESTAMPTZ` DEFAULT NOW() | Timestamp de creación (UTC) |
| `updated_at` | `TIMESTAMPTZ` | Última actualización |

**Índices:**
- `(state, priority, created_at)` — cola del agente: tickets abiertos ordenados por prioridad
- `(reporter_id, state)` — vista del reportante: mis tickets y su estado
- `(assignee_id, state)` — tickets asignados a un agente específico
- `(sla_due_at)` — worker de escalamiento: tickets con SLA próximo a vencer

---

#### Tabla `ticket_events`
Historial inmutable. Una fila por cada acción sobre un ticket. No se actualiza ni elimina.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` PK | Identificador del evento |
| `ticket_id` | `UUID` FK → `tickets.id` | Ticket al que pertenece |
| `actor_id` | `UUID` FK → `users.id` | Quien realizó la acción |
| `event_type` | `ENUM('created','assigned','state_changed','commented','escalated','attachment_added')` | Tipo de evento |
| `payload` | `JSONB` | Datos específicos del evento (estado anterior/nuevo, comentario, nivel de escalamiento) |
| `created_at` | `TIMESTAMPTZ` DEFAULT NOW() | Timestamp del evento (UTC) |

**Índice:** `(ticket_id, created_at)` — historial de un ticket ordenado cronológicamente.

---

#### Tabla `sla_rules`
Configurada por el administrador. Define el tiempo de primera respuesta por tipo y severidad.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` PK | Identificador de la regla |
| `type` | `ENUM('incident','request')` | Tipo de ticket al que aplica |
| `severity` | `ENUM('critical','high','medium','low')` | Severidad al que aplica |
| `response_minutes` | `INTEGER` | Minutos para primera respuesta (ej: 15 para incidente crítico) |
| `escalation_levels` | `JSONB` | Umbrales y acciones por nivel L1→L2→L3 |

---

#### Tabla `users`
Usuarios del sistema. El rol se extrae del JWT emitido por el IdP; esta tabla mantiene el perfil interno.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `UUID` PK | Identificador (debe coincidir con el `sub` del JWT) |
| `name` | `TEXT` | Nombre para mostrar |
| `email` | `TEXT` UNIQUE | Email corporativo |
| `role` | `ENUM('reporter','agent','admin')` | Rol en el sistema |
| `notify_email` | `BOOLEAN` DEFAULT TRUE | Preferencia de notificación por email |
| `notify_slack` | `BOOLEAN` DEFAULT FALSE | Preferencia de notificación por Slack |
| `slack_user_id` | `TEXT` NULL | ID de usuario en Slack (si aplica) |
| `created_at` | `TIMESTAMPTZ` DEFAULT NOW() | Timestamp de creación |

---

### 3.3 Patrones de acceso principales

| # | Query | Tabla(s) | Uso |
|---|---|---|---|
| 1 | Tickets abiertos ordenados por prioridad (cola del agente) | `tickets` | CU-02, CU-06 — query más frecuente |
| 2 | Tickets de un reportante con su estado | `tickets` | CU-01 (confirmación), vista del reportante |
| 3 | Historial completo de un ticket | `ticket_events` JOIN `users` | CU-05 |
| 4 | Tickets con SLA vencido o próximo a vencer | `tickets` | Worker de escalamiento — CU-04 |
| 5 | Tickets resueltos en un rango de fechas | `tickets` JOIN `ticket_events` | CU-07 (reportes del admin) |

---

### 3.4 Decisión de caché

No se incluye caché en este diseño. La justificación:

- El patrón de acceso dominante (cola del agente, query 1) requiere datos frescos — un agente que ve la cola con segundos de retraso podría tomar decisiones sobre tickets ya asignados.
- El volumen de datos para una empresa de 50–200 ingenieros no justifica la complejidad de un caché: la cola raramente superará los 200 tickets activos simultáneos.
- Los índices definidos en §3.2 son suficientes para mantener las queries bajo 100ms en ese volumen.

Si en el futuro el sistema creciera a miles de tickets activos o se integrara con dashboards de alta frecuencia de actualización, se evaluaría ElastiCache (Redis) para la cola del agente.

---

## 4. Preguntas abiertas

Las siguientes decisiones quedan explícitamente abiertas para entregas posteriores. No son omisiones — son unknowns honestos que se cierran conforme se cubran los temas en clase.

**Para E3 — Red:**
- ¿Cuál será el CIDR de la VPC dedicada que reemplazará la default VPC usada en Automatización como placeholder?
- ¿Cuántas Availability Zones usamos en producción — 2 o 3? ¿El costo de la tercera AZ está justificado para este sistema?
- ¿NAT Gateway o VPC endpoints para la conectividad saliente de Lambda y RDS hacia S3 y CloudWatch?
- ¿En qué subnet viven los pods de EKS — pública con NodePort o privada con ALB Ingress?

**Para E4 — Asíncrono:**
- ¿El canal de notificaciones será SES (email) + Slack webhook, o solo email en una primera versión?
- ¿El worker de evaluación de SLA corre como event source de SQS o como Lambda con EventBridge Scheduler?
- ¿Qué pasa si el worker de SLA falla a mitad de un ciclo de evaluación? ¿Idempotencia por ticket_id?
- ¿Cuál es el threshold de reintentos antes de enviar a DLQ un mensaje de notificación fallido?

**Para E5 — Seguridad:**
- ¿Qué Identity Provider concreto maneja la autenticación — Cognito, Auth0, o un IdP corporativo?
- ¿Los secretos de RDS (password) y del Slack webhook se gestionan con Secrets Manager o Parameter Store?
- ¿Hay rotación automática de credenciales de RDS desde el primer día o se agrega en una iteración posterior?

---

## 5. Anexo IA

### Qué le pedimos a la IA
- Primer borrador del resumen de cambios desde E1, para luego editarlo con los hechos concretos del proyecto.
- Revisión de consistencia del modelo de datos: ¿las tablas propuestas cubren todos los casos de uso priorizados en E1?
- Sugerencia de índices para los patrones de acceso descritos.
- Borrador de la sección de decisión de caché y su justificación.

### Qué aceptamos y editamos
- El modelo de datos fue generado con IA como borrador y revisado columna por columna por el equipo para verificar que cada campo correspondiera a un caso de uso o funcionalidad específica de E1. Se eliminaron columnas genéricas que la IA agregó sin respaldo en los CUs (por ejemplo, `priority_label TEXT` que duplicaba información ya codificada en `priority INTEGER`).
- La tabla de decisión Lambda vs ECS Fargate fue sugerida por IA y editada para reflejar los valores reales del proyecto (costo de $9/mes de Fargate, cold start real de 1–5s en VPC, alineación con el módulo EKS ya implementado en Automatización).
- El diagrama de contexto fue generado con IA y ajustado para reflejar que el IdP y el servicio de notificaciones siguen siendo preguntas abiertas — la IA inicialmente los colocó como sistemas concretos (Cognito y SES) sin que el equipo hubiera tomado esa decisión.

### Qué descartamos y por qué
- La IA propuso agregar una tabla `attachments` en RDS para metadatos de los adjuntos (nombre, tamaño, content-type). Lo descartamos porque ese metadato puede vivir en el `payload` JSONB del evento `attachment_added` en `ticket_events`, evitando una tabla adicional sin queries propias.
- La IA sugirió incluir ElastiCache Redis desde el diseño inicial. Lo descartamos porque el volumen de datos del sistema (empresa de 50–200 ingenieros) no justifica la complejidad operativa de un caché en esta fase. La decisión quedó documentada en §3.4.
- La IA propuso una tabla `audit_log` separada de `ticket_events`. Lo descartamos porque `ticket_events` ya es el registro inmutable de auditoría — una segunda tabla duplicaría datos sin agregar valor.
