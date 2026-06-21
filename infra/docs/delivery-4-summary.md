# Delivery 4 — Async Infrastructure & Full CD Pipeline

**Fecha de entrega:** 2026-06-21
**Equipo:** Estuardo Sabán
**Tag:** `oyd-delivery-4`
**Repositorio:** github.com/gitcombo/ticket-system-infra

---

## 1. Async Messaging Module (Deliverable A — 20 pts)

Se implementa el módulo `infra/modules/async/` con dos colas SQS Standard
(ADR 0010):

| Recurso | Nombre |
|---|---|
| Cola principal | `ticket-system-{env}-async-main` |
| Dead Letter Queue | `ticket-system-{env}-async-dlq` |

La cola principal tiene una `redrive_policy` que mueve mensajes a la DLQ después
de `maxReceiveCount=3` intentos fallidos. Los ARNs de ambas colas se exponen como
outputs y se referencian **sin wildcards** en todas las políticas IAM (productor
y consumidor). La retención de la DLQ es de 14 días.

**Evidencia:** `infra/evidence/async-foundation.txt` — salida de `terraform output`.

---

## 2. Event-Driven Compute (Deliverable B — 18 pts)

**Track elegido: VPC Worker (EKS Deployment + polling)** — track permitido por
el spec §3.2 y que habilita el Deliverable F (+25 pts) (ADR 0011).

### Arquitectura de consumo

```
SQS main queue
  ↓ (long-poll, batch_size=10)
Deployment "ticket-system-consumer" (EKS, namespace ticket-system)
  └─ IRSA "ticket-system-dev-eks-consumer"
       sqs:ReceiveMessage + sqs:DeleteMessage + sqs:GetQueueAttributes (queue ARN)
       s3:PutObject (bucket/*)
  ↓ por mensaje: escribe s3://bucket/async/<MessageId>
                 loguea messageId
                 DeleteMessage
```

### Productor (API NestJS)

`POST /v1/notifications/enqueue` — `NotificationsController` llama a
`SQSClient.SendMessageCommand`. Retorna **HTTP 202 + MessageId**. La URL de la
cola viene del ConfigMap (`SQS_QUEUE_URL`), poblado por Terraform desde el
output `module.async.queue_url`.

IRSA del productor: `ticket-system-dev-eks-app` — añade `sqs:SendMessage` al
mismo rol que ya tiene acceso S3 (política extendida sin wildcards).

### IAM least-privilege

| Rol | Permisos | Recurso |
|---|---|---|
| `*-app` (producer IRSA) | `sqs:SendMessage` | queue ARN exacto |
| `*-consumer` (consumer IRSA) | `sqs:ReceiveMessage + DeleteMessage + GetQueueAttributes` | queue ARN exacto |
| `*-consumer` | `s3:PutObject` | `${bucket}/*` |

**Evidencia:** `infra/evidence/event-source-plan.txt` + `infra/evidence/event-source.png`.

---

## 3. Full CD Pipeline (Deliverable D — 20 pts)

### Layout Terraform multi-entorno (Pattern A)

`infra/backend.tf` es ahora un config parcial (`backend "s3" {}`). Cada entorno
tiene su propio archivo:

| Entorno | Backend config | Tfvars | State key |
|---|---|---|---|
| dev | `envs/dev/backend-dev.hcl` | `envs/dev/dev.tfvars` | `infra/dev/terraform.tfstate` |
| staging | `envs/staging/backend-staging.hcl` | `envs/staging/staging.tfvars` | `infra/staging/terraform.tfstate` |

**Diferencias staging vs dev (≥3 valores distintos):**
- `db_instance_class = db.t4g.small` (vs `db.t4g.micro` en dev)
- `eks_node_max_size = 3` (vs `2` en dev)
- `eks_node_desired_size = 2` (vs `1` en dev)
- `sqs_message_retention_seconds = 86400` (vs `345600` en dev)
- `keda_max_replica_count = 3` (vs `5` en dev)

### Pipeline CI (`terraform-ci.yml`)

Tres jobs separados = tres status checks distintos en el PR:

| Job | Check name | Qué hace |
|---|---|---|
| `fmt` | fmt | `terraform fmt --check -recursive` |
| `validate` | validate | `terraform init` + `terraform validate` |
| `plan` | plan | `terraform plan -out=tfplan` + sube artifact + PR comment |

El branch ruleset de `main` requiere los tres checks antes de permitir merge.

### Pipeline Apply (`terraform-apply.yml`) — promoción de artefacto

```
plan-dev → [artifact tfplan-dev-<run_id>] → apply-dev (env: dev, auto)
                                                    ↓
                                          apply-staging (env: staging, reviewer: gitcombo)
```

`apply-dev` descarga el artefacto y ejecuta `terraform apply tfplan` — NO re-planea.
`apply-staging` requiere aprobación manual del reviewer configurado en el GitHub Environment.

### Otros workflows

- **`terraform-destroy.yml`**: `workflow_dispatch` con inputs `environment` (dev/staging)
  + `confirm = "destroy"`. Gated por el GitHub Environment del entorno elegido.
- **`terraform-drift.yml`**: cron diario (07:00 UTC). `terraform plan -detailed-exitcode`;
  escribe resultado en `$GITHUB_STEP_SUMMARY`; falla el run si detecta drift.

**Trade-off documentado:** artefacto vs re-plan (ADR 0012). La promoción del
artefacto garantiza que el apply ejecuta exactamente el plan revisado en el PR.

**Evidencia:** `infra/evidence/github-environments.png`, `ci-apply-dev.png`,
`ci-apply-staging.png`, `ci-destroy.png`, `ci-drift.png`, `ruleset-config.png`.

---

## 4. Scheduled Jobs (Deliverable C — 14 pts)

**EventBridge Scheduler** invoca el Lambda `ticket-system-{env}-worker` (reescrito
como report-generator) una vez al día (ADR 0013).

### Rol IAM del scheduler (más estrecho que el execution role del Lambda)

| Rol | Permite | Recurso |
|---|---|---|
| `*-report-scheduler-role` | `lambda:InvokeFunction` | Lambda ARN exacto |
| Execution role del Lambda | `logs:CreateLogStream + PutLogEvents` | Log group específico |
| Execution role del Lambda | `s3:ListBucket + s3:PutObject` | Bucket ARN / bucket/* |

El scheduler **no** tiene permisos de logs ni S3. Esta separación de roles es la
diferencia clave entre el rol del invoker (scheduler) y el rol del invocado (Lambda).

### Lambda report-generator

1. Lista objetos bajo `async/` en el bucket S3 (`s3:ListBucket`).
2. Escribe `reports/async-summary-<invocationId>.json` (`s3:PutObject`).
3. `BUCKET_NAME` inyectado como env var desde el módulo (output de storage).

**Evidencia:** `infra/evidence/scheduler.png` (consola EventBridge) + `scheduler-plan.txt`.

---

## 5. End-to-End Async Proof (Deliverable E — 10 pts)

Flujo completo demostrado:

```
1. curl -X POST http://<alb>/v1/notifications/enqueue \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"event":"ticket_creado","ticketId":"<uuid>"}'
   → HTTP 202 {"status":"accepted","messageId":"<uuid>"}

2. Consumer pod (logs):
   {"event":"message_processed","messageId":"<uuid>","s3Key":"async/<uuid>"}

3. S3 object:
   s3://ticket-system-dev-attachments-galileo-pdds/async/<uuid>
```

**Exactamente dos funciones** implementadas (per spec):
- **Producer**: `NotificationsService.enqueue()` — `app/api/src/notifications/`
- **Consumer**: loop de polling — `app/api/src/workers/async-consumer/main.ts`

**IAM least-privilege**: producer envía, consumer recibe/borra — nunca al revés.
El consumer no tiene `sqs:SendMessage`; el producer no tiene `sqs:ReceiveMessage`.

**Evidencia:** `infra/evidence/async-enqueue.txt` + `async-consumer.png` + `async-object.png`.

---

## 6. EKS Async Integration / KEDA (Deliverable F — +25 pts)

KEDA (`keda-operator`, Helm chart `2.15.1`) se instala en el namespace `keda`
y auto-escala el consumer Deployment basándose en la profundidad de la cola.

### ScaledObject

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: ticket-system-consumer-scaledobject
  namespace: ticket-system
spec:
  scaleTargetRef:
    name: ticket-system-consumer
  minReplicaCount: 0   # escala a cero cuando la cola está vacía
  maxReplicaCount: 5   # (3 en staging)
  triggers:
  - type: aws-sqs-queue
    metadata:
      queueURL: <queue_url>   # desde ConfigMap
      queueLength: "5"        # mensajes/réplica
      awsRegion: us-east-1
      identityOwner: operator # KEDA operator usa su IRSA
```

### KEDA operator IRSA

Rol `ticket-system-dev-eks-keda-operator`:
- `sqs:GetQueueAttributes` sobre el queue ARN exacto.
- Anotado en el SA `keda:keda-operator` mediante `helm set`.

**Evidencia:** `infra/evidence/keda-scaled-object.png` + `keda-hpa.png`.

---

## Trade-offs principales (requeridos por el rubric)

1. **VPC worker (KEDA) vs Lambda ESM**: elegimos el track EKS para ganar +25 pts
   del Deliverable F y mantener coherencia operacional. Trade-off: mayor
   complejidad de setup (Helm + CRDs + IRSA adicional). Ver ADR 0011.

2. **Plan-artifact promotion vs re-plan**: el apply descarga el tfplan del job
   de CI en lugar de re-planear. Garantiza que el apply ejecuta exactamente
   lo revisado, a costa de manejar artefactos entre jobs del mismo workflow run.
   Ver ADR 0012.
