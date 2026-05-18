# Sistema de Tickets e Incidentes — Entrega # 1 
**Universidad Galileo · Postgrado en Diseño y Desarrollo de Software · Infraestructura en la Nube**
**Ciclo Mayo–Junio 2026**

**Equipo:**
- Luis André Morales
- Erick Estuardo Saban

---

## Qué cambió desde la entrega anterior
_Primera entrega — no hay versión anterior._

---

## 1. Resumen Ejecutivo

Las empresas de tecnología medianas (50–200 ingenieros) que operan múltiples servicios en producción enfrentan un problema recurrente: **los incidentes y solicitudes operativas llegan por canales informales** (Slack, correo, mensajes directos) y **no existe una forma sistemática de priorizarlos ni rastrearlos**. A esa escala, un equipo de operaciones/SRE ya no puede depender de la memoria colectiva ni del triaging manual — los incidentes se pierden, se duplican, o se atienden en el orden equivocado.

El **Sistema de Tickets e Incidentes** es una plataforma backend que centraliza el registro, clasificación, asignación y seguimiento de incidentes operativos y solicitudes de servicio. Cualquier rol técnico de la organización puede abrir un ticket; el equipo de operaciones/SRE lo recibe con prioridad calculada automáticamente y con escalamiento automático si no hay respuesta dentro del SLA definido.

**Lo que evita o automatiza:**
- Evita que incidentes críticos queden enterrados en hilos de Slack sin responsable asignado.
- Automatiza la priorización según tipo y severidad declarada, eliminando el triaging manual.
- Automatiza el escalamiento cuando un ticket de alta prioridad supera el tiempo de respuesta acordado.
- Genera trazabilidad completa: cada cambio de estado, asignación y comentario queda registrado con autor y timestamp.

---

## 2. Actores

### Actores primarios
Interactúan directamente con el sistema para cumplir su objetivo principal.

| Actor | Rol | Interacción principal |
|---|---|---|
| **Reportante** | Cualquier persona con rol técnico en la organización (desarrollador, QA, analista) | Abre tickets, adjunta evidencia, consulta el estado de sus reportes |
| **Agente de Operaciones / SRE** | Miembro del equipo de ops responsable de resolver incidentes | Recibe tickets asignados, actualiza estado, registra resolución, escala si es necesario |
| **Administrador del sistema** | Responsable de configurar el sistema (SLAs, categorías, usuarios, equipos) | Gestiona configuración, consulta reportes globales, define reglas de escalamiento |

### Actores de soporte
Sistemas externos con los que el sistema se integra para cumplir su función.

| Actor | Tipo | Propósito |
|---|---|---|
| **Servicio de notificaciones (Email / Slack)** | Sistema externo | Envía alertas a reportantes y agentes cuando cambia el estado de un ticket o se produce un escalamiento |
| **Servicio de autenticación (Identity Provider)** | Sistema externo | Autentica a los usuarios; provee identidad y rol para control de acceso |
| **Almacenamiento de archivos (S3)** | Servicio cloud interno | Persiste adjuntos (capturas, logs, archivos de diagnóstico) asociados a tickets |

---

## 3. Casos de Uso Priorizados

### Criterios de prioridad
- **P0 — Crítico:** El sistema no funciona sin esto. Es el núcleo de la propuesta de valor.
- **P1 — Importante:** Agrega valor significativo; sin esto el sistema es limitado pero funciona.
- **P2 — Deseable:** Mejora la experiencia pero puede diferirse sin afectar el flujo principal.

---

**CU-01 · Abrir un ticket de incidente** `P0`

> _Como reportante, quiero registrar un incidente con título, descripción, severidad y adjuntos, para que el equipo de operaciones tenga el contexto necesario para resolverlo._

**Criterio de éxito:** El ticket queda creado con estado `Abierto`, número único asignado (`TKT-XXXX`), timestamp de creación, severidad seleccionada y adjuntos almacenados. El reportante recibe confirmación inmediata con el número de ticket.

---

**CU-02 · Clasificar y asignar un ticket** `P0`

> _Como agente de operaciones, quiero ver la cola de tickets abiertos ordenada por prioridad y asignar un ticket a un agente, para que cada incidente tenga un responsable claro._

**Criterio de éxito:** El ticket cambia a estado `En progreso`, queda asociado al agente asignado con timestamp. El reportante recibe notificación de que su ticket fue tomado e indica quién lo atiende.

---

**CU-03 · Actualizar estado y registrar resolución** `P0`

> _Como agente de operaciones, quiero actualizar el estado de un ticket y registrar la causa raíz y solución aplicada, para dejar trazabilidad completa del incidente._

**Criterio de éxito:** Cada cambio de estado queda registrado con autor, timestamp y comentario obligatorio. Al pasar a `Resuelto`, el campo de causa raíz y solución aplicada es requerido. El reportante recibe notificación automática.

---

**CU-04 · Escalamiento automático por SLA vencido** `P0`

> _Como sistema, quiero detectar tickets de alta prioridad que no han sido atendidos dentro del tiempo de SLA y escalarlos automáticamente al siguiente nivel, para garantizar que ningún incidente crítico quede sin respuesta._

**Criterio de éxito:** Transcurrido el umbral de SLA sin cambio de estado, el sistema reasigna el ticket al nivel de escalamiento siguiente y notifica al agente y al administrador. El evento queda registrado en el historial del ticket.

---

**CU-05 · Consultar historial y trazabilidad de un ticket** `P1`

> _Como reportante o agente, quiero ver el historial completo de un ticket (cambios de estado, comentarios, asignaciones, adjuntos), para entender qué pasó y cuándo._

**Criterio de éxito:** El historial muestra cada evento ordenado cronológicamente con autor, timestamp y descripción del cambio. Los adjuntos son accesibles desde el mismo historial.

---

**CU-06 · Filtrar y buscar tickets en la cola** `P1`

> _Como agente de operaciones, quiero filtrar la cola de tickets por estado, prioridad, categoría y agente asignado, para encontrar rápidamente los tickets relevantes sin revisar la lista completa._

**Criterio de éxito:** Los filtros combinados retornan resultados en menos de 2 segundos. El estado de los filtros aplicados se mantiene visible en la interfaz.

---

**CU-07 · Consultar reporte de resolución por período** `P2`

> _Como administrador, quiero ver un reporte de tickets resueltos en un período dado (cantidad, tiempo promedio de resolución, distribución por categoría y agente), para evaluar el desempeño del equipo._

**Criterio de éxito:** El reporte se genera para cualquier rango de fechas y muestra métricas agregadas. Puede descargarse como archivo.

---

**CU-08 · Abrir una solicitud de servicio (no incidente)** `P2`

> _Como reportante, quiero registrar una solicitud de servicio rutinaria (accesos, configuraciones, cambios no urgentes) separada de los incidentes, para que el equipo la atienda sin mezclarla con la cola de incidentes críticos._

**Criterio de éxito:** La solicitud se crea con tipo `Solicitud` y flujo diferenciado del incidente. Queda en una cola separada visible para los agentes.

---

## 4. Funcionalidades Específicas del Proyecto

Las siguientes funcionalidades definen lo concreto del sistema — no el enunciado genérico, sino las decisiones específicas que lo diferencian.

### 4.1 Creación de tickets con severidad y tipo
El formulario de creación exige clasificar cada reporte en dos dimensiones:
- **Tipo:** `Incidente` (algo que está roto) o `Solicitud` (algo que se necesita).
- **Severidad:** `Crítica`, `Alta`, `Media`, `Baja`.

La severidad, combinada con el tipo, determina la prioridad calculada automáticamente y el SLA aplicable. Cada ticket se crea con un número único autoincremental (`TKT-XXXX`), timestamp UTC y el ID del reportante extraído del token de autenticación.

### 4.2 Priorización automática basada en severidad y tipo
Al crear un ticket, el sistema calcula automáticamente su prioridad en la cola combinando tipo y severidad. Un incidente crítico siempre encabeza la cola sobre cualquier solicitud, independientemente de cuándo fue creado. Esta lógica corre en el backend — el agente ve la cola ya ordenada, sin triaging manual.

### 4.3 Escalamiento automático por SLA con múltiples niveles
Cada combinación tipo/severidad tiene un SLA de primera respuesta configurado por el administrador (ejemplo: incidente crítico → 15 minutos, incidente alto → 1 hora). Un proceso asíncrono revisa periódicamente los tickets abiertos sin actividad; cuando detecta un SLA vencido, cambia el nivel de escalamiento del ticket (L1 → L2 → L3), notifica al agente asignado y al administrador, y registra el evento en el historial.

### 4.4 Historial de eventos inmutable
Cada acción sobre un ticket (creación, cambio de estado, asignación, comentario, escalamiento, adjunto) genera un evento registrado con autor, timestamp UTC y descripción. Este historial no puede editarse ni eliminarse. Es la fuente de verdad para auditoría y postmortems.

### 4.5 Adjuntos asociados a tickets con acceso temporal seguro
Al crear o comentar un ticket, el reportante o agente puede adjuntar archivos (capturas de pantalla, logs, archivos de configuración). Los archivos se almacenan en S3, separados de los metadatos del ticket en base de datos. Cada adjunto se accede mediante una URL prefirmada con expiración para evitar acceso no autorizado permanente.

### 4.6 Notificaciones asíncronas por evento a múltiples canales
El sistema notifica por email y/o Slack (según preferencia del usuario) en los siguientes eventos: ticket creado, ticket asignado, cambio de estado, comentario agregado, y escalamiento disparado. Las notificaciones se envían de forma asíncrona — no bloquean la respuesta de la API.

### 4.7 Control de acceso por rol (RBAC)
Tres roles con permisos diferenciados:
- **Reportante:** puede crear tickets, ver y comentar sus propios tickets, consultar estado.
- **Agente:** puede ver toda la cola, asignar, cambiar estado, comentar cualquier ticket.
- **Administrador:** acceso completo más configuración de SLAs, categorías, usuarios y reportes.

Los permisos se validan en cada endpoint del API; el rol se extrae del token de autenticación.

---

## 5. Mapeo a conceptos del curso

La columna **Componente del curso** es la del programa de Infraestructura en la Nube. La columna **Cómo lo ejercita el Sistema de Tickets** conecta cada componente con la funcionalidad específica del proyecto (con referencia al caso de uso o sección de §4 que la origina).

| Componente del curso | Cómo lo ejercita el Sistema de Tickets |
|---|---|
| **Cómputo (API)** | API REST en contenedor (ECS Fargate). Endpoints principales: `POST /tickets` para crear incidente o solicitud (CU-01, CU-08), `PATCH /tickets/{id}/state` para cambio de estado y registro de resolución (CU-03), `POST /tickets/{id}/assign` para asignar agente (CU-02), `GET /tickets?filters=...` para la cola filtrada (CU-06). En cada endpoint se valida el rol extraído del token (§4.7). |
| **Base de datos** | RDS (PostgreSQL) con tablas: `tickets` (TKT-XXXX, tipo, severidad, prioridad calculada, estado, agente asignado, reportante, timestamps UTC), `ticket_events` para el historial inmutable (§4.4, CU-05) y `sla_rules` para la configuración de SLAs por tipo/severidad (§4.3). Queries optimizadas por estado y prioridad para la cola (CU-06) y por rango de fechas para los reportes (CU-07). |
| **Almacenamiento de archivos** | S3 para adjuntos de los tickets — capturas, logs y archivos de diagnóstico (§4.5). Los archivos viven separados de los metadatos del ticket en RDS. El acceso se hace mediante URL prefirmada con expiración, evitando enlaces permanentes no autorizados. |
| **Procesamiento asíncrono** | SQS + worker para dos flujos: (a) envío asíncrono de notificaciones por email y Slack ante creación, asignación, cambio de estado, comentario y escalamiento — §4.6, sin bloquear la respuesta de la API; (b) job periódico que revisa tickets abiertos sin actividad y dispara el escalamiento automático L1 → L2 → L3 al vencer el SLA (§4.3, CU-04). |
| **Red** | VPC con capa pública (ALB + API + Frontend) y capa privada (RDS, SQS, workers). Los security groups restringen el acceso a RDS exclusivamente desde la API y los workers. La capa privada no tiene egreso público directo. |
| **Seguridad** | RBAC con tres roles — Reportante, Agente, Administrador (§4.7) — validado en cada endpoint a partir del JWT emitido por el IdP externo (§2 Actores de soporte). Los adjuntos se acceden solo mediante URL prefirmada con expiración (§4.5). El historial inmutable de eventos (§4.4) funciona como pista de auditoría de quién hizo qué y cuándo. |
| **Observabilidad** | Métricas: tickets abiertos por severidad, % de SLA cumplidos, tiempo promedio de resolución y tasa de escalamientos por día. Logs estructurados de cada evento registrado en `ticket_events`, con autor y timestamp UTC. Alarmas: tickets críticos sin asignar superando el umbral de SLA, escalamientos a L3 por encima de un umbral en 24h, latencia P95 de la API. Soporte directo a las métricas del reporte de CU-07. |

---

## 6. Scope y preguntas abiertas

Esta sección delimita explícitamente qué SÍ va a hacer el sistema en el alcance de los cursos y qué NO, y reconoce las decisiones que el equipo aún tiene pendientes para entregas posteriores. Sirve de referencia para evitar drift de alcance y para ser honesto sobre los unknowns que se resolverán en D2–D5.

### Dentro del scope

- Creación de tickets de **Incidente** y **Solicitud de servicio** con tipo, severidad y adjuntos (CU-01, CU-08, §4.1).
- **Priorización automática** en el backend combinando tipo y severidad — la cola ya le llega ordenada al agente (§4.2).
- **Asignación de tickets y cambio de estado**, con causa raíz y solución aplicada requeridos al resolver (CU-02, CU-03).
- **Filtrado y búsqueda** de la cola por estado, prioridad, categoría y agente asignado (CU-06).
- **Escalamiento automático L1 → L2 → L3** disparado por SLA vencido mediante un job asíncrono (§4.3, CU-04).
- **Historial inmutable** de eventos por ticket — creación, asignación, comentario, cambio de estado, escalamiento, adjuntos — con autor y timestamp UTC (§4.4, CU-05).
- **Adjuntos en S3** separados de los metadatos del ticket, accedidos mediante URL prefirmada con expiración (§4.5).
- **Notificaciones asíncronas** por email y Slack, sin bloquear la respuesta de la API (§4.6).
- **RBAC** con tres roles — Reportante, Agente, Administrador — validado en cada endpoint a partir del token (§4.7).
- **Reporte agregado** de tickets resueltos por periodo, con métricas y descarga en CSV (CU-07).
- **Configuración** de SLAs y reglas de escalamiento por parte del administrador (§4.3, §4.7).

### Fuera del scope

- **Integraciones con sistemas externos de paging u observabilidad** (PagerDuty, Datadog, New Relic). _Razón: agregan complejidad de integración externa sin ejercitar los componentes del curso._
- **Dashboard en tiempo real** con WebSockets o server-sent events. _Razón: introduce complejidad de infraestructura no justificada en esta fase; la cola se refresca por pull/polling._
- **Multi-tenant**: SLAs y catálogos diferenciados por cliente externo. _Razón: el contexto es una sola empresa interna, no es un producto SaaS multi-cliente._
- **Aplicación móvil nativa** (iOS/Android). _Razón: el público objetivo es interno (SRE/Ops/Admin) y trabaja en escritorio._
- **Integraciones bidireccionales con otros sistemas de tickets** (Jira, ServiceNow, Zendesk). _Razón: fuera del alcance del curso; mantener el sistema autocontenido._
- **Chatbot o asistente IA embebido** para auto-resolución de tickets. _Razón: no ejercita los componentes troncales del curso._
- **Motor de workflow configurable por el usuario** (BPMN, reglas custom). _Razón: la lógica de estados y escalamientos es fija y suficiente para el dominio._
- **Knowledge base o artículos relacionados** a tickets. _Razón: extiende el alcance hacia gestión de contenido, fuera del foco de operaciones._
- **Federación de identidades entre múltiples IdP**. _Razón: el sistema asume un único IdP corporativo (§2 Actores de soporte)._
- **Internacionalización (i18n)**. _Razón: la UI y los datos viven en español; no hay otras audiencias en esta fase._
- **Encuestas de satisfacción post-resolución** (CSAT/NPS). _Razón: no aporta a ejercitar los componentes del curso ni a los CUs priorizados._
- **Frontend productivo implementado en código**. _Razón: en esta entrega se entregan únicamente mockups low-fi (ver `docs/mockups/`); la implementación del FE no es parte del alcance del curso de Infraestructura._

### Preguntas abiertas

Decisiones que el equipo aún no ha tomado para esta entrega; cada una indica la entrega futura en la que se cerrará.

- **Motor de envío de email para las notificaciones (§4.6)**: SES, SendGrid o SMTP corporativo. Pendiente para D4 (Asíncrono + CD).
- **IdP concreto detrás del JWT (§2 Actores de soporte, §4.7)**: Cognito, Auth0, Keycloak interno o un IdP del cliente. Pendiente para D5 (Seguridad).
- **Versionado de la API**: prefijo `/v1/` en la ruta vs header `Accept-Version`. Pendiente para D2.
- **Política de retención de adjuntos en S3 (§4.5)**: días hasta archivado en Glacier y borrado definitivo. Pendiente para D2/D5.
- **Valores finales de SLA por tipo/severidad (§4.3)**: hoy hay ejemplos (crítica → 15 min, alta → 1h), pero los valores definitivos se ajustarán con feedback del equipo de Ops antes de D2.
- **Mecanismo del job de escalamiento (§4.3, CU-04)**: ECS Scheduled Task, cron en un worker permanente o EventBridge Scheduler. Pendiente para D4.
- **Tamaño inicial de la instancia RDS (§5 Base de datos)** y si arrancamos Single-AZ o Multi-AZ desde D2. Pendiente.
- **Concurrencia al cambiar estado o asignar (CU-02, CU-03)**: optimistic locking con columna `version` en `tickets` vs lock pesimista. Pendiente para D2.
- **Identificación del worker frente a la API interna (§4.6, §5 Seguridad)**: IAM role + SigV4 vs token interno rotado. Pendiente para D5.
- **Modelo de datos para las preferencias de notificación por usuario (§4.6)**: la funcionalidad las menciona pero el esquema (`user_preferences`, columnas, defaults) está sin definir. Pendiente para D2.

---

## 7. Mockups del frontend

Los 8 mockups low-fi del FE viven en [`docs/mockups/`](mockups/). Fueron generados con un MCP de IA generativa (Stitch) y editados por el equipo hasta cubrir los CUs priorizados; el estilo es wireframe en escala de grises (no producto pulido) y son editables para iteraciones posteriores.

| # | Mockup | Caso(s) de uso cubiertos | Actor |
|---|---|---|---|
| 1 | Login / Autenticación | Soporte a RBAC §4.7 | Todos los roles |
| 2 | Cola de tickets con filtros | CU-02 · CU-06 | Agente / SRE |
| 3 | Crear ticket — Incidente | CU-01 | Reportante |
| 4 | Crear ticket — Solicitud de servicio | CU-08 | Reportante |
| 5 | Detalle de ticket + registrar resolución | CU-03 | Agente / SRE |
| 6 | Historial / timeline del ticket | CU-05 | Reportante y Agente |
| 7 | Tickets escalados por SLA | CU-04 | Administrador / Agente |
| 8 | Reportes de resolución por período | CU-07 | Administrador |

Ver [`docs/mockups/README.md`](mockups/README.md) para la descripción detallada de cada pantalla, los elementos UI por CU y el `projectId` de Stitch que permite regenerarlos o editarlos.

---

## Anexo IA

### Qué le pedimos a la IA
- Ayuda para estructurar el resumen ejecutivo a partir de las decisiones de dominio tomadas por el equipo.
- Generación de un primer borrador de los casos de uso con formato de user story.
- Sugerencia de funcionalidades específicas para un sistema de tickets orientado a incidentes de producción en empresa mediana.
- Revisión de consistencia entre actores, casos de uso y funcionalidades.
- Generación de **mockups low-fi** del frontend (8 pantallas) a partir de los CUs priorizados, usando un MCP de IA generativa (Stitch).
- Borrador inicial de la tabla **§5 Mapeo a conceptos del curso** a partir del listado oficial de componentes (Cómputo, Base de datos, Almacenamiento, Asíncrono, Red, Seguridad, Observabilidad).
- Borrador inicial de la sección **§6 Scope (in/out)** con propuestas de inclusiones y exclusiones razonables para el dominio.

### Qué aceptamos y editamos
- El resumen ejecutivo fue generado con IA y editado para reflejar el contexto específico de empresa mediana (50–200 ingenieros) y el foco en trazabilidad y priorización como problemas centrales.
- Las user stories fueron generadas como borrador y ajustadas para que los criterios de éxito fueran verificables y concretos, no genéricos.
- La tabla de mapeo a conceptos del curso fue sugerida por IA y editada para incluir los servicios AWS específicos (ECS Fargate, RDS, SQS, S3) que el equipo ya había decidido en el contexto del curso de Automatización.
- Los 8 mockups generados con Stitch fueron **revisados pantalla por pantalla** por el equipo: validamos que cada uno mostrara los elementos UI requeridos por el criterio de éxito del CU correspondiente (campos "Causa raíz" y "Solución aplicada" requeridos en el detalle de resolución, badge de "SLA vencido" en la cola, niveles L1/L2/L3 visibles en la vista de escalamiento, KPI cards y descarga CSV en el reporte). Editamos los prompts iterativamente hasta alcanzar consistencia visual entre las 8 pantallas reutilizando un mismo design system.
- La tabla de §5 Mapeo a conceptos del curso fue **verificada celda por celda** para asegurar que cada componente del curso quedara conectado a una funcionalidad concreta del sistema con referencia a su CU o sección §4 de origen; no se permitió texto genérico.
- La sección §6 Scope (in/out) fue **editada** para: (a) trazar cada bullet de "Dentro del scope" a un CU o §4.x existente, evitando inflar el alcance con funcionalidades no comprometidas; (b) agregar una razón corta a cada exclusión del "Fuera del scope" para que el criterio quede documentado, y (c) extender el listado del "out" con exclusiones que la IA no había propuesto inicialmente (frontend productivo en código, federación multi-IdP, i18n, encuestas CSAT/NPS) pero que el equipo identificó al revisar contra los entregables del curso.

### Qué descartamos y por qué
- La IA propuso integración con PagerDuty y Datadog como funcionalidades dentro del scope. Lo descartamos porque agrega complejidad de integración externa sin ejercitar los componentes del curso — se movió explícitamente al out-of-scope.
- La IA sugirió un caso de uso de dashboard en tiempo real con WebSockets. Lo descartamos porque introduce complejidad de infraestructura no justificada por el dominio en esta fase.
- La IA propuso SLAs diferenciados por cliente. Lo descartamos porque el contexto es una empresa interna con una sola organización; no es un producto multi-tenant.
- La IA propuso una **knowledge base** de artículos relacionados a tickets como funcionalidad adicional. La descartamos porque extiende el alcance hacia gestión de contenido, fuera del foco de operaciones del curso; quedó listada explícitamente en "Fuera del scope" (§6).
- La IA inicialmente generó mockups con estética semi-realista (colores, sombras, look pulido). Los descartamos y ajustamos los prompts para forzar un estilo **wireframe low-fi en escala de grises**, alineado con la consigna de la entrega ("mockups low-fi que pueden generarse con IA y editarse después").
- La IA sugirió incorporar **encuestas de satisfacción post-resolución** (CSAT/NPS) como parte del reporte (CU-07). Las descartamos porque no ejercitan los componentes troncales del curso ni aportan a ningún CU priorizado; quedaron también listadas en "Fuera del scope" (§6).
