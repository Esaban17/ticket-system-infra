# Evidence — Delivery 2

Esta carpeta contiene los 3 artefactos de evidencia que pide el rubric del Delivery 2.

## 1. `compute-deployed.txt`

Output de `aws lambda get-function` confirmando que la Lambda está aplicada y en estado `Active`.

**Cómo generarlo después de `terraform apply`:**

```bash
aws lambda get-function \
  --function-name ticket-system-dev-worker \
  --query '{FunctionArn:Configuration.FunctionArn,State:Configuration.State}' \
  > infra/evidence/compute-deployed.txt
```

## 2. `state-lock-contention.png`

Screenshot que demuestra que el lock distribuido de DynamoDB rechaza un `apply` concurrente.

**Cómo capturarlo:**

1. Abrir dos terminales en `infra/`.
2. **Terminal 1**: `terraform apply -var-file=envs/dev/dev.tfvars`
3. Mientras esté corriendo, en **Terminal 2**: `terraform apply -var-file=envs/dev/dev.tfvars`
4. Terminal 2 debe fallar con `Error: Error acquiring the state lock` (DynamoDB lock id ya tomado).
5. Hacer captura de pantalla del error en Terminal 2 → guardar como `infra/evidence/state-lock-contention.png`.

## 3. `eks-nodes.png`

Screenshot de `kubectl get nodes -o wide` mostrando ≥1 nodo en estado `Ready`.

**Cómo capturarlo:**

```bash
# 1. Update kubeconfig (después de terraform apply)
aws eks update-kubeconfig --region us-east-1 --name ticket-system-dev-eks

# 2. Verificar nodos
kubectl get nodes -o wide
```

Tomar captura del output donde se vea al menos un nodo con `STATUS Ready` → guardar como `infra/evidence/eks-nodes.png`.

## Renderizado en infra/README.md

Después de generar los tres archivos, verificar que `infra/README.md` los renderice bajo la sección `## Evidence` (esto ya está hecho como placeholder — los archivos deben existir en el commit del tag `oyd-delivery-2`).

---

# Evidence — Delivery 3 (Networking Layer)

Los artefactos de texto se generan automáticamente con
[`capture-delivery-3.sh`](./capture-delivery-3.sh) (correr desde `infra/`
después de `terraform apply`):

```bash
export TF_VAR_db_password=...        # mismo valor usado en el apply
cd infra/ && ./evidence/capture-delivery-3.sh
```

Genera: `network-foundation.txt` (A), `security-groups-plan.txt` (B),
`ingress-curl.txt` (C), `e2e-get.txt` + `e2e-post.txt` (D), `eks-nodes-d3.txt` (F).

Screenshots a capturar manualmente (el script imprime qué debe mostrar cada uno):
`security-groups.png`, `ingress-healthy.png`, `e2e-storage.png`, `ci-plan.png`,
`eks-nodes-d3.png`. Todos se renderizan en `infra/README.md` bajo
`## Evidence — Delivery 3` y deben existir en el commit del tag `oyd-delivery-3`.

---

# Evidence — Delivery 4 (Async Infrastructure & Full CD Pipeline)

Los artefactos de texto se generaron con
[`capture-delivery-4.sh`](./capture-delivery-4.sh) + AWS CLI + kubectl,
corriendo desde `infra/` con el backend dev inicializado y el cluster dev activo.

## Artefactos de texto (5)

| Archivo | Deliverable | Contenido |
|---|---|---|
| `async-foundation.txt` | A — Async Messaging | `terraform output` (SQS URLs/ARNs/DLQ) + `aws sqs get-queue-attributes` con RedrivePolicy |
| `event-source-plan.txt` | B — Event-Driven Compute | `terraform state show` para SQS queue, consumer IRSA + `kubectl describe deploy` |
| `scheduler-plan.txt` | C — Scheduled Jobs | `terraform state show` para `aws_scheduler_schedule` + IAM role + `aws scheduler get-schedule` |
| `async-enqueue.txt` | E — E2E Async Proof | `curl POST /v1/notifications/enqueue → 202 + MessageId` + consumer logs + S3 object listing |
| `keda-evidence.txt` | F — KEDA EKS Integration | `kubectl get/describe scaledobject + hpa + deployment` |

## Artefactos visuales (13 PNG)

| Archivo | Deliverable | Qué muestra |
|---|---|---|
| `github-environments.png` | D — CD Pipeline | Environments `dev` (auto) y `staging` (reviewer gate) |
| `ruleset-config.png` | D — CD Pipeline | Branch ruleset `main`: deletion/non-fast-forward/required-status-checks/pull-request |
| `ruleset-blocked-merge.png` | D — CD Pipeline | PR abierto con merge bloqueado por el ruleset |
| `ci-apply-dev.png` | D — CD Pipeline | Job `Apply (dev)` — descarga de artifact tfplan + apply exitoso |
| `ci-apply-staging.png` | D — CD Pipeline | Run overview: jobs Plan→Apply(dev)→Apply(staging), gate approval y artifacts |
| `ci-drift.png` | D — CD Pipeline | Drift Detection run exitoso (no drift detectado) |
| `ci-destroy.png` | D — CD Pipeline | Destroy staging workflow_dispatch con gate aprobado |
| `scheduler.png` | C — Scheduled Jobs | AWS EventBridge Scheduler: `rate(1 day)` → Lambda worker, estado ENABLED |
| `async-object.png` | E — E2E Async Proof | S3 bucket `async/` con el objeto `b5b5b994-…` escrito por el consumer |
| `event-source.png` | B — Event-Driven Compute | `kubectl describe deploy ticket-system-consumer` — KEDA scale events |
| `keda-scaled-object.png` | F — KEDA EKS Integration | `kubectl describe scaledobject` — READY=True, trigger aws-sqs-queue |
| `keda-hpa.png` | F — KEDA EKS Integration | `kubectl get hpa -A` — HPA creado por KEDA |
| `async-consumer.png` | E — E2E Async Proof | Logs del consumer: `consumer_started` → `message_processed` → S3 key |

## Reproducibilidad

```bash
# Desde infra/ con backend dev inicializado y kubeconfig actualizado:
aws eks update-kubeconfig --name ticket-system-dev-eks --region us-east-1
export TF_VAR_db_password='<password>'
bash evidence/capture-delivery-4.sh

# E2E (requiere ALB activo):
export E2E_JWT_TOKEN=$(curl -s -X POST http://<alb>/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ticket-system.dev","password":"any"}' | jq -r .token)
bash evidence/capture-delivery-4.sh  # re-corre con el token
```

Todos los artefactos se renderizan en `infra/README.md` bajo
`## Evidence — Delivery 4` y deben existir en el commit del tag `oyd-delivery-4`.
