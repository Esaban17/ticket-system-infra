# Backlog — Sistema de Tickets e Incidentes
**Universidad Galileo · Postgrado en Diseño y Desarrollo de Software · Infraestructura en la Nube**
**Ciclo Mayo–Junio 2026**

**Equipo:**
- Luis André Morales
- Erick Estuardo Saban

---

## 1. Propósito y alcance del backlog

Este backlog cubre todo el trabajo pendiente del proyecto Sistema de Tickets e Incidentes desde el cierre de E2 hasta el final del ciclo. Incluye tanto los entregables académicos de D3 (Red), D4 (Asíncrono) y D5 (Seguridad) como el desarrollo de la aplicación (API y workers) que no es entrega-específico pero se debe construir para que el sistema sea demostrable.

Naturaleza del backlog: **vivo**. Los items pueden re-priorizarse, partirse o cerrarse conforme avanzan las entregas. La columna "Estado" se agrega cuando un item entra en flight (no se incluye desde el inicio para no llenar de `por hacer`).

Fue generado por coordinación entre tres agentes:
- **`ticket-system-pm`** — estructura, épicas, división de trabajo, riesgos.
- **`staff-engineer`** — detalle de items de desarrollo de aplicación (rango `BL-001` a `BL-099`).
- **`aws-architect`** — detalle de items de infraestructura AWS y despliegue (rango `BL-101` a `BL-199`).

---

## 2. Convenciones

### Formato de cada item

Cada item se documenta como una tabla con los campos:

| Campo | Valor |
|---|---|
| **ID** | `BL-XXX` — correlativo dentro del rango asignado al área |
| **Área** | `dev` · `infra` · `mixto` · `docs` |
| **Entrega** | `D3` · `D4` · `D5` · `transversal` |
| **Componente curso** | Cómputo · BD · Almacenamiento · Asíncrono · Red · Seguridad · Observabilidad · DevOps · (varios separados por `+`) |
| **CUs** | CU-XX (separados por coma) — vacío si es enabler puro |
| **Qs que cierra** | Q1..Q10 (separadas por coma) — vacío si no aplica |
| **Owner sugerido** | `Estuardo` · `Luis André` · `pareo` |
| **Tamaño** | `XS` (<2h) · `S` (medio día) · `M` (1 día) · `L` (2-3 días) |
| **Depende de** | IDs de otros items o `—` |

Cada item lleva una **descripción** corta (2-4 líneas: qué construir y por qué) y una **definición de listo** con bullets verificables (test pasa, endpoint responde, recurso visible, etc.).

> Regla: no debe quedar ningún item XL en el backlog final. Si aparece uno, se parte.

### Rangos de ID

- `BL-001` a `BL-099` — items de desarrollo de aplicación (staff-engineer)
- `BL-101` a `BL-199` — items de infraestructura AWS / despliegue (aws-architect)

---

## 3. Estado actual del proyecto (al 2026-05-26)

| Hito | Estado |
|---|---|
| E1 — Diseño y scope | Entregado |
| E2 — Cómputo y datos | Entregado (cambios: EKS para API en lugar de Fargate, Lambda para worker) |
| D3 — Red | **Siguiente** |
| D4 — Asíncrono | Pendiente |
| D5 — Seguridad | Pendiente |

**Infra ya provisionada (verificada en repo):** módulos `compute/`, `database/`, `storage/`, `eks/`, envs `dev` y `prod`, backend remoto Terraform configurado en `infra/backend.tf` con state en S3 y lock en DynamoDB. Red **todavía usa la default VPC como placeholder** — eso es justamente trabajo central de D3.

**Aplicación:** sin código de la API ni de los workers todavía. EP-01 y EP-02 son punto de partida.

---

## 4. Lista priorizada de épicas

Orden = secuencia recomendada de ataque, no estricta. Dependencias explícitas en columna correspondiente.

| # | Épica | Naturaleza | Entrega(s) | CUs ejercita | Qs que ayuda a cerrar | Depende de |
|---|---|---|---|---|---|---|
| **EP-01** | API REST esqueleto: framework, healthcheck, versionado, contenedor | dev + infra | transversal · habilita D3 | — (enabler) | **Q3** (versionado) | — |
| **EP-02** | Persistencia y migraciones: ORM/SQL, migraciones de las 4 tablas de E2, seeds de SLA | dev | transversal · habilita D3 | CU-01..08 | Q5 (valores SLA via seed), Q8 (estrategia concurrencia) | EP-01 |
| **EP-03** | CU-01 + CU-08: creación de tickets (incidente y solicitud) con priorización automática | dev | transversal | CU-01, CU-08 | — | EP-02 |
| **EP-04** | CU-02 + CU-03: clasificación, asignación, cambio de estado, resolución (con historial inmutable) | dev | transversal | CU-02, CU-03, CU-05 | Q8 (concurrencia optimista vs pesimista) | EP-03 |
| **EP-05** | CU-05 + CU-06: consulta de historial, filtros y búsqueda de cola | dev | transversal | CU-05, CU-06 | — | EP-04 |
| **EP-06** | Adjuntos S3 con URL prefirmada (upload + download) | mixto | transversal · refuerza D5 | CU-01, CU-05 | Q4 (retención S3) | EP-03, módulo storage existente |
| **EP-07** | RBAC: middleware JWT, matriz de permisos por endpoint | dev | transversal · cierra en D5 | todos | Q2 (IdP), Q9 (worker→API) | EP-01 |
| **EP-08** | Red — VPC dedicada, subnets pública/privada, ALB, security groups | infra | **D3** | — | (cierra preguntas E3 abiertas en E2) | módulos EKS/RDS existentes |
| **EP-09** | Exponer API por ALB Ingress (EKS), mover RDS y Lambda a subnets privadas, SGs por capa | infra | **D3** | — | — | EP-08 |
| **EP-10** | Mensajería asíncrona — SQS (main + DLQ) y wiring Lambda como event source | infra | **D4** | CU-04, notificaciones | — | EP-09 |
| **EP-11** | CU-04: job de escalamiento por SLA — Lambda, idempotente, EventBridge Scheduler vs SQS-driven | mixto | **D4** | CU-04 | **Q6**, Q8 (idempotencia) | EP-10, EP-04 |
| **EP-12** | Worker de notificaciones: email + Slack opcional, integración SES/SMTP | mixto | **D4** | notificaciones de CU-01..04 | **Q1** (motor email) | EP-10 |
| **EP-13** | CU-07: reporte de tickets resueltos por período + export CSV | dev | transversal (presentable en D4) | CU-07 | — | EP-04 |
| **EP-14** | Seguridad — integración IdP real, validación JWT, RBAC en producción | mixto | **D5** | todos | **Q2**, Q9 | EP-07, EP-08 |
| **EP-15** | Gestión de secretos — Secrets Manager para RDS, webhooks, JWKS | infra | **D5** | — | — | EP-14 |
| **EP-16** | Lifecycle y retención de adjuntos S3 (Glacier, expiración) | infra | **D5** | CU-01, CU-05 | **Q4** | EP-06 |
| **EP-17** | Identidad worker→API interna (SigV4 vs token rotado) | mixto | **D5** | CU-04 | **Q9** | EP-11, EP-14 |
| **EP-18** | Observabilidad — métricas, logs estructurados, dashboards, alarmas | mixto | transversal · presentable en D4/D5 | todos | — | EP-04, EP-11 |
| **EP-19** | CI/CD — pipeline de build, test, deploy de API e infra | infra | transversal | — | — | EP-01, EP-08 |
| **EP-20** | Documentación de entregas D3, D4, D5 (incluye anexo IA, RFCs, ADRs) | docs | D3, D4, D5 | — | varias (formaliza cierres) | cada épica de su entrega |

### Cobertura de componentes del curso

| Componente | Épica(s) principales |
|---|---|
| Cómputo | EP-01, EP-09 (deploy EKS), EP-11/EP-12 (Lambda) |
| Base de datos | EP-02, EP-04 (concurrencia), EP-13 |
| Almacenamiento | EP-06, EP-16 |
| Asíncrono | EP-10, EP-11, EP-12 |
| Red | EP-08, EP-09 |
| Seguridad | EP-07, EP-14, EP-15, EP-17 |
| Observabilidad | EP-18 |

Cobertura completa; ningún componente queda sin épica.

---

## 5. Items detallados por épica

### Épica EP-01 — API REST esqueleto

#### BL-001 — Decidir stack de la API y arrancar esqueleto

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D3 |
| Componente curso | Cómputo |
| CUs | — |
| Qs que cierra | — |
| Owner | pareo (Luis André + Estuardo) |
| Tamaño | S |
| Depende de | — |

**Descripción.** Elegir lenguaje/framework entre Python+FastAPI y Node+NestJS, dejar registrada la decisión en `docs/decisiones.md` con criterios (curva del equipo, ecosistema ORM/JWT, soporte Lambda para los workers), y crear el proyecto base en `app/` con estructura de carpetas, linter, formatter y archivo de configuración por entorno.

**Definición de listo:**
- `docs/decisiones.md` contiene la decisión con 3-5 criterios y trade-offs aceptados.
- Repositorio `app/` arranca localmente con un comando documentado en README.
- Linter y formatter corren en CI (job dedicado) y fallan ante violaciones.
- Estructura de carpetas separa `routes/handlers`, `services`, `repositories`, `schemas`, `middlewares`, `workers`.

---

#### BL-002 — Endpoint healthcheck `/healthz` y `/readyz`

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D3 |
| Componente curso | Cómputo |
| CUs | — |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | XS |
| Depende de | BL-001 |

**Descripción.** Dos endpoints separados: `/healthz` responde 200 si el proceso está vivo (sin tocar dependencias) para que el target group del ALB no marque unhealthy por una BD caída; `/readyz` valida conexión a Postgres y devuelve 503 si falla, para que k8s/ALB no enrute tráfico durante warm-up.

**Definición de listo:**
- `GET /healthz` responde 200 con `{ "status": "ok" }` sin tocar BD.
- `GET /readyz` ejecuta `SELECT 1` con timeout de 2s; 200 si OK, 503 si falla.
- Ambos endpoints no requieren JWT.
- Test de integración cubre ambos casos (BD up y BD down vía fake/mock del cliente).

---

#### BL-003 — Cerrar Q3 versionado de API en `/v1/`

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D3 |
| Componente curso | Cómputo |
| CUs | — |
| Qs que cierra | Q3 |
| Owner | Estuardo |
| Tamaño | XS |
| Depende de | BL-001 |

**Descripción.** Cerrar Q3 documentando que se usa versionado por prefijo de path `/v1/` para todos los endpoints de negocio, dejando fuera los de salud (`/healthz`, `/readyz`). Rationale: simple de operar en ALB y CloudFront, debuggeable en logs, y no fuerza a clientes a manejar headers custom.

**Definición de listo:**
- Q3 cerrada en `docs/preguntas-abiertas.md` con la decisión y rationale (2-3 líneas).
- Router base monta todos los endpoints de negocio bajo `/v1/`.
- `/healthz` y `/readyz` quedan fuera del prefijo, documentado en README.

---

#### BL-004 — Empaquetado de la API en contenedor productivo

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D3 |
| Componente curso | Cómputo |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | BL-001 |

**Descripción.** Dockerfile multi-stage para la API, imagen mínima (distroless o slim), usuario no-root, healthcheck embebido, y workflow de build/push a ECR. La imagen debe arrancar leyendo configuración 100% de variables de entorno, sin archivos `.env` empacados.

**Definición de listo:**
- Dockerfile multi-stage produce imagen final sin compiladores ni herramientas de build.
- Contenedor corre como UID no-root.
- Imagen no contiene archivos con secrets ni `.env`.
- Pipeline CI builda y pushea a ECR en cada merge a `main`.
- Imagen arranca con `docker run -e DATABASE_URL=... -p 8080:8080 <image>` y responde a `/healthz`.

---

#### BL-005 — Manejador global de errores con formato Problem Details

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D3 |
| Componente curso | Cómputo |
| CUs | — |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | S |
| Depende de | BL-001 |

**Descripción.** Middleware/exception handler global que captura errores de validación, autorización, conflicto de estado y errores no esperados, y los convierte a respuestas RFC 7807 (`type`, `title`, `status`, `detail`, `instance`, `request_id`). Nunca expone stack traces; en 5xx loguea el error con el `request_id` para correlación.

**Definición de listo:**
- Errores de validación devuelven 400 con `type=validation-error` y lista de campos inválidos.
- Errores de autorización devuelven 403 con `type=forbidden`.
- Conflictos de estado/version devuelven 409 con `type=conflict`.
- Errores no esperados devuelven 500 genérico, sin stack trace en el body.
- Cada respuesta de error incluye `request_id` y el log del backend correlaciona por ese ID.
- Test cubre los 5 tipos de error.

---

#### BL-101 — Crear repositorio ECR para la imagen de la API

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D4 |
| Componente curso | Cómputo / Contenedores |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | — |

**Descripción.** Provisionar un repo ECR privado `ticket-system-api` con scan-on-push habilitado, immutable tags y lifecycle policy que retenga las últimas 10 imágenes para no acumular costo. Va en un nuevo módulo `infra/modules/registry/` para no contaminar `compute/` (que hoy es Lambda).

**Definición de listo:**
- `terraform apply` crea repo ECR visible en consola con `image_tag_mutability = IMMUTABLE` y `scan_on_push = true`.
- Lifecycle policy aplicada: máx 10 imágenes `tagged`, expirar `untagged` a 7 días.
- Output `ecr_repository_url` consumido desde root module.
- `aws ecr describe-repositories` desde CLI devuelve el repo.

---

#### BL-102 — Dockerfile productivo de la API y push inicial a ECR

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D4 |
| Componente curso | Cómputo / Contenedores |
| CUs | — |
| Qs que cierra | — |
| Owner | pareo (staff-engineer entrega app base, Estuardo el Dockerfile) |
| Tamaño | S |
| Depende de | BL-101 |

**Descripción.** Dockerfile multi-stage (builder + runtime distroless o slim) para la API. Imagen no-root, healthcheck definido, expone puerto 8080. Primera imagen pusheada con tag `bootstrap` para validar el pipeline de despliegue antes de tener app real.

**Definición de listo:**
- `docker build` produce imagen <300 MB.
- Contenedor corre como UID no-root verificable con `docker inspect`.
- `docker push` exitoso a ECR; tag visible en consola.
- README de la app documenta el comando de build.

---

#### BL-103 — Helm chart base para la API en EKS

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D4 |
| Componente curso | Cómputo / Despliegue |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-102, BL-111 |

**Descripción.** Chart en `deploy/charts/api/` con `Deployment` (2 réplicas en prod, 1 en dev), `Service` ClusterIP, `ServiceAccount` con anotación IRSA, `HorizontalPodAutoscaler` (CPU 70%, min 1 max 3), `PodDisruptionBudget`. Valores parametrizados por env: `values-dev.yaml`, `values-prod.yaml`.

**Definición de listo:**
- `helm lint` pasa sin warnings.
- `helm template` produce manifests válidos contra el schema de Kubernetes 1.30.
- `helm install` en cluster dev levanta pod READY 1/1.
- HPA visible con `kubectl get hpa`.

---

#### BL-104 — IRSA: rol IAM para la API en EKS

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D4 |
| Componente curso | Seguridad / IAM |
| CUs | CU-06, CU-07 |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | BL-103 |

**Descripción.** Crear `aws_iam_role` para la API con trust policy hacia el OIDC provider del EKS, vinculado al `ServiceAccount` del chart. Permisos least-privilege: `s3:PutObject/GetObject` solo sobre el bucket de attachments, `sqs:SendMessage` solo sobre la cola main, `secretsmanager:GetSecretValue` sobre los ARNs de secretos de la API.

**Definición de listo:**
- OIDC provider del EKS habilitado (`aws_iam_openid_connect_provider`).
- Trust policy del role limita `sub` al SA `api-sa` en namespace `ticket-system`.
- Pod corriendo monta credenciales temporales: `aws sts get-caller-identity` desde el pod devuelve el role asumido.
- Política denegada por defecto sobre cualquier recurso no listado (verificable con IAM Access Analyzer policy check).

---

### Épica EP-02 — Persistencia y migraciones

#### BL-006 — Seleccionar ORM/query-builder y configurar conexión a Postgres

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D3 |
| Componente curso | BD |
| CUs | — |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | S |
| Depende de | BL-001 |

**Descripción.** Elegir ORM (SQLAlchemy si FastAPI; TypeORM/Prisma si NestJS) o query-builder, configurar pool de conexiones con tamaños explícitos, `statement_timeout` por sesión, y modo TLS requerido al conectar a RDS. Documentar la decisión en `docs/decisiones.md`.

**Definición de listo:**
- ORM/query-builder integrado, con un repositorio de ejemplo (`UserRepository`) que ejecuta una query parametrizada.
- Pool configurado vía env vars (`DB_POOL_MIN`, `DB_POOL_MAX`, defaults razonables).
- `statement_timeout` configurado a 5s a nivel de sesión.
- Conexión a RDS exige TLS (`sslmode=require` o equivalente).
- Test de integración levanta Postgres en contenedor y ejecuta el repositorio de ejemplo.

---

#### BL-007 — Migración inicial: tabla `users`

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D3 |
| Componente curso | BD |
| CUs | — |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | S |
| Depende de | BL-006 |

**Descripción.** Migración que crea `users` con los campos del modelo E2: `id` (UUID PK), `email` UNIQUE, `role` (enum: reportante/agente/administrador), `notify_email` BOOL, `notify_slack` BOOL, `slack_user_id` nullable, `created_at`, `updated_at` con `TIMESTAMPTZ`. Constraints CHECK donde aplique.

**Definición de listo:**
- Migración aplicada en BD local y rollback funciona.
- `email` con UNIQUE y NOT NULL.
- `role` como enum Postgres o CHECK constraint contra lista cerrada.
- Timestamps en `TIMESTAMPTZ` con default `now()`.
- Trigger o lógica de aplicación actualiza `updated_at` automáticamente.

---

#### BL-008 — Migración: tabla `tickets` con índices base

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D3 |
| Componente curso | BD |
| CUs | CU-01, CU-02, CU-06 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | M |
| Depende de | BL-007 |

**Descripción.** Migración que crea `tickets` con todos los campos del modelo E2: `id` UUID PK, `ticket_number` (cadena `TKT-XXXX` generada por sequence), `type`, `title`, `description`, `severity`, `impact`, `priority` (calculada), `status`, `reporter_id` FK, `assignee_id` FK nullable, `escalation_level` INT, `sla_due_at` TIMESTAMPTZ, `version` INT NOT NULL DEFAULT 0, `root_cause`, `solution`, `resolved_at`, `created_at`, `updated_at`.

**Definición de listo:**
- Migración aplica y revierte limpiamente.
- `ticket_number` UNIQUE; sequence dedicada genera el siguiente número formateado `TKT-XXXX`.
- FKs a `users` con `ON DELETE RESTRICT`.
- CHECK constraint en `status` contra lista cerrada (abierto/en_progreso/resuelto).
- CHECK constraint que `resolved_at`, `root_cause` y `solution` son NOT NULL cuando `status='resuelto'`.
- Índices creados: `(status, priority DESC, created_at)`, `(assignee_id, status)`, `(reporter_id)`, `(sla_due_at) WHERE status != 'resuelto'`.

---

#### BL-009 — Migración: tabla `ticket_events` append-only

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D3 |
| Componente curso | BD |
| CUs | CU-05 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | S |
| Depende de | BL-008 |

**Descripción.** Migración que crea `ticket_events` con `id` UUID PK, `ticket_id` FK, `actor_id` FK a `users`, `event_type` (asignacion, cambio_estado, comentario, escalamiento, adjunto, etc.), `payload` JSONB, `created_at` TIMESTAMPTZ. Append-only: el rol de aplicación solo recibe INSERT/SELECT.

**Definición de listo:**
- Migración aplica y revierte.
- Índice `(ticket_id, created_at)` para listar el historial.
- Migración incluye `REVOKE UPDATE, DELETE ON ticket_events FROM <app_role>` y `GRANT SELECT, INSERT`.
- Test de integración verifica que un `UPDATE` desde el rol de la app falla con error de permiso.

---

#### BL-010 — Migración: tabla `sla_rules` con seeds

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D3 |
| Componente curso | BD |
| CUs | — |
| Qs que cierra | Q5 (parcial — depende de los valores acordados con el PM) |
| Owner | Luis André |
| Tamaño | S |
| Depende de | BL-008 |

**Descripción.** Migración que crea `sla_rules` con `id`, `priority` (enum), `time_to_assign_minutes`, `time_to_resolve_minutes`, `escalation_l1_minutes`, `escalation_l2_minutes`, `active` BOOL, timestamps. Migración separada con seeds iniciales para las 4 prioridades (crítica, alta, media, baja) con valores acordados con el PM.

**Definición de listo:**
- Migración crea la tabla con CHECK en prioridad.
- Migración de seeds idempotente (UPSERT por `priority`) carga las 4 prioridades.
- Reaplicar la migración de seeds no duplica filas.
- Valores de SLA documentados en comentario de la migración.

---

#### BL-011 — Pipeline de migraciones automatizado

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D3 |
| Componente curso | BD |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | BL-006 |

**Descripción.** Job de CI que aplica migraciones contra Postgres efímero y corre los tests de integración. Documentar el procedimiento para correr migraciones contra RDS (job manual de GitHub Actions o tarea ECS), no como parte del arranque de la API.

**Definición de listo:**
- Workflow CI levanta Postgres, aplica todas las migraciones de cero, y corre tests.
- README documenta cómo aplicar migraciones contra RDS sin acoplarlas al startup de la API.
- Comando documentado para hacer rollback de la última migración.

---

### Épica EP-03 — Creación de tickets y priorización (CU-01, CU-08)

#### BL-012 — Schema de request y validación para creación de tickets

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D4 |
| Componente curso | Cómputo |
| CUs | CU-01, CU-08 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | S |
| Depende de | BL-005 |

**Descripción.** Schema de validación (zod/pydantic) para `POST /v1/tickets`: campos `type` (incidente/solicitud), `title` (min 5 max 200), `description` (min 20 max 5000), `severity` (1-4), `impact` (1-4), `attachments` opcional (lista de IDs pre-subidos). Rechazar strings vacíos disfrazados (`"."`, `"n/a"`), normalizar espacios.

**Definición de listo:**
- Schema rechaza `title` < 5 chars con 400 y mensaje claro del campo.
- Schema rechaza strings que parsean a vacíos después de trim.
- `type` solo acepta `"incidente"` o `"solicitud"`.
- Test unitario cubre 8+ casos de validación (uno por regla).

---

#### BL-013 — Función pura de cálculo de prioridad

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D4 |
| Componente curso | Cómputo |
| CUs | CU-01, CU-08 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | XS |
| Depende de | BL-012 |

**Descripción.** Función pura `calculatePriority(severity, impact) -> priority` que implementa la matriz acordada (típicamente severity 1-4 × impact 1-4 → critical/high/medium/low). Función separada y testeable sin necesidad de mocks ni BD.

**Definición de listo:**
- Función exportada desde un módulo `services/priority.ts` (o equivalente).
- Tabla parametrizada de tests cubre las 16 combinaciones.
- Función pura: misma entrada produce misma salida, sin side effects.

---

#### BL-014 — Endpoint `POST /v1/tickets` con idempotency-key

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D4 |
| Componente curso | Cómputo |
| CUs | CU-01, CU-08 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | M |
| Depende de | BL-012, BL-013, BL-008, BL-010, BL-027 |

**Descripción.** Handler que crea ticket: valida payload, calcula prioridad, lee SLA de `sla_rules` por prioridad, calcula `sla_due_at`, persiste `tickets` con `escalation_level=0`, persiste evento `ticket_creado` en `ticket_events`, y devuelve 201 con `Location: /v1/tickets/{ticket_number}`. Acepta header `Idempotency-Key`: si llega el mismo key dos veces en una ventana de 24h, devuelve el ticket ya creado sin duplicar.

**Definición de listo:**
- 201 Created con body del ticket y header `Location`.
- Sin `Idempotency-Key`, dos POSTs idénticos crean dos tickets distintos.
- Con `Idempotency-Key` repetido, segundo POST devuelve 200 (o 201) con el mismo `ticket_number`.
- Creación de `tickets` + `ticket_events` en una transacción.
- Test verifica que el evento de creación queda registrado con `actor_id` igual al usuario del JWT.
- Reportante autenticado solo puede crear como su propio `reporter_id` (validado en handler).

---

#### BL-015 — Asociar adjuntos pre-subidos al ticket en la creación

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D4 |
| Componente curso | Almacenamiento |
| CUs | CU-01 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | S |
| Depende de | BL-014, BL-024 |

**Descripción.** Cuando el request trae `attachments: [id1, id2]`, validar que esos IDs existen como uploads pendientes del mismo usuario (tabla `attachments` con estado `pending`), marcarlos como `attached` apuntando al ticket, y registrar evento `adjunto_agregado` por cada uno.

**Definición de listo:**
- Adjuntos cuyo `uploader_id` != usuario actual son rechazados con 403.
- Adjuntos ya asociados a otro ticket son rechazados con 409.
- Asociación corre dentro de la misma transacción del ticket; si falla, el ticket no se crea.
- Cada adjunto asociado genera un evento en `ticket_events`.

---

### Épica EP-04 — Asignación, cambio de estado y resolución (CU-02, CU-03)

#### BL-016 — RFC Q8 estrategia de concurrencia

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D3 |
| Componente curso | BD |
| CUs | CU-02, CU-03 |
| Qs que cierra | Q8 |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | — |

**Descripción.** RFC corto (1-2 páginas) en `docs/rfcs/Q8-concurrencia.md` comparando optimistic locking con columna `version` vs `SELECT FOR UPDATE`. Recomendación: optimistic con `version` por throughput y porque las colisiones reales son raras (dos agentes asignándose el mismo ticket simultáneamente). Definir el flujo cliente: en 409, refetch + reintento con el `version` nuevo.

**Definición de listo:**
- RFC publicado en `docs/rfcs/Q8-concurrencia.md`.
- Compara las 2 alternativas con 3-4 criterios (throughput, complejidad, manejo cliente, riesgo deadlock).
- Decisión final escrita con rationale.
- Q8 marcada como cerrada en `docs/preguntas-abiertas.md`.

---

#### BL-017 — Máquina de estados de ticket como función pura

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D4 |
| Componente curso | Cómputo |
| CUs | CU-02, CU-03 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | S |
| Depende de | BL-001 |

**Descripción.** Módulo `services/ticket-state-machine` con función pura `canTransition(currentState, nextState, role) -> {ok: bool, reason?: string}`. Transiciones válidas: abierto → en_progreso (agente/admin con asignee), en_progreso → resuelto (asignee con root_cause + solution), abierto → resuelto (admin con override registrado).

**Definición de listo:**
- Función pura sin acceso a BD ni red.
- Test cubre transiciones válidas y al menos 5 inválidas (resuelto → abierto, abierto → abierto, sin permiso, etc.).
- Función devuelve `reason` legible para que el handler lo use en el body 409/422.

---

#### BL-018 — Endpoint `POST /v1/tickets/{id}/assign`

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D4 |
| Componente curso | Cómputo |
| CUs | CU-02 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | M |
| Depende de | BL-008, BL-027, BL-016 |

**Descripción.** Handler que asigna el ticket a un agente: valida que `assignee_id` tenga rol agente o admin, ejecuta `UPDATE tickets SET assignee_id=?, version=version+1 WHERE id=? AND version=?` y comprueba filas afectadas. Si 0 filas → 409 con `conflict-version`. Registrar evento `asignacion` con `from_assignee_id` y `to_assignee_id` en payload.

**Definición de listo:**
- Body acepta `assignee_id` y `expected_version`.
- 0 filas afectadas devuelve 409 con Problem Details.
- Evento `asignacion` registrado con el cambio en payload.
- Reportante no puede llamar este endpoint (403).
- Test de concurrencia: dos requests simultáneas con el mismo `expected_version` resultan en exactamente una exitosa y una 409.

---

#### BL-019 — Endpoint `PATCH /v1/tickets/{id}/state` para iniciar trabajo

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D4 |
| Componente curso | Cómputo |
| CUs | CU-02 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | S |
| Depende de | BL-017, BL-018 |

**Descripción.** Transición abierto → en_progreso. Solo el `assignee_id` o admin pueden iniciar. Valida con la máquina de estados, hace UPDATE con check de `version`, registra evento `cambio_estado`.

**Definición de listo:**
- Si quien llama no es asignee ni admin, 403.
- Si el ticket no tiene asignee, 422 con `assignee-required`.
- Transición inválida (ej. resuelto → en_progreso) devuelve 422.
- Conflicto de version devuelve 409.
- Evento `cambio_estado` registrado con `from_state` y `to_state` en payload.

---

#### BL-020 — Endpoint `PATCH /v1/tickets/{id}/state` para resolver (CU-03)

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D4 |
| Componente curso | Cómputo |
| CUs | CU-03 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | M |
| Depende de | BL-019 |

**Descripción.** Transición en_progreso → resuelto. Schema exige `root_cause` (min 20 chars sin strings vacíos disfrazados) y `solution` (min 20 chars). Setea `resolved_at = now()`, recalcula nada de SLA. Registra evento `resolucion` con causa y solución en payload (útil para reportes y reapertura futura).

**Definición de listo:**
- Resolución sin `root_cause` o `solution` rechazada con 400 antes de tocar BD.
- `root_cause` con valor `"n/a"`, `"."`, o solo whitespace rechazado con mensaje específico.
- `resolved_at` queda como `TIMESTAMPTZ` en UTC.
- Evento `resolucion` queda con `root_cause`, `solution` y `resolved_by` en payload.
- Solo asignee o admin pueden resolver (403 al resto).

---

#### BL-021 — Test de concurrencia end-to-end del optimistic locking

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D4 |
| Componente curso | BD |
| CUs | CU-02, CU-03 |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | BL-018, BL-020 |

**Descripción.** Test de integración que dispara N=20 requests concurrentes al mismo ticket (assign + state change), verifica que solo una commitea por iteración y el resto devuelve 409, y que `ticket_events` no queda con eventos contradictorios ni duplicados.

**Definición de listo:**
- Test ejecuta 20 requests concurrentes y verifica exactamente 1 éxito y 19 conflictos.
- `version` final del ticket es coherente con el número de updates exitosos.
- Test corre en CI en menos de 30 segundos.

---

### Épica EP-05 — Historial, filtros y búsqueda (CU-05, CU-06)

#### BL-022 — Endpoint `GET /v1/tickets/{id}/events`

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D4 |
| Componente curso | BD |
| CUs | CU-05 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | S |
| Depende de | BL-009, BL-027 |

**Descripción.** Lista paginada del historial de un ticket, orden cronológico ascendente. Cada evento incluye `actor` (id + email + rol), `event_type`, `payload`, `created_at`. Reportante solo puede ver eventos de tickets donde es `reporter_id`; agente y admin ven todos.

**Definición de listo:**
- Paginación cursor-based con `?cursor=...&limit=` (max 100).
- Reportante intentando ver historial ajeno recibe 404 (no 403, para no filtrar existencia).
- Query usa índice `(ticket_id, created_at)` (verificado con `EXPLAIN`).
- Test cubre los 3 roles.

---

#### BL-023 — Endpoint `GET /v1/tickets` con filtros, búsqueda y paginación

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D4 |
| Componente curso | BD |
| CUs | CU-06 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | M |
| Depende de | BL-008, BL-027 |

**Descripción.** Lista cola de tickets con filtros: `status`, `priority`, `assignee_id` (con valor especial `me`), `severity`, `created_from`, `created_to`, `q` (búsqueda full-text en title + description). Paginación cursor-based, orden default `priority DESC, created_at ASC`. Reportante: filtro implícito `reporter_id = self`.

**Definición de listo:**
- Cada parámetro de query validado con whitelist (no se pasan valores arbitrarios al ORM).
- `q` usa `to_tsvector` + `tsquery` con índice GIN (incluido en migración o agregado en una migración menor adicional).
- Reportante listando recibe solo sus tickets, sin opción de override.
- Plan de query del filtro común (`status + priority + assignee`) usa el índice `(status, priority DESC, created_at)`.
- Test verifica que `?assignee_id=me` resuelve al usuario del JWT.

---

### Épica EP-06 — Adjuntos S3

#### BL-024 — Endpoint `POST /v1/attachments` que devuelve URL prefirmada de upload

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D4 |
| Componente curso | Almacenamiento |
| CUs | CU-01 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | M |
| Depende de | BL-027 |

**Descripción.** Endpoint que recibe `filename`, `content_type`, `size_bytes`, valida contra whitelist de mime types (pdf, png, jpg, docx, xlsx, txt, log), valida tamaño máximo (ej. 10 MB), genera UUID como key en S3 (`<uuid>.<ext-validada>`), inserta fila en tabla `attachments` con estado `pending` y `uploader_id`, y devuelve URL prefirmada PUT con expiración de 10 minutos.

**Definición de listo:**
- Mime type fuera de whitelist devuelve 422.
- `size_bytes > MAX_SIZE` devuelve 422.
- Filename del cliente no se usa para el key S3; se usa UUID + extensión validada.
- URL prefirmada expira en 10 minutos (verificable).
- Fila en `attachments` queda en estado `pending` con `expires_at = now() + 24h`.

---

#### BL-025 — Endpoint `GET /v1/attachments/{id}/download` con URL prefirmada de lectura

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D4 |
| Componente curso | Almacenamiento |
| CUs | CU-05 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | S |
| Depende de | BL-024 |

**Descripción.** Genera URL prefirmada GET (expiración 5 min) solo si el usuario tiene acceso al ticket asociado al adjunto. Reportante: solo adjuntos de sus tickets. Agente/admin: cualquiera.

**Definición de listo:**
- Adjunto sin ticket asociado (estado `pending`) solo accesible por el uploader original.
- Reportante intentando descargar adjunto ajeno recibe 404.
- URL prefirmada expira en 5 minutos.
- Genera evento `adjunto_descargado` en `ticket_events` cuando aplica.

---

#### BL-026 — Migración tabla `attachments`

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D3 |
| Componente curso | BD |
| CUs | CU-01 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | XS |
| Depende de | BL-007 |

**Descripción.** Migración que crea `attachments`: `id` UUID PK, `s3_key`, `original_filename`, `content_type`, `size_bytes`, `uploader_id` FK, `ticket_id` FK nullable, `status` (pending/attached/expired), `expires_at`, `created_at`, `attached_at`. Índice en `(uploader_id, status)` y en `(ticket_id)`.

**Definición de listo:**
- Migración aplica y revierte.
- CHECK en `status` contra lista cerrada.
- `s3_key` UNIQUE.
- Comentario en la migración documenta el ciclo de vida (pending → attached o expired).

---

#### BL-105 — Bucket S3 de attachments con SSE, BPA y versioning

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D3 |
| Componente curso | Almacenamiento |
| CUs | CU-01 |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | — |

**Descripción.** Reforzar el módulo `storage/` existente: Block Public Access on (los 4 flags), SSE-S3 por default, versioning habilitado, ownership controls a `BucketOwnerEnforced` (ACLs deshabilitadas). Nombre estable: `ticket-system-${env}-attachments-${suffix}`.

**Definición de listo:**
- `aws s3api get-public-access-block` devuelve los 4 flags en `true`.
- `aws s3api get-bucket-encryption` devuelve `AES256`.
- `aws s3api get-bucket-versioning` devuelve `Enabled`.
- Intento de PUT con ACL `public-read` falla con `AccessControlListNotSupported`.

---

#### BL-106 — CORS y bucket policy para presigned URLs

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D4 |
| Componente curso | Almacenamiento / Seguridad |
| CUs | CU-01 |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | BL-105 |

**Descripción.** Configurar CORS del bucket: `AllowedOrigins` = dominio del frontend (dev y prod), métodos PUT/GET/HEAD, headers `Content-Type`, `Content-MD5`. Bucket policy que deniegue `s3:*` no-TLS (`aws:SecureTransport = false`).

**Definición de listo:**
- Browser puede ejecutar PUT a presigned URL desde el origen permitido sin error de CORS (validable con `curl -H "Origin: ..." -X OPTIONS`).
- Request HTTP (no HTTPS) a un object devuelve 403 con código `RequestDenied`.
- CORS config visible en `aws s3api get-bucket-cors`.

---

### Épica EP-07 — RBAC y JWT (mock inicial)

#### BL-027 — Middleware mock de JWT y matriz de permisos

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D3 |
| Componente curso | Cómputo |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-001, BL-007 |

**Descripción.** Middleware que extrae JWT del header `Authorization: Bearer`, lo decodifica sin verificar firma (mock para desarrollo), carga el `User` desde BD por `sub`, y lo deja en el request context. Decoradores/guards por endpoint declarando rol requerido. Documentar la matriz de permisos completa en `docs/permisos.md`.

**Definición de listo:**
- Request sin header `Authorization` recibe 401 (excepto `/healthz` y `/readyz`).
- Request con JWT mal formado recibe 401.
- Decorador `@requireRole('agente', 'admin')` rechaza con 403 si el usuario es reportante.
- Matriz de permisos en `docs/permisos.md` cubre los 8+ endpoints de la API.
- Test cubre los 3 roles contra los endpoints principales.

---

#### BL-028 — Helper `currentUser()` y `requireOwnTicket()`

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D3 |
| Componente curso | Cómputo |
| CUs | CU-05, CU-06 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | XS |
| Depende de | BL-027 |

**Descripción.** Helpers consumidos por los handlers: `currentUser()` devuelve el `User` autenticado del context; `requireOwnTicket(ticket, user)` valida que reportantes solo accedan a sus propios tickets (devuelve 404 no 403, para no filtrar existencia de tickets ajenos).

**Definición de listo:**
- Helpers exportados desde un módulo central, usados consistentemente en todos los handlers.
- Test verifica que reportante recibe 404 al pedir ticket ajeno.
- Test verifica que admin puede ver cualquier ticket.

---

### Épica EP-08 — Red dedicada (VPC)

#### BL-107 — Módulo Terraform `network/` con VPC dedicada y subnets

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D3 |
| Componente curso | Red |
| CUs | — (enabler) |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | — |

**Descripción.** Nuevo módulo `infra/modules/network/`. VPC CIDR `10.20.0.0/16`, 2 AZs (`us-east-1a`, `us-east-1b`), por AZ una subnet pública `/24` y una privada `/24`. Tags `kubernetes.io/role/elb=1` en públicas y `kubernetes.io/role/internal-elb=1` en privadas para que el AWS Load Balancer Controller las descubra. DNS hostnames y DNS support habilitados.

**Definición de listo:**
- `terraform apply` crea 1 VPC, 4 subnets, visibles en `aws ec2 describe-vpcs`.
- Subnets correctamente tagueadas (verificable con `aws ec2 describe-subnets --filters Name=tag:kubernetes.io/role/elb,Values=1`).
- Outputs `vpc_id`, `public_subnet_ids`, `private_subnet_ids` listos para consumir desde root.

---

#### BL-108 — IGW, NAT Gateway compartida y route tables

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D3 |
| Componente curso | Red |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-107 |

**Descripción.** IGW asociado a la VPC, una sola NAT Gateway en la subnet pública de `us-east-1a` (sacrificamos HA del egreso para ahorrar; en prod real serían 2). EIP para la NAT. Route tables: pública con default route al IGW, privada con default route a la NAT. **Costo:** NAT Gateway ~33 USD/mes + 0.045 USD/GB procesado — driver principal del costo de red de este proyecto.

**Definición de listo:**
- Instancia EC2 en subnet privada (test) puede `curl https://checkip.amazonaws.com` y la IP devuelta es la EIP de la NAT.
- Misma instancia no es alcanzable desde internet (no tiene IP pública).
- Route tables asociadas correctas en `aws ec2 describe-route-tables`.

---

#### BL-109 — VPC endpoints para S3, ECR, Secrets Manager y CloudWatch Logs

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D3 |
| Componente curso | Red / Costo |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-108 |

**Descripción.** Gateway endpoint para S3 (gratis, ahorra data por NAT en uploads). Interface endpoints para `ecr.api`, `ecr.dkr`, `secretsmanager`, `logs`, `sqs` en las subnets privadas — cuestan ~7 USD/mes/endpoint pero ahorran data NAT del pull de imágenes en cada deploy y elevan la postura de seguridad. **Costo aproximado:** 35-50 USD/mes en endpoints; se justifica porque en dev EKS pullea imágenes seguido y los logs hacia CloudWatch son continuos.

**Definición de listo:**
- `aws ec2 describe-vpc-endpoints` lista los 5 endpoints en estado `available`.
- Pull de imagen ECR desde un nodo EKS funciona con NAT bloqueada temporalmente (validación opcional manual).
- Security group del interface endpoint permite 443 desde el SG de los nodos.

---

#### BL-110 — Cablear root module a la nueva VPC (deprecar default VPC)

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D3 |
| Componente curso | Red |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-109 |

**Descripción.** Reemplazar los `data.aws_vpc.default` y `data.aws_subnets.default` en `infra/main.tf` por outputs del módulo `network`. RDS y Lambda pasan a subnets privadas; EKS recibe ambas (públicas para ALB, privadas para nodos). Migración cuidadosa: probablemente requiere `terraform state mv` y/o destroy-recreate de RDS (acordar ventana en dev).

**Definición de listo:**
- `terraform plan` en dev muestra cero referencias a la default VPC.
- RDS endpoint privado (sin acceso público): `aws rds describe-db-instances` muestra `PubliclyAccessible=false`.
- Lambda corre en subnets privadas (`VpcConfig.SubnetIds` apunta a las del módulo).
- Nodos EKS en subnets privadas con `kubectl get nodes -o wide` mostrando IPs del rango `10.20.x.x`.

---

### Épica EP-09 — Exposición y segmentación de seguridad

#### BL-111 — AWS Load Balancer Controller en EKS

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D4 |
| Componente curso | Red / Cómputo |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-110 |

**Descripción.** Instalar AWS Load Balancer Controller vía Helm en el cluster, con IRSA dedicado y la policy oficial de AWS. Necesario para que un `Ingress` con `ingressClassName: alb` provisione un ALB real apuntando a las subnets públicas.

**Definición de listo:**
- `helm install` de `aws-load-balancer-controller` exitoso, pods Running en `kube-system`.
- `kubectl get sa aws-load-balancer-controller -n kube-system -o yaml` muestra anotación IRSA.
- Crear un Ingress de prueba provisiona un ALB visible en consola en menos de 3 min.

---

#### BL-112 — Ingress ALB para la API con ACM cert y HTTPS

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D4 |
| Componente curso | Red / Seguridad |
| CUs | todos los HTTP-facing |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-111 |

**Descripción.** Recurso `Ingress` en el chart de la API con annotations para ALB internet-facing, target-type `ip`, listener 443 con cert ACM (assumimos dominio existente del equipo; si no, alternativa `nip.io` para dev). HTTP→HTTPS redirect. WAF se difiere a producción real.

**Definición de listo:**
- Certificado ACM emitido y validado por DNS.
- `curl -I https://api-dev.<dominio>/healthz` devuelve 200 desde internet.
- `curl -I http://api-dev.<dominio>/healthz` devuelve 301 a HTTPS.
- SSL Labs grade A o superior (validación opcional).

---

#### BL-113 — Security Groups por capa (alb-sg, nodes-sg, db-sg, lambda-sg)

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D3 |
| Componente curso | Seguridad / Red |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-110 |

**Descripción.** Definir SGs con referencias entre sí (no IPs ni 0.0.0.0/0 excepto egress de nodos al puerto 443 a internet). `alb-sg` recibe 80/443 de 0.0.0.0/0; `nodes-sg` recibe del `alb-sg` en NodePort range; `db-sg` recibe 5432 solo del `nodes-sg` y del `lambda-sg`; `lambda-sg` egress 443/5432.

**Definición de listo:**
- Cada SG referenciado por nombre lógico en outputs del módulo correspondiente.
- `aws ec2 describe-security-groups` no muestra reglas con `0.0.0.0/0` excepto en `alb-sg` puertos 80/443.
- Conexión directa desde una EC2 random en la VPC al puerto 5432 de RDS falla (timeout) — solo nodos EKS y Lambda pueden conectar.

---

### Épica EP-10 — Mensajería asíncrona (SQS)

#### BL-114 — SQS main queue con DLQ y redrive policy

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D4 |
| Componente curso | Asíncrono |
| CUs | CU-04 |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | — |

**Descripción.** Cola `ticket-system-${env}-events` estándar (no FIFO — el dominio tolera reordenamiento, FIFO limitaría throughput). DLQ `ticket-system-${env}-events-dlq` con retention 14 días. `maxReceiveCount = 5`. `visibilityTimeout = 6 × Lambda timeout` (180s si Lambda timeout es 30s, margen para reintentos). Message retention 4 días en main. SSE-SQS habilitada.

**Definición de listo:**
- `aws sqs get-queue-attributes` muestra `VisibilityTimeout=180`, `MessageRetentionPeriod=345600`, `RedrivePolicy` apuntando a la DLQ con `maxReceiveCount=5`.
- DLQ visible y vacía al inicio.
- SSE habilitada (`SqsManagedSseEnabled=true`).
- Outputs `main_queue_arn`, `dlq_arn` consumidos por Lambda y por roles IAM.

---

#### BL-115 — IAM role y event source mapping del worker Lambda

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D4 |
| Componente curso | Asíncrono / Cómputo |
| CUs | CU-04 |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | BL-114 |

**Descripción.** Execution role del Lambda con permisos: `sqs:ReceiveMessage/DeleteMessage/GetQueueAttributes` sobre la cola main, `logs:*` sobre su log group, `secretsmanager:GetSecretValue` sobre los secretos que use (DB, Slack). `aws_lambda_event_source_mapping` enlaza la cola al Lambda con batch size 10 y `MaximumBatchingWindowInSeconds=5`.

**Definición de listo:**
- Event source mapping en estado `Enabled` (`aws lambda list-event-source-mappings`).
- Mensaje publicado manualmente con `aws sqs send-message` es consumido por el Lambda en <10s (visible en CloudWatch Logs).
- Policy del role no permite acciones sobre otras colas (Access Analyzer policy check).

---

### Épica EP-11 — Worker de escalamiento por SLA

#### BL-116 — RFC Q6: mecanismo del job de escalamiento

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D4 |
| Componente curso | Asíncrono / Cómputo |
| CUs | CU-04 |
| Qs que cierra | Q6 |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | — |

**Descripción.** Redactar `docs/adrs/0006-mecanismo-escalamiento.md` comparando: (a) EventBridge Scheduler → Lambda, (b) ECS Scheduled Task, (c) cron en worker permanente. Recomendación: EventBridge Scheduler porque desacopla scheduling de compute, soporta cron-like, y reusa el Lambda worker existente sin nueva infra. Documentar idempotencia (UPDATE condicional por `escalation_level` y `state`).

**Definición de listo:**
- ADR mergeado en `docs/adrs/` con secciones Contexto / Opciones / Decisión / Consecuencias.
- Trade-offs explícitos en tabla (costo, complejidad, latencia de detección).
- Issue de Q6 marcada como cerrada en E1.

---

#### BL-117 — EventBridge Scheduler que invoca al Lambda de escalamiento

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D4 |
| Componente curso | Asíncrono |
| CUs | CU-04 |
| Qs que cierra | Q6 |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | BL-116, BL-115 |

**Descripción.** `aws_scheduler_schedule` con cron `*/5 * * * ? *` (cada 5 min) o rate `5 minutes`. Target = ARN del Lambda worker con un payload fijo `{"job": "sla_escalation"}` que el handler discrimine. Role dedicado para Scheduler con `lambda:InvokeFunction` solo sobre ese ARN. DLQ del scheduler apuntando a la misma DLQ de SQS.

**Definición de listo:**
- Schedule visible en consola EventBridge Scheduler, estado `ENABLED`.
- CloudWatch Logs del Lambda muestra invocaciones cada 5 min con el payload del job.
- Si el Lambda lanza error, el evento llega a la DLQ (validación con failure inyectada manualmente).

---

#### BL-118 — Alarma CloudWatch sobre fallos del job de escalamiento

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Observabilidad |
| CUs | CU-04 |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | XS |
| Depende de | BL-117, BL-131 |

**Descripción.** Alarma sobre `AWS/Lambda Errors` filtrada por function name del worker en período de 15 min: umbral ≥ 2 errores. Notifica vía SNS topic compartido con el resto de alarmas operativas.

**Definición de listo:**
- Alarma en estado `OK` post-creación.
- Forzar error en el Lambda durante una invocación dispara la alarma a `ALARM` en <5 min.
- Notificación llega al email/Slack suscrito al SNS topic.

---

#### BL-029 — Esqueleto del handler Lambda de escalamiento, agnóstico al trigger

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D5 |
| Componente curso | Cómputo |
| CUs | CU-04 |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-008, BL-010 |

**Descripción.** Handler Lambda con dos puntos de entrada: uno tipo EventBridge (sin payload de ticket; el handler hace polling de la tabla) y uno SQS-driven (recibe `{ticket_id, expected_escalation_level}`). Lógica core compartida: para cada ticket candidato, decidir si escalar y aplicar el escalamiento de forma idempotente. La decisión final EventBridge vs SQS-driven la cierra `aws-architect` en BL-116.

**Definición de listo:**
- Existe función `escalateIfDue(ticketId, expectedLevel)` reusada por ambos entrypoints.
- Handler EventBridge consulta `SELECT id, escalation_level FROM tickets WHERE sla_due_at <= now() AND status != 'resuelto' LIMIT 100` y llama a la función core por cada uno.
- Handler SQS recibe `ticket_id` + `expected_escalation_level` y llama directamente.
- Cobertura de tests unitarios para la función core con BD en contenedor.

---

#### BL-030 — Lógica idempotente de escalamiento con UPDATE condicional

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D5 |
| Componente curso | Cómputo |
| CUs | CU-04 |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-029 |

**Descripción.** Función core ejecuta `UPDATE tickets SET escalation_level = escalation_level + 1, sla_due_at = ?, version = version + 1 WHERE id = ? AND escalation_level = ? AND status != 'resuelto' AND sla_due_at <= now()` y comprueba filas afectadas. Si 0 filas → no-op (otro worker ya escaló, o el ticket cambió, o ya se resolvió). Si 1 fila → genera evento `escalamiento` y encola notificación.

**Definición de listo:**
- UPDATE condicional cubre los 3 invariantes (level esperado, no resuelto, vencido).
- Reprocesar el mismo mensaje SQS dos veces resulta en exactamente un escalamiento (verificado por test).
- Si el ticket ya fue resuelto entre que se encoló y se procesa, el handler no genera evento ni notificación.
- Métrica `escalations_skipped_total{reason=...}` incrementa con el motivo de skip.

---

#### BL-031 — Cálculo del próximo `sla_due_at` y encolado de notificación tras escalar

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D5 |
| Componente curso | Cómputo |
| CUs | CU-04 |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | BL-030 |

**Descripción.** Función pura `nextSlaDueAt(currentLevel, priority, slaRules) -> Date | null`. Tras escalar, encolar mensaje en la cola de notificaciones con `{ticket_id, event_type: "escalamiento", to_level}`. El encolado se hace **fuera de la transacción** que hace el UPDATE para no acoplar latencia de SQS a la consistencia de BD; en su lugar, se confía en el evento de `ticket_events` para reconstrucción si SQS falla.

**Definición de listo:**
- Función pura testeada para los 3 niveles (L1 → L2, L2 → L3, L3 → null = sin más escalamiento).
- Encolado de notificación ocurre tras commit de la transacción.
- Si encolado falla, log de ERROR con `ticket_id` y `request_id`; no se hace rollback del escalamiento (ya commiteado y registrado en eventos).
- Métrica `notification_enqueue_failed_total` instrumentada.

---

### Épica EP-12 — Worker de notificaciones

#### BL-119 — Decisión y verificación de dominio SES (Q1)

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Asíncrono / Seguridad |
| CUs | CU-04 |
| Qs que cierra | Q1 |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | — |

**Descripción.** ADR `0001-motor-email.md` recomendando SES sobre SendGrid/SMTP corporativo (precio, integración nativa con IAM, AWS-nativo). Provisionar `aws_sesv2_email_identity` para un dominio del equipo (o fallback: identidad por email verificada para sandbox). Registros DKIM en DNS. **Nota:** SES inicia en sandbox — solicitar salida es trámite manual fuera del scope académico salvo necesidad real.

**Definición de listo:**
- ADR mergeado.
- `aws sesv2 get-email-identity` muestra `VerificationStatus=SUCCESS` para el dominio o email.
- DKIM tokens publicados en DNS (3 CNAMEs) y status `SUCCESS`.
- Documentado en README que SES está en sandbox y los destinatarios deben verificarse manualmente.

---

#### BL-120 — IAM permission para Lambda worker enviar via SES

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Seguridad / Asíncrono |
| CUs | CU-04 |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | XS |
| Depende de | BL-119, BL-115 |

**Descripción.** Agregar al role del Lambda worker permiso `ses:SendEmail` y `ses:SendRawEmail` con `Resource` limitado al ARN de la identidad SES (y opcionalmente condition `ses:FromAddress` para forzar el `from`).

**Definición de listo:**
- `aws iam simulate-principal-policy` muestra `ALLOWED` para `ses:SendEmail` sobre el ARN del identity y `DENIED` sobre otros.
- Lambda envía email de prueba sin permission errors en CloudWatch.

---

#### BL-121 — Secret en Secrets Manager para Slack webhook

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Seguridad |
| CUs | CU-04 |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | XS |
| Depende de | BL-127 |

**Descripción.** Secret `ticket-system/${env}/slack-webhook` con el URL del webhook. Lambda lee con `secretsmanager:GetSecretValue`. Sin rotación automática (los webhooks Slack no se rotan vía API estándar; rotación manual documentada).

**Definición de listo:**
- Secret existe, valor no aparece en state ni en logs (usar `sensitive = true` en TF y `lifecycle.ignore_changes = [secret_string]` si se carga out-of-band).
- Lambda recupera el secret en tiempo de ejecución (validable con log que NO imprima el valor pero confirme longitud >0).

---

#### BL-032 — Esqueleto del worker SQS de notificaciones

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D5 |
| Componente curso | Cómputo |
| CUs | CU-04 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | S |
| Depende de | BL-001 |

**Descripción.** Lambda que consume cola SQS de notificaciones, parsea mensaje `{ticket_id, event_type, recipients?}`, valida schema con zod/pydantic, y delega a `dispatchNotification(ticket, event, user)`. Visibility timeout configurado para que sea > tiempo máximo esperado (lectura BD + render + envío SES/Slack).

**Definición de listo:**
- Handler parsea mensaje; si schema inválido, log ERROR y descarta (no retry infinito).
- Visibility timeout documentado y justificado.
- Test con `FakeSqsEvent` valida el flujo completo con stubs de SES y Slack.

---

#### BL-033 — Lectura de preferencias y selección de canales

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D5 |
| Componente curso | Cómputo |
| CUs | CU-04 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | S |
| Depende de | BL-032, BL-007 |

**Descripción.** Por cada destinatario (reportante, asignee, escalation target), leer `users.notify_email` y `users.notify_slack`. Si `notify_slack=true` pero `slack_user_id` es null, fallback a email + log WARN. Si ambos están en false, log INFO y skip.

**Definición de listo:**
- Función `resolveChannels(user) -> Channel[]` testeada para los 4 escenarios.
- Usuario sin canales no genera error; queda como métrica `notifications_skipped_no_channels_total`.
- Fallback de Slack a email queda registrado en log estructurado.

---

#### BL-034 — Render de mensajes email y Slack por tipo de evento

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D5 |
| Componente curso | Cómputo |
| CUs | CU-04 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | S |
| Depende de | BL-033 |

**Descripción.** Templates separados por `event_type` (ticket_creado, asignacion, cambio_estado, escalamiento, resolucion). Email: subject + body HTML + body text. Slack: blocks con link al ticket. Funciones de render son puras: reciben `ticket` y `event` y devuelven el payload listo para SES/Slack.

**Definición de listo:**
- 5 templates de email y 5 de Slack implementados.
- Render es función pura testeable sin red.
- Snapshot tests del payload renderizado.
- Links al ticket usan `ticket_number`, no UUID interno.

---

#### BL-035 — Envío con manejo de errores SES y Slack

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D5 |
| Componente curso | Cómputo |
| CUs | CU-04 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | M |
| Depende de | BL-034 |

**Descripción.** Distinguir errores transitorios (throttle 429, 5xx) de permanentes (400, recipient inválido, canal Slack archivado). Transitorios: lanzar excepción para que SQS reintente (con DLQ después de N reintentos). Permanentes: log ERROR + métrica, no relanzar. Timeout por llamada a SES/Slack de 5s. Cliente HTTP con retry de 1 intento extra solo para errores de red.

**Definición de listo:**
- Test con SES throttle 429: la excepción se relanza para que SQS reintente.
- Test con SES "invalid recipient": el error se loguea y no se relanza.
- Timeouts explícitos en cliente SES y Slack.
- Métrica `notifications_sent_total{channel,event_type,status}` instrumentada.
- DLQ recibe mensajes tras N reintentos (configuración en BL-114).

---

### Épica EP-13 — Reporte CSV (CU-07)

#### BL-036 — Query agregada para el reporte

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D5 |
| Componente curso | BD |
| CUs | CU-07 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | S |
| Depende de | BL-008 |

**Descripción.** Función `buildReportQuery(filters)` que arma SQL parametrizado para el reporte: filtros por rango de fechas, prioridad, status, assignee. Columnas: `ticket_number`, `type`, `title`, `severity`, `impact`, `priority`, `status`, `reporter_email`, `assignee_email`, `created_at`, `resolved_at`, `time_to_resolve_minutes`, `escalation_level`, `sla_breached` (bool). Usar streaming/cursor en el driver para no cargar todo en memoria.

**Definición de listo:**
- Query parametrizada (sin string concat).
- `time_to_resolve_minutes` calculado como `EXTRACT(EPOCH FROM (resolved_at - created_at))/60`.
- `sla_breached` calculado vs `sla_due_at`.
- Plan de query revisado con `EXPLAIN` para volumen esperado.
- Test verifica resultado contra dataset conocido.

---

#### BL-037 — Endpoint `GET /v1/reports/tickets.csv` con streaming response

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D5 |
| Componente curso | Cómputo |
| CUs | CU-07 |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | M |
| Depende de | BL-036, BL-027 |

**Descripción.** Endpoint solo para admin. Stream CSV con header `Content-Type: text/csv; charset=utf-8` y `Content-Disposition: attachment`. Iterar cursor de BD y escribir filas al response sin acumular en memoria. Escapado correcto de CSV (comas, comillas, newlines en title/description).

**Definición de listo:**
- Solo admin accede; reportante y agente reciben 403.
- Header `Content-Disposition: attachment; filename="tickets-YYYY-MM-DD.csv"`.
- Test con 10k tickets verifica que el proceso no excede memoria razonable (medible por tamaño de buffer).
- Escapado correcto: títulos con comas y comillas no rompen el CSV.
- Filtros pasados como query string validados con whitelist.

---

### Épica EP-14 — Identidad y autenticación

#### BL-122 — RFC Q2: selección del IdP

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Seguridad |
| CUs | CU-01, CU-02, CU-03 |
| Qs que cierra | Q2 |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | — |

**Descripción.** ADR `0002-idp.md` comparando Cognito / Auth0 / Keycloak / IdP del cliente. Recomendación por default: **Cognito** (AWS-nativo, free tier ≥50k MAU, JWT estándar, integración natural con ALB/API Gateway). Documentar trade-offs (UX flows menos pulida que Auth0, customización limitada).

**Definición de listo:**
- ADR mergeado con tabla de comparación.
- Q2 cerrada en `docs/preguntas-abiertas.md`.

---

#### BL-123 — User Pool Cognito + App Client para la API

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Seguridad |
| CUs | CU-01, CU-02, CU-03 |
| Qs que cierra | Q2 |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-122 |

**Descripción.** Nuevo módulo `infra/modules/identity/`. `aws_cognito_user_pool` con MFA opcional (TOTP), policy de contraseñas mínima (12 chars, mayúsculas, números, símbolos). 3 grupos: `reportantes`, `agentes`, `administradores` — los claims `cognito:groups` se mapean al RBAC del JWT. App client tipo `private` con secret, flows `ALLOW_USER_PASSWORD_AUTH` + `ALLOW_REFRESH_TOKEN_AUTH`. Token validity: access 1h, refresh 30d.

**Definición de listo:**
- `aws cognito-idp describe-user-pool` muestra el pool con los 3 grupos.
- Usuario de prueba creado por TF en grupo `administradores`.
- Login con `aws cognito-idp initiate-auth` devuelve JWT con claim `cognito:groups` correcto.
- JWKS endpoint accesible: `curl https://cognito-idp.us-east-1.amazonaws.com/<pool-id>/.well-known/jwks.json` devuelve 200.

---

#### BL-124 — Conectividad EKS → JWKS de Cognito

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Seguridad / Red |
| CUs | CU-01, CU-02, CU-03 |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | XS |
| Depende de | BL-123, BL-110 |

**Descripción.** Verificar que pods en subnet privada pueden alcanzar `cognito-idp.<region>.amazonaws.com:443` vía NAT Gateway (no hay VPC endpoint público para Cognito en todas las regiones). Documentar latencia esperada de la primera fetch de JWKS y el TTL de caché aplicado en la app (5-15 min).

**Definición de listo:**
- `kubectl exec` a un pod de API y `curl -I` al JWKS devuelve 200 en <500ms.
- API en logs muestra "JWKS cached" tras el primer hit.

---

#### BL-038 — Cliente JWKS con cache y rotación

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D5 |
| Componente curso | Cómputo |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-027, BL-123 |

**Descripción.** Reemplazar mock JWT de BL-027 por validación real: descargar JWKS del IdP (Cognito, según BL-122), cachear las llaves públicas con TTL (ej. 10 min), validar firma con la `kid` del header del JWT. Validar también `iss`, `aud`, `exp`, `nbf`.

**Definición de listo:**
- Token con firma inválida → 401.
- Token expirado → 401.
- Token con `iss` o `aud` incorrecto → 401.
- Si `kid` no está en cache, recargar JWKS una vez; si sigue sin estar, 401.
- Cache de JWKS no se invalida en cada request (verificable por número de fetches en test).
- Documentación de configuración: env vars `JWT_ISSUER`, `JWT_AUDIENCE`, `JWKS_URI`.

---

#### BL-039 — Mapeo de claims del JWT a `User` interno

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D5 |
| Componente curso | Cómputo |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | BL-038 |

**Descripción.** Tras validar el JWT, mapear claims (`sub`, `email`, `cognito:groups` o equivalente) al `User` interno. Si el usuario no existe en `users`, crearlo al vuelo en la primera petición (just-in-time provisioning) con rol según el grupo del IdP. Actualizar `email` si cambió en el IdP.

**Definición de listo:**
- Test verifica que un JWT con un `sub` nuevo crea fila en `users`.
- Rol del usuario se mapea desde el claim de grupos según whitelist (`agentes` → agente, `administradores` → admin, resto → reportante).
- Cambio de email en el IdP se refleja en la siguiente request.
- JIT provisioning es idempotente (race entre dos requests del mismo usuario nuevo no crea dos filas).

---

### Épica EP-15 — Gestión de secretos

#### BL-125 — Secret de credenciales RDS con rotación automática

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D4 |
| Componente curso | Seguridad / BD |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-110 |

**Descripción.** Reemplazar `var.db_password` (env var) por `aws_secretsmanager_secret` + `aws_rds_cluster.master_user_secret` o equivalente para `aws_db_instance`. Rotación nativa cada 30 días con el Lambda rotation oficial de AWS. API y Lambda worker leen el secret en runtime.

**Definición de listo:**
- Secret existe en formato JSON `{"username": "...", "password": "..."}`.
- `aws secretsmanager rotate-secret` ejecutado manualmente rota la contraseña y RDS sigue funcional.
- Rotación schedule visible: cada 30 días.
- Variable `db_password` eliminada de `variables.tf` y `dev.tfvars`.

---

#### BL-126 — Política de naming y rotación de secretos

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Seguridad |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | XS |
| Depende de | — |

**Descripción.** Documentar en `docs/conventions/secrets.md`: naming `<project>/<env>/<resource>`, secretos rotables vs no-rotables (Slack webhook no), KMS key (AWS managed `aws/secretsmanager` salvo necesidad de CMK), prohibición de logging del valor.

**Definición de listo:**
- Doc en repo, referenciado desde README.
- Lint check (manual o PR template) verifica que ningún `*.tf` use string interpolation directa de secret values.

---

#### BL-127 — IAM permisos granulares para acceso a secretos

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Seguridad |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | XS |
| Depende de | BL-125 |

**Descripción.** Refinar policies de IRSA de API y execution role de Lambda: `secretsmanager:GetSecretValue` solo sobre los ARNs específicos que cada uno necesita (no wildcard). API: secret de RDS. Lambda: secret de RDS + Slack webhook.

**Definición de listo:**
- IAM Access Analyzer policy check pasa sin warnings de wildcard.
- Intento de leer un secret no autorizado devuelve `AccessDeniedException`.

---

### Épica EP-16 — Lifecycle de attachments S3

#### BL-128 — RFC Q4: política de retención de attachments

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Almacenamiento |
| CUs | CU-01, CU-05 |
| Qs que cierra | Q4 |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | — |

**Descripción.** ADR `0004-retencion-attachments.md` proponiendo: Standard (0-30 días) → Standard-IA (30-90 días) → Glacier Instant (90-365 días) → expiración a 365 días. Justificación: tickets cerrados raramente requieren attachments tras 90 días pero compliance académico puede pedir 1 año. Versiones no-current expiran a 30 días.

**Definición de listo:**
- ADR mergeado.
- Q4 marcada cerrada en `docs/preguntas-abiertas.md`.

---

#### BL-129 — Lifecycle policy en bucket S3

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Almacenamiento |
| CUs | CU-01, CU-05 |
| Qs que cierra | Q4 |
| Owner | Estuardo |
| Tamaño | XS |
| Depende de | BL-128, BL-105 |

**Descripción.** `aws_s3_bucket_lifecycle_configuration` con las reglas del ADR. En env `dev` retención más corta (30 días total) para no acumular costo. Regla aparte: aborto de uploads multipart incompletos a 7 días.

**Definición de listo:**
- `aws s3api get-bucket-lifecycle-configuration` muestra las transiciones y expiraciones esperadas.
- Object creado con timestamp manipulado (test) transiciona en la siguiente corrida del job de lifecycle de S3.

---

### Épica EP-17 — Autenticación worker → API

#### BL-130 — RFC Q9: mecanismo de identidad worker → API

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Seguridad |
| CUs | CU-04 |
| Qs que cierra | Q9 |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | — |

**Descripción.** ADR `0009-auth-worker-api.md`. Opciones: (a) IAM SigV4 — requiere que la API valide firma AWS, no es nativo en ALB+EKS sin API Gateway delante. (b) Service JWT firmado con clave privada en Secrets Manager — la API valida con clave pública. (c) Lambda escribe directo en DB (bypass API). Recomendación: **(b) service JWT**, porque mantiene la API como única puerta de escritura sin agregar API Gateway. Documentar trade-offs.

**Definición de listo:**
- ADR mergeado.
- Q9 marcada cerrada.

---

#### BL-131 — Provisioning del par de claves de service token

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Seguridad |
| CUs | CU-04 |
| Qs que cierra | Q9 |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | BL-130, BL-127 |

**Descripción.** Generar par RSA-2048 (out-of-band con `openssl`), guardar clave privada en `ticket-system/${env}/worker-jwt-private` y pública en `ticket-system/${env}/worker-jwt-public`. IRSA de la API solo lee la pública; execution role del Lambda worker solo lee la privada. Rotación manual documentada cada 90 días.

**Definición de listo:**
- Los dos secrets existen, con tags `rotation=manual`, `expiry=<fecha>`.
- IAM check: API no puede leer la privada; worker no puede leer la pública.
- Doc de rotación en `docs/runbooks/rotar-worker-jwt.md`.

---

#### BL-040 — RFC Q9 autenticación worker → API (paralelo dev)

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D5 |
| Componente curso | Cómputo |
| CUs | — |
| Qs que cierra | Q9 (en conjunto con BL-130) |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | BL-130 |

**Descripción.** Sección del RFC Q9 enfocada en el lado de la API: implicaciones de validar SigV4 (cliente AWS en server) vs validar JWT firmado (cargar clave pública, verificar firma, `iss`/`aud` específicos del worker). Recomendación se alinea con BL-130.

**Definición de listo:**
- Sección "Implicaciones en la API" incluida en `docs/rfcs/Q9-auth-worker-api.md`.
- Pseudo-código del verificador documentado.

---

#### BL-041 — Middleware de verificación de identidad worker

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D5 |
| Componente curso | Cómputo |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-040, BL-131 |

**Descripción.** Middleware separado del de JWT humano, aplicado a endpoints internos `/internal/v1/*` (si los hay) que el worker llama. Verifica el service JWT firmado con la clave pública de BL-131. Logs distinguen request humano de request de worker (`actor_type=worker`).

**Definición de listo:**
- Endpoint `/internal/...` rechaza JWT humano con 403.
- Endpoint `/internal/...` rechaza request sin firma/token válido con 401.
- Logs incluyen `actor_type` para distinguir.
- Test cubre los 3 casos (worker válido, JWT humano, sin auth).

---

### Épica EP-18 — Observabilidad

#### BL-132 — Log groups de CloudWatch con retención por env

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Observabilidad / Costo |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | XS |
| Depende de | — |

**Descripción.** Crear `aws_cloudwatch_log_group` explícitos para Lambda, EKS control plane (audit, api, authenticator), y la API (vía Fluent Bit o awslogs driver). Retención: 7 días en dev, 30 días en prod. CloudWatch Logs es uno de los drivers de costo silenciosos — sin esto, retention default es "never expire".

**Definición de listo:**
- `aws logs describe-log-groups` muestra `retentionInDays` correcto para cada grupo.
- No existe ningún log group del proyecto con retention `null`.

---

#### BL-133 — Dashboard CloudWatch del sistema

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Observabilidad |
| CUs | — |
| Qs que cierra | — |
| Owner | Luis André |
| Tamaño | M |
| Depende de | BL-132 |

**Descripción.** `aws_cloudwatch_dashboard` con widgets: SQS `ApproximateNumberOfMessagesVisible` + `ApproximateAgeOfOldestMessage`, Lambda `Invocations/Errors/Duration p95`, RDS `CPUUtilization/DatabaseConnections/FreeStorageSpace`, ALB `RequestCount/HTTPCode_Target_5XX_Count/TargetResponseTime p95`.

**Definición de listo:**
- Dashboard accesible en consola con los 4 grupos de widgets renderizando datos reales tras un smoke test.
- JSON del dashboard versionado en Terraform.

---

#### BL-134 — Alarmas críticas y SNS topic operativo

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | Observabilidad |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-132 |

**Descripción.** SNS topic `ticket-system-${env}-ops`. Alarmas con runbook documentado: (1) DLQ no vacía, (2) `ApproximateAgeOfOldestMessage > 300s`, (3) Lambda `Errors > 2` en 15 min, (4) RDS `DatabaseConnections > 80%` del límite del instance class, (5) ALB `HTTPCode_Target_5XX_Count > 5` en 5 min. Suscripción email a los miembros del equipo.

**Definición de listo:**
- Las 5 alarmas en estado `OK` post-deploy.
- Test sintético dispara cada alarma al menos una vez (drenar cola para 5xx, etc.) y llega email.
- Cada alarma con tag `runbook=<url>` apuntando a `docs/runbooks/`.

---

#### BL-042 — Logger estructurado JSON con campos estándar

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | transversal |
| Componente curso | Observabilidad |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | BL-001 |

**Descripción.** Logger central que emite JSON con campos estándar: `timestamp`, `level`, `service`, `request_id`, `actor_id`, `actor_type`, `ticket_id` (cuando aplique), `event`, `message`, payload custom. Auto-redacción de campos sensibles (`*_token`, `*_secret`, `password`, `authorization`).

**Definición de listo:**
- Logger usado en handlers, services y workers (no hay `console.log` o `print` ad-hoc).
- Campo `authorization` en payload aparece como `[REDACTED]` en el log.
- Test verifica formato JSON parseable.
- Nivel configurable por env var.

---

#### BL-043 — Propagación de `request_id` en API y SQS

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | transversal |
| Componente curso | Observabilidad |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | BL-042 |

**Descripción.** Middleware genera `request_id` en el primer ingreso (o reusa header `X-Request-Id` si llega del ALB), lo deja en el context, lo incluye en cada log de la request, lo devuelve en el header de respuesta, y lo propaga como atributo del mensaje cuando se encola en SQS. El worker SQS lee el atributo y lo usa como `request_id` propio.

**Definición de listo:**
- Header `X-Request-Id` en respuesta para todas las requests.
- Mensajes SQS encolados llevan `messageAttributes.request_id`.
- Worker logs incluyen el `request_id` original que disparó el flow.
- Test e2e: trazar un ticket creado → notificación enviada usando el mismo `request_id`.

---

#### BL-044 — Métricas custom de negocio vía CloudWatch EMF

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D5 |
| Componente curso | Observabilidad |
| CUs | CU-04, CU-07 |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-042 |

**Descripción.** Emitir métricas usando Embedded Metric Format (EMF) — log JSON que CloudWatch parsea como métrica, sin cliente CloudWatch separado. Métricas: `tickets_created_total{priority,type}`, `tickets_resolved_total{priority}`, `ticket_resolution_minutes` (histogram), `sla_breached_total{priority}`, `escalations_total{from_level,to_level}`, `notifications_sent_total{channel,status}`.

**Definición de listo:**
- Métricas emitidas en formato EMF, visibles en CloudWatch Metrics.
- Histograma de resolución usa unidad consistente (minutos).
- Métrica de tickets abiertos por severidad se calcula como query (`MetricMath` o dashboard query), no como gauge emitido (caro).
- Documentación de las 6 métricas custom en `docs/observabilidad.md`.

---

#### BL-045 — Manejo correcto de transacción y commit de SQS en worker

| Campo | Valor |
|---|---|
| Área | dev |
| Entrega | D5 |
| Componente curso | Cómputo |
| CUs | CU-04 |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | S |
| Depende de | BL-029, BL-032 |

**Descripción.** En los handlers SQS, asegurar que el mensaje solo se reconoce como procesado (return exitoso, que Lambda comitea) **después** de que la transacción de BD commiteó y el side effect crítico completó. Si la lógica falla a la mitad, lanzar excepción para que Lambda no borre el mensaje y SQS lo reentregue.

**Definición de listo:**
- Test simula crash entre commit BD y envío email: el mensaje vuelve a ser entregado.
- Idempotencia (BL-030) protege contra el escalamiento doble en ese caso.
- Notificación duplicada en ese escenario queda como riesgo conocido y documentado (mitigado por ventana corta de procesamiento).
- Documentación del flow en `docs/workers.md`.

---

### Épica EP-19 — CI/CD

#### BL-135 — GitHub Actions: terraform plan en PR

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D4 |
| Componente curso | DevOps |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | — |

**Descripción.** Workflow `.github/workflows/tf-plan.yml` que en cada PR a `main` corra `terraform fmt -check`, `terraform validate`, `terraform plan -out=plan.tfplan` en `infra/` con el env `dev`. Output del plan como PR comment. Auth a AWS vía OIDC (no access keys long-lived). El backend S3 + DynamoDB lock ya está configurado en `infra/backend.tf` y `bootstrap/`.

**Definición de listo:**
- Workflow visible en pestaña Actions.
- PR de prueba muestra comment con el plan en <3 min.
- Role IAM `gh-actions-terraform-plan` con trust policy hacia `repo:gitcombo/ticket-system-infra:ref:refs/pull/*`.
- DynamoDB lock visible en table `ticket-system-tflock` durante la ejecución.

---

#### BL-136 — GitHub Actions: terraform apply a dev en merge a main

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D4 |
| Componente curso | DevOps |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-135 |

**Descripción.** Workflow `tf-apply-dev.yml` triggered en push a `main`, corre `terraform apply -auto-approve` contra dev. Role IAM separado con permisos de apply. Tras apply exitoso, ejecuta smoke test (curl al `/healthz` del ALB).

**Definición de listo:**
- Merge a `main` dispara el workflow y aplica cambios visibles en consola.
- Lock de DynamoDB se libera al final (verificar tabla vacía).
- Step de smoke test falla el workflow si `/healthz` no devuelve 200.

---

#### BL-137 — GitHub Actions: apply a prod con approval manual

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | DevOps |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-136 |

**Descripción.** Workflow `tf-apply-prod.yml` triggered manualmente (`workflow_dispatch`) o por tag `vX.Y.Z`. Usa GitHub Environments con required reviewers (Estuardo + Luis André). Plan se muestra en el job, apply queda gateado hasta aprobación.

**Definición de listo:**
- Environment `production` configurado con 2 required reviewers.
- Ejecutar el workflow sin aprobación deja el job en `Waiting`.
- Tras aprobar, apply corre y termina exitoso.

---

#### BL-138 — GitHub Actions: build + push de imagen API y helm upgrade

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D4 |
| Componente curso | DevOps / Cómputo |
| CUs | — |
| Qs que cierra | — |
| Owner | Estuardo |
| Tamaño | M |
| Depende de | BL-103, BL-101, BL-136 |

**Descripción.** Workflow `api-deploy.yml`: en push a `main` con cambios en `app/api/**`, build de Docker, tag con `git-sha`, push a ECR, `helm upgrade --install` contra el cluster dev con `--set image.tag=<sha>`. Auth a EKS vía `aws eks update-kubeconfig` con OIDC role.

**Definición de listo:**
- Cambio trivial en `app/api/` dispara el pipeline.
- Imagen aparece en ECR con tag = git sha.
- `kubectl rollout status deployment/api` devuelve éxito.
- Rollback documentado: `helm rollback api <revision>`.

---

### RFCs sueltos pendientes

#### BL-139 — Documentar Q7: Single-AZ en dev, Multi-AZ recomendado en prod

| Campo | Valor |
|---|---|
| Área | infra |
| Entrega | D5 |
| Componente curso | BD |
| CUs | — |
| Qs que cierra | Q7 |
| Owner | Estuardo |
| Tamaño | XS |
| Depende de | — |

**Descripción.** ADR corto `0007-rds-availability.md` formalizando lo asumido en E2: `db.t4g.micro` Single-AZ en dev (~12 USD/mes), Multi-AZ documentado como requisito para prod real (duplica costo, RPO ~0, RTO ~60-120s con failover automático). Cerrar Q7.

**Definición de listo:**
- ADR mergeado.
- Q7 cerrada en `docs/preguntas-abiertas.md` con link al ADR.
- `dev.tfvars` y eventual `prod.tfvars` reflejan la decisión (`db_multi_az = false` y `true` respectivamente).

---

### Épica EP-20 — Documentación de entregas (placeholder)

Items detallados se redactan al cerrar cada entrega (D3, D4, D5). Cada entrega actualiza el documento vivo del proyecto (`docs/TicketSystem.md`) con cambios, decisiones, RFCs cerradas y Anexo IA. Las versiones anteriores quedan inmutables en git history bajo los tags `inube-entrega-N`. No se crean archivos hermanos `EN_TicketSystem.md`.

---

## 6. División de trabajo Estuardo vs Luis André

**Premisa:** Estuardo lidera infraestructura/IaC/AWS. Luis André lidera backend de aplicación. Ambos hacen revisión cruzada. El pareo se reserva para decisiones que tocan diseño + despliegue al mismo tiempo.

| Épica | Owner principal | Backup / pareo | Comentario |
|---|---|---|---|
| EP-01 API esqueleto | **Luis André** | Estuardo (contenerización + Helm chart) | Pareo en el handoff dev→k8s |
| EP-02 Persistencia | **Luis André** | — | Estuardo revisa migraciones contra `infra/modules/database` |
| EP-03 CU-01/CU-08 | **Luis André** | — | |
| EP-04 CU-02/CU-03 | **Luis André** | Estuardo (revisión Q8) | |
| EP-05 CU-05/CU-06 | **Luis André** | — | |
| EP-06 Adjuntos S3 | **Pareo** | — | Backend genera presigned URL, infra define bucket policy y CORS |
| EP-07 RBAC middleware | **Luis André** | Estuardo (cómo viaja JWT desde ALB) | |
| EP-08 VPC | **Estuardo** | — | Core de D3 |
| EP-09 ALB Ingress + subnets | **Estuardo** | Luis André (probar conectividad) | |
| EP-10 SQS + DLQ | **Estuardo** | — | |
| EP-11 Job escalamiento SLA | **Pareo** | — | Q6 arquitectónica; lógica idempotente backend |
| EP-12 Worker notificaciones | **Pareo** | — | Lambda + SES (infra) y handler (dev) |
| EP-13 Reporte CSV | **Luis André** | — | |
| EP-14 IdP integración | **Pareo** | — | Q2 conjunta; cableado + middleware |
| EP-15 Secrets Manager | **Estuardo** | Luis André (consumo desde API) | |
| EP-16 Lifecycle S3 | **Estuardo** | — | |
| EP-17 Worker→API auth | **Pareo** | — | Q9 toca IAM (infra) y verificación (dev) |
| EP-18 Observabilidad | **Pareo** | — | Métricas custom (dev) + dashboards/alarmas (infra) |
| EP-19 CI/CD | **Estuardo** | Luis André (tests en pipeline) | |
| EP-20 Documentación | **Pareo** | — | Uno escribe técnico, otro revisa |

**Balance estimado:** Luis André 9 ownerships principales + 1 backup técnico; Estuardo 6 ownerships principales + apoyo cruzado. 6 pareos. Carga razonablemente equilibrada.

---

## 7. Riesgos del proyecto

Específicos del Sistema de Tickets — no genéricos.

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| **R-01** | EKS control plane corriendo entre clases cuesta ~$73/mes/cluster. Dev + prod ≈ $150/mes solo por control planes. | Alta | Medio (presupuestal) | `terraform destroy` de dev al cierre de cada sesión de trabajo + alarma de billing. Prod up solo en semanas de defensa. |
| **R-02** | Cold start de Lambda en VPC (1-5s) puede hacer que notificaciones de incidentes críticos lleguen tarde. | Media | Alto (funcional + defensa) | Provisioned concurrency para Lambda de notificaciones críticas, o aceptar el delay y documentarlo. Discutir en EP-12. |
| **R-03** | Q6 (mecanismo de escalamiento) y Q8 (concurrencia) llegan tarde a D4 → re-trabajo de EP-11 o duplicación de escalamientos. | Media | Alto | Cerrar Q6 (BL-116) y Q8 (BL-016) **antes** de empezar EP-11. |
| **R-04** | Q1 (motor email) requiere SES out-of-sandbox que toma 24-72h de aprobación AWS. Si se solicita tarde, D4 queda sin demo de envío real. | Media | Medio | Iniciar trámite con BL-119. Plan B: SMTP de Gmail/Mailtrap como fallback documentado. |
| **R-05** | Q2 (IdP) se posterga hasta D5 pero RBAC se necesita desde EP-04. JWT mockeado en EP-07 que luego hay que reemplazar. | Alta | Bajo | Aceptado: BL-027 con mock; BL-038/BL-039 hacen el swap en D5. |
| **R-06** | El módulo `compute/` ya existe (`lambda-src/`, `build/`) y mezcla potencialmente el código del worker con la IaC. | Media | Medio | Decidir en EP-19 si el código del worker vive en este repo o en uno de aplicación separado. |
| **R-07** | Mockups Stitch pueden no corresponder 1:1 con los endpoints que termine teniendo la API → desalineación en defensa. | Baja | Medio | Revisar mockups contra contrato OpenAPI al redactar (EP-01). Anotar diferencias. |
| **R-08** | Historial inmutable depende de disciplina del código — Postgres no impide UPDATE/DELETE sobre `ticket_events`. | Media | Alto (académico) | BL-009 hace `REVOKE UPDATE, DELETE` para el rol de aplicación. |
| **R-09** | Solo dos personas en el equipo. Una semana caída = ~50% capacidad. | Media | Alto | Pareos en items P0; ningún integrante owner único en ruta crítica de la próxima entrega. |
| **R-10** | `terraform destroy` y vuelta a crear toma 15-25 min para EKS. | Alta | Bajo | Cluster `dev` persistente durante semanas activas; destroy solo al final de cada bloque. |

---

## 8. Preguntas abiertas — estado y cierre proyectado

| Q# | Pregunta | Item que la cierra | Entrega | Estado |
|---|---|---|---|---|
| **Q1** | Motor de email | BL-119 (RFC + provisioning SES) | D5 | Recomendación: SES. Pendiente trámite de sandbox. |
| **Q2** | IdP concreto | BL-122 (RFC) + BL-123 (provisioning) | D5 | Recomendación: Cognito. |
| **Q3** | Versionado API | BL-003 | D3 | Recomendación: prefijo `/v1/`. **Cerrable hoy.** |
| **Q4** | Retención S3 | BL-128 (RFC) + BL-129 (lifecycle) | D5 | Pendiente — propuesta en BL-128. |
| **Q5** | Valores SLA | BL-010 (seed) | D3 | Pendiente — el equipo debe acordar los minutos por celda tipo×severidad. |
| **Q6** | Mecanismo escalamiento | BL-116 (RFC) + BL-117 (provisioning) | D4 | Recomendación: EventBridge Scheduler. |
| **Q7** | RDS sizing y AZ | BL-139 (ADR formal) | D5 | Cerrada parcialmente en E2 (Single-AZ asumido); formalizar. |
| **Q8** | Concurrencia | BL-016 (RFC) | D3 | Recomendación: optimistic con `version`. |
| **Q9** | Worker→API auth | BL-130 (RFC) + BL-131 (provisioning) + BL-040/BL-041 (lado API) | D5 | Recomendación: service JWT firmado. |
| **Q10** | Modelo `user_preferences` | Cerrada en E2 (columnas en `users`) | — | **Cerrada.** |

**Resumen de cierres proyectados:**
- **Cerrables al armar el backlog:** Q3 (BL-003).
- **En D3:** Q5, Q8.
- **En D4:** Q1, Q6.
- **En D5:** Q2, Q4, Q7, Q9.
- **Ya cerradas:** Q10.

---

## 9. Roadmap visual (entrega × épica)

```
Entrega    │ Épicas que entran al cierre
───────────┼────────────────────────────────────────────────────────────
D3 (Red)   │ EP-01* EP-02 EP-04(Q8) EP-07 EP-08 EP-09 EP-13(parcial)
D4 (Async) │ EP-01* EP-03 EP-04 EP-05 EP-06 EP-10 EP-11 EP-12 EP-19(plan)
D5 (Sec)   │ EP-13 EP-14 EP-15 EP-16 EP-17 EP-18 EP-19(prod)
───────────┴────────────────────────────────────────────────────────────
* EP-01 cubre toda la transversal hasta cierre
```

---

## 10. Anexo IA

### Qué le pedimos a la IA

- Al **agente `ticket-system-pm`**: estructura del documento, lista priorizada de épicas con su relación a CUs y Qs, división de trabajo entre Estuardo y Luis André, matriz de riesgos, y mapa de cierre de Qs por entrega.
- Al **agente `staff-engineer`**: detalle de los items de desarrollo de aplicación (BL-001..BL-045) con formato uniforme, definición de listo verificable, RFCs para Q8 y aporte del lado de API a Q9.
- Al **agente `aws-architect`**: detalle de los items de infraestructura AWS y despliegue (BL-101..BL-139) anclados a los módulos Terraform existentes, con notas explícitas de costo donde duele (NAT Gateway, VPC endpoints, EKS control plane), y RFCs para Q1, Q2, Q4, Q6, Q7, Q9.

### Qué aceptamos y editamos

- La estructura propuesta por el PM se aceptó tal cual.
- Los items de los dos agentes se aceptaron en su contenido. Se reordenaron físicamente dentro del documento agrupados por épica (cuando una épica es mixta, items dev e items infra aparecen juntos bajo el mismo encabezado de épica) para facilitar la lectura y planificación por entrega.
- La asignación de `Q3` cerrada en BL-003 con recomendación `/v1/` se aceptó por su simplicidad operativa.
- La división de owners se mantuvo conforme el reparto del PM; no se forzaron pareos adicionales más allá de los que cada agente identificó.

### Qué descartamos y por qué

- No se incluyó "Definition of Ready" además del "Definition of Done" porque añadía verbosidad sin valor en un proyecto de 2 personas — el "Depende de" cumple esa función.
- No se aceptó separar items de "tests" como épica propia: los tests viven dentro de cada item de feature (definición de listo lo exige), evitando un backlog de tests separado que tiende a quedarse atrás.
- No se aceptó la sugerencia inicial de un item "configurar PagerDuty/Datadog" — fuera de scope acordado en E1.

### Estado del Anexo IA

Este documento fue generado coordinando tres agentes especializados en una sola sesión. Cada agente recibió el contexto del proyecto verificado contra el repo, no derivado solamente de su memoria. Los outputs se revisaron por el equipo antes de mergear: los IDs no colisionan, ningún item quedó XL, y todas las Qs tienen un item dueño explícito.

---

## Próximos pasos

1. **Estuardo y Luis André:** revisar el backlog y confirmar la división de owners. Si hay desacuerdo en algún item, anotarlo y reasignar.
2. **Cerrar Q3 hoy** ejecutando BL-003 (decisión `/v1/`).
3. **Cerrar Q8 antes de D3** ejecutando BL-016 (RFC concurrencia optimista).
4. **Decidir sobre R-06** (¿el código del worker Lambda vive en este repo o en uno separado?) antes de empezar EP-12 / EP-19.
5. **Mantener este archivo vivo:** marcar items completados con `✅` al lado del ID y mover los obsoletos a una sección "Archivados" si es necesario.
