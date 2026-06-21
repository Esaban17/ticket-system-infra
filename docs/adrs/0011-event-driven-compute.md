# ADR 0011 — Cómputo event-driven: worker EKS + KEDA vs Lambda ESM

**Fecha:** 2026-06-21
**Estado:** Aceptado
**Owners:** Estuardo (D4 Deliverable B, F — infra) · Estuardo (D4 Deliverable E — API)
**Cierra:** Elección de track de consumidor async (D4 spec §3.2)
**Items relacionados:** Delivery 4 Deliverables B/E/F, ADR 0010, BL-114

---

## Contexto

Delivery 4 requiere consumir mensajes de la cola SQS (D-A) con compute
event-driven. El spec §3.2 describe dos tracks:

1. **Track Lambda**: `aws_lambda_event_source_mapping` — Lambda consumes SQS
   automáticamente; AWS gestiona el polling y el commit.
2. **Track VPC worker (polling)**: un Deployment en EKS hace long-polling a SQS
   y se auto-escala con KEDA (Deliverable F, +25 pts).

La elección impacta directamente la calificación del rubric (el track Lambda no
puede acumular los +25 pts del Deliverable F).

Restricción de arquitectura ya en producción: el proyecto usa EKS como plataforma
de despliegue principal (D3). Introducir un segundo patrón de compute (Lambda)
para el mismo workload añade complejidad sin beneficio neto para un equipo cuya
expertise está centrada en Kubernetes.

---

## Opciones consideradas

### Opción A — Lambda con Event Source Mapping

| Aspecto | Evaluación |
|---|---|
| Implementación | `aws_lambda_event_source_mapping` sobre la cola SQS. Lambda hace el polling. |
| Escalado | Automático por AWS; hasta 60 instancias concurrentes en batching mode. |
| Operación | Sin Deployment, sin pods, sin KEDA. |
| Puntos del rubric | Deliverable B (18 pts). NO aplica para Deliverable F. |
| Coherencia con el stack | El equipo ya tiene todo el tooling de K8s; Lambda añade un runtime diferente. |

### Opción B — Worker Deployment EKS + KEDA (track VPC worker)

| Aspecto | Evaluación |
|---|---|
| Implementación | Deployment de K8s que hace long-poll SQS; KEDA ScaledObject escala replicas. |
| Escalado | KEDA controla el HPA basándose en `ApproximateNumberOfMessages`. |
| Operación | Necesita KEDA instalado (Helm release); Deployment con IRSA dedicado. |
| Puntos del rubric | Deliverable B (18 pts) + Deliverable F (+25 pts) = **43 pts** totales. |
| Coherencia con el stack | Mismo tooling que el resto del proyecto (K8s, IRSA, Helm). |

---

## Criterios de decisión

1. **Maximizar puntuación**: el rubric premia explícitamente el track EKS/KEDA
   con +25 pts adicionales (Deliverable F). El track Lambda no los suma.
2. **Coherencia operacional**: el equipo ya opera EKS; añadir Lambda implica
   mantener dos modelos de runtime y despliegue distintos.
3. **Aislamiento de dominio**: el mismo VPC endpoint SQS ya existe. El worker
   hace polling desde los nodos EKS — sin costa NAT Gateway, sin cold-starts.
4. **IRSA y least-privilege**: ambos tracks son compatibles; elegimos IRSA en
   ambos (consumidor SA y KEDA operator SA).
5. **Sin dos consumidores en la misma cola**: si Lambda ESM + worker Deployment
   se activaran simultáneamente sobre la misma cola, competirían por mensajes.
   El track VPC worker evita este conflict al ser el único consumidor.

---

## Decisión

**Opción B — Worker Deployment en EKS + KEDA ScaledObject.**

- El **consumidor** es un Deployment de Kubernetes (`ticket-system-consumer`)
  que reutiliza la imagen ECR del API con un command override:
  `["node", "dist/workers/async-consumer/main.js"]`.
- El **IRSA del consumidor** (`${cluster}-consumer`) tiene solo:
  `sqs:ReceiveMessage + sqs:DeleteMessage + sqs:GetQueueAttributes` sobre la
  cola ARN + `s3:PutObject` sobre el bucket ARN.
- **KEDA** se instala vía `helm_release` en el namespace `keda`. El operador
  usa su propio IRSA (`${cluster}-keda-operator`, `sqs:GetQueueAttributes`)
  con `identityOwner=operator` en el ScaledObject trigger — sin carga adicional
  en los pods del consumidor.
- El ScaledObject escala de 0 a `max_replica_count` réplicas, con umbral
  `queue_length_trigger` mensajes/réplica.

Se acepta el trade-off de mayor complejidad de setup (Helm + CRDs + IRSA
adicional) a cambio de la puntuación extra y la coherencia operacional.

---

## Consecuencias

✅ **Positivas**

- **+25 pts** del Deliverable F (EKS Async Integration).
- Escalado automático basado en profundidad de cola — sin intervención manual.
- Coherencia total con el stack EKS+IRSA existente.
- El consumidor puede escalar a 0 réplicas cuando la cola está vacía (costo cero).
- Un único consumidor por cola: sin conflicto con Lambda ESM.

⚠️ **Negativas / trade-offs aceptados**

- **Mayor complejidad de setup**: Helm release de KEDA + IRSA adicional del
  operador + CRD ScaledObject. Mitigado con el módulo `keda` de Terraform.
- **Primer apply require dos fases** (EKS → CRDs → ScaledObject): ya documentado
  en el apply workflow y en la `README Evidence`.
- **Cold-start de réplicas**: desde 0 réplicas, KEDA tarda ~30s en escalar la
  primera réplica. Aceptable para notificaciones asíncronas.

---

## Referencias

- Delivery 4 PDF §3.2 — "Event-Driven Compute"
- `infra/modules/keda/` — implementación KEDA
- `infra/modules/ingress/` — consumer Deployment + IRSA
- `app/api/src/workers/async-consumer/main.ts` — entry point del consumidor
- ADR 0010 — diseño de la cola SQS
