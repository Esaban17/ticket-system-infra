# ADR 0013 — Jobs programados: EventBridge Scheduler + Lambda report-generator

**Fecha:** 2026-06-21
**Estado:** Aceptado
**Owners:** Estuardo (D4 Deliverable C — infra + Lambda)
**Cierra:** Elección de trigger y función destino para jobs programados (D4 spec §3.3)
**Items relacionados:** Delivery 4 Deliverable C, ADR 0010, ADR 0011

---

## Contexto

Delivery 4 §3.3 requiere un job programado (scheduled job) integrado con el
flujo async. El job debe: (a) usar un servicio de scheduling gestionado por AWS,
(b) invocar un Lambda con un rol IAM dedicado y de alcance mínimo, y (c)
documentar por qué el rol del scheduler es más estrecho que el execution role
del Lambda.

El proyecto ya tiene un Lambda Python provisionado desde D2 como placeholder
del worker async. En D4, su handler es reemplazado por la lógica de
report-generator (lista objetos async en S3, escribe un resumen diario).

---

## Opciones consideradas (trigger)

### Opción A — EventBridge Rules (legacy)

| Aspecto | Evaluación |
|---|---|
| Recurso Terraform | `aws_cloudwatch_event_rule` + `aws_cloudwatch_event_target`. |
| Expresiones | rate() y cron(). |
| Timezone | No soportado nativo en EventBridge Rules; siempre UTC. |
| Estado | Servicio en modo de mantenimiento; AWS recomienda migrar a Scheduler. |

### Opción B — EventBridge Scheduler (elegida)

| Aspecto | Evaluación |
|---|---|
| Recurso Terraform | `aws_scheduler_schedule`. |
| Expresiones | rate() y cron(). |
| Timezone | `schedule_expression_timezone` — soporta IANA timezones nativo. |
| Estado | Servicio activo; es el reemplazo oficial de EventBridge Rules para scheduling. |
| Rol dedicado | Requiere un IAM role propio (trust: `scheduler.amazonaws.com`). |

---

## Opciones consideradas (función destino)

### Opción C — Lambda existente (report-generator)

Reutilizar el Lambda `ticket-system-${env}-worker` con handler actualizado:
lista objetos S3 bajo el prefijo `async/`, escribe un resumen JSON en
`reports/async-summary-<invocationId>.json`.

- **Ventaja**: no hay que provisionar un nuevo Lambda; el módulo `compute`
  ya existe y solo necesita un nuevo handler y permisos S3 adicionales.
- **Desventaja**: el nombre "worker" del Lambda no es semánticamente exacto para
  un generador de reportes. Aceptable en un contexto académico.

### Opción D — Lambda nuevo dedicado

Provisionar un segundo Lambda `report-generator` en un nuevo módulo.

- **Ventaja**: nombre semántico correcto.
- **Desventaja**: duplica el módulo `compute`; aumenta el costo de EIP + ENIs
  en VPC. No aporta beneficio técnico adicional para este entorno.

---

## Criterios de decisión

1. **Principio de mínimo privilegio**: el rol del scheduler debe poder SOLO
   invocar el Lambda destino. El execution role del Lambda tiene además
   CloudWatch Logs + S3 (ListBucket + PutObject). El scheduler no necesita ni
   puede obtener esos permisos.
2. **EventBridge Scheduler**: es el servicio recomendado por AWS desde 2023 y
   el que referencia el spec D4.
3. **Reutilizar el Lambda existente**: menos recursos, menos complejidad, el
   módulo `compute` ya está probado en el pipeline.

---

## Decisión

**Opción B (EventBridge Scheduler) + Opción C (Lambda report-generator existente).**

### Scheduler IAM role (dedicado, más estrecho que el exec role del Lambda)

```
Rol: ${name}-role
Trust: { Service: "scheduler.amazonaws.com" }
Inline policy: {
  sid: "AllowInvokeTargetLambda"
  actions: ["lambda:InvokeFunction"]
  resources: ["<EXACT Lambda ARN>"]   # sin wildcard
}
```

El execution role del Lambda tiene:
- `logs:CreateLogStream + PutLogEvents` sobre el log group específico
- `s3:ListBucket` sobre el bucket ARN
- `s3:PutObject` sobre `${bucket}/*`
- `AWSLambdaVPCAccessExecutionRole` (ENI management)

El rol del scheduler NO tiene ninguno de esos permisos — solo puede disparar
`lambda:InvokeFunction`. Este es el principio de separación de roles:
quien invoca ≠ quien ejecuta.

### Lambda handler (report-generator)
- Lista objetos bajo `async/` en el bucket S3.
- Escribe `reports/async-summary-${invocationId}.json`.
- Env var `BUCKET_NAME` inyectada desde el módulo `compute` (output de
  `module.storage.bucket_id`) — sin hardcode.

### Schedule
- `rate(1 day)` por defecto; configurable vía `var.scheduler_expression`.
- `flexible_time_window = OFF` — dispara exactamente a la hora configurada.

---

## Consecuencias

✅ **Positivas**

- Rol del scheduler mínimamente privilegiado: solo `lambda:InvokeFunction` en
  el ARN exacto. No puede leer ni escribir S3, ni acceder a logs.
- Sin nuevo recurso Lambda: se reutiliza el módulo `compute` existente.
- EventBridge Scheduler soporta timezones IANA — útil si se requiere ajustar
  a horario de Guatemala en el futuro.
- El Lambda escribe objetos versionados por `invocationId` — el historial de
  reportes es trazable en S3.

⚠️ **Negativas / trade-offs aceptados**

- **Nombre semántico inconsistente**: el Lambda se llama `worker` pero actúa
  como `report-generator`. Aceptable en contexto académico; en producción se
  crearía un Lambda separado.
- **El Lambda está en VPC** (requerimiento de D2): la invocación desde el
  Scheduler incurre en cold-start + ENI attachment. Mitigado por el timeout
  de 30s y la frecuencia diaria.
- **Sin retry automático configurable en el scheduler**: el Scheduler tiene un
  mecanismo de retry básico. Si el Lambda falla, el reporte no se genera ese
  día. Aceptable para un reporte académico.

---

## Referencias

- Delivery 4 PDF §3.3 — "Scheduled Jobs"
- `infra/modules/scheduler/` — implementación
- `infra/modules/compute/lambda-src/index.py` — handler report-generator
- `infra/modules/compute/main.tf` — permisos S3 del Lambda
- ADR 0010 — cola SQS (contexto del flujo async que el report-generator monitorea)
