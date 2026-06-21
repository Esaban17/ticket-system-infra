# ADR 0010 — Diseño de la capa de mensajería asíncrona (SQS)

**Fecha:** 2026-06-21
**Estado:** Aceptado
**Owners:** Estuardo (BL-114, BL-115 — infra) · Estuardo (BL-031 — lado API)
**Cierra:** Q relacionada a la capa async del Delivery 4
**Items relacionados:** Delivery 4 Deliverable A, BL-114 (SQS queue), BL-115 (DLQ), ADR 0011

---

## Contexto

Delivery 4 requiere implementar una capa de mensajería asíncrona como base del
flujo event-driven. La elección del tipo de cola, la estrategia de dead-lettering
y los parámetros de retención afectan directamente: (a) el costo operativo,
(b) la fiabilidad ante fallos del consumidor, y (c) la capacidad de depurar
mensajes fallidos.

El sistema ya tiene un VPC endpoint de SQS (interfaz) y un endpoint de S3
(gateway) provisionados por el módulo `network` (D3), lo que garantiza que el
tráfico al servicio SQS permanece dentro de la VPC sin pasar por internet ni el
NAT Gateway.

---

## Opciones consideradas

### Opción A — SQS Standard

| Aspecto | Evaluación |
|---|---|
| Orden | Best-effort; puede entregar fuera de orden. Aceptable para notificaciones. |
| Throughput | Ilimitado. Escala horizontalmente sin configuración adicional. |
| Costo | Más bajo que FIFO (~$0.40/M vs ~$0.50/M de solicitudes). |
| Duplicados | Posibles (at-least-once delivery). Consumidor debe ser idempotente. |
| Soporte KEDA | Trigger `aws-sqs-queue` es nativo para Standard. |

### Opción B — SQS FIFO

| Aspecto | Evaluación |
|---|---|
| Orden | Estrictamente FIFO dentro de un grupo de mensajes. |
| Throughput | Limitado (3.000 mensajes/s con batching, 300 sin). |
| Costo | Mayor (~25%). |
| Duplicados | Exactly-once processing con deduplication ID. |
| Soporte KEDA | Soportado, pero requiere `queueUrl` terminado en `.fifo`. |

---

## Criterios de decisión

1. **Requisito de entrega**: el spec D4 §3.2 no exige FIFO; "standard queue" es
   el ejemplo dado.
2. **Throughput y escala**: las notificaciones de ticket no tienen restricción
   de orden estricto entre tickets distintos.
3. **Costo académico**: FIFO añade costo sin beneficio para este caso de uso.
4. **Idempotencia del consumidor**: el consumidor escribe S3 con key=MessageId.
   Si SQS entrega dos veces el mismo mensaje, S3 simplemente sobreescribe el
   mismo objeto (sin efecto colateral).
5. **Dead-letter queue**: necesaria para preservar mensajes fallidos y evitar
   que el consumidor quede atascado en un mensaje irrecuperable.

---

## Decisión

**Opción A — SQS Standard con DLQ.**

- **Cola principal** (`${prefix}-main`): Standard, `visibility_timeout=60s`,
  `message_retention=4 días`, `redrive_policy → DLQ después de 3 intentos`.
- **DLQ** (`${prefix}-dlq`): Standard, `retention=14 días` (tiempo para que un
  operador inspeccione y replay los mensajes fallidos).
- **No wildcards** en ninguna política IAM: el ARN de cada cola es exportado
  como output y referenciado exactamente en las políticas del productor y el
  consumidor.

---

## Consecuencias

✅ **Positivas**

- Throughput ilimitado; no hay cuello de botella para el caso académico.
- Bajo costo operativo en un entorno universitario.
- DLQ garantiza que los mensajes fallidos se preservan (no se pierden).
- El VPC endpoint SQS existente evita cargos de NAT Gateway por tráfico de cola.
- El consumidor es naturalmente idempotente (S3 put con key fija = overwrite).

⚠️ **Negativas / trade-offs aceptados**

- **Entrega at-least-once**: el consumidor puede recibir el mismo mensaje dos
  veces. Mitigado por la idempotencia de la operación S3 (key = MessageId).
- **Sin orden garantizado**: aceptable para notificaciones de soporte.
- **3 intentos antes de DLQ**: mensajes fallidos visibles en la DLQ pero no
  se procesan automáticamente. Requiere intervención manual o un proceso de
  replay (fuera del alcance de D4).

---

## Referencias

- Delivery 4 PDF §3.2 — "Async Messaging Module"
- `infra/modules/async/` — implementación
- ADR 0011 — cómputo event-driven (consumidor + KEDA)
