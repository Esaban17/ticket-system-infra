# ADR 0006 — Mecanismo del job de escalamiento por SLA

**Fecha:** 2026-06-09
**Estado:** Aceptado
**Owners:** Estuardo Sabán (BL-116)
**Cierra:** RFC Q6 (E1 — Asíncrono / Cómputo, CU-04)
**Relacionado:** BL-117 (implementación del schedule), BL-118 (alarma de fallos), ADR/`docs/trade-offs/01-compute.md` (worker Lambda)

---

## Contexto

CU-04 exige que un ticket que rebasa su SLA sin resolverse sea **escalado**
automáticamente: subir `escalation_level`, reasignar/notificar al siguiente
nivel de soporte y emitir el evento correspondiente. El cómputo del worker
asíncrono ya está decidido en `docs/trade-offs/01-compute.md`: es un **AWS
Lambda** (placeholder en D2, lógica real en D4). Lo que esta decisión cierra
no es *quién* ejecuta el escalamiento sino **qué dispara** esa ejecución y con
qué garantías.

El problema tiene dos formas canónicas de resolverse en AWS:

1. **Barrido por reloj (cron-driven sweep).** Un planificador invoca al Lambda
   en una cadencia fija; el Lambda consulta "qué tickets vencieron" y los
   procesa en lote.
2. **Mensaje retardado por ticket (per-ticket delayed message).** Al crear el
   ticket se encola un mensaje SQS con `DelaySeconds`/visibilidad diferida que
   "vence" justo cuando vence el SLA, disparando el escalamiento de *ese*
   ticket.

Ambos terminan llamando al mismo Lambda; difieren en el modelo de disparo, y
ese modelo determina idempotencia, costo, simplicidad operativa y riesgo de
deadline perdido.

> Restricción de diseño previa (PM): concurrencia con **optimistic locking**
> vía columna `version`. La idempotencia del escalamiento se apoya en ese
> mismo principio: un `UPDATE` condicional, no en un lock distribuido.

## Opciones consideradas

| Opción | Disparo | Estado que mantiene | Encaje con infra actual |
|---|---|---|---|
| **A (elegida) — EventBridge Scheduler → Lambda** | `aws_scheduler_schedule` con cron/rate fijo (p. ej. cada 5 min) invoca al Lambda con payload `{"job":"sla_escalation"}` | Ninguno — el estado vive en RDS (`tickets.sla_due_at`, `state`, `escalation_level`) | Reusa el Lambda worker existente; solo agrega 1 schedule + 1 IAM role |
| B — SQS con mensajes retardados por ticket | Al crear el ticket, `SendMessage` con `DelaySeconds` ≤ 15 min (o re-encolado escalonado para SLAs largos) | El "cuándo" vive en la cola; cada ticket = 1+ mensaje en vuelo | Reusa la cola SQS, pero exige acoplar el path de creación de ticket al encolado y manejar reprogramación al editar SLA |
| C — ECS Scheduled Task / cron en worker permanente | Tarea programada o `cron` dentro de un contenedor siempre encendido | Igual que A (estado en RDS) | Introduce un plano de cómputo nuevo (contenedor 24/7) que `01-compute.md` ya descartó por costo y redundancia con EKS |

## Criterios

Se evalúa A vs B (C queda fuera por la decisión previa de cómputo: añade un
servidor de larga vida que duplica el plano de contenedores de EKS y rompe el
modelo serverless ya elegido). Los ejes que pidió la RFC:

### 1. Idempotencia

| | A — Scheduler sweep | B — SQS retardado |
|---|---|---|
| Disparos duplicados | Posibles (solapamiento de corridas si una tarda > cadencia) | Posibles (SQS estándar entrega *at-least-once*; FIFO encarece y no garantiza timing) |
| Guardia natural | **`UPDATE` condicional sobre el ticket** (ver abajo) | Mismo `UPDATE` condicional — la cola no aporta idempotencia por sí sola |
| Reprogramación al cambiar el SLA | Trivial: el siguiente barrido lee el `sla_due_at` actual | Difícil: hay que cancelar/reemplazar el mensaje ya encolado (SQS no permite editar un mensaje en vuelo) |

En **ambas** opciones la idempotencia real la da el `UPDATE` condicional, no el
mecanismo de disparo. Pero B añade un segundo problema —**coherencia entre la
cola y la BD**— que A no tiene, porque en A la BD es la única fuente de verdad
del "cuándo".

### 2. Costo

| | A — Scheduler sweep | B — SQS retardado |
|---|---|---|
| Disparos/mes | ~8,640 (cada 5 min) — dentro del free tier de Scheduler (14M/mes gratis) | 1+ mensaje por ticket creado + reintentos/reprogramaciones |
| Invocaciones Lambda | ~8,640, la mayoría no-op (barren 0 vencidos) | Solo cuando vence un SLA, pero amplificadas por reprogramación |
| Veredicto | **~$0** (Scheduler free tier + Lambda free tier) | ~$0 también, pero costo *de complejidad* mayor |

A escala de curso ambos son ~$0. El diferenciador no es la factura sino el
costo operativo (criterio 3).

### 3. Simplicidad operativa

| | A — Scheduler sweep | B — SQS retardado |
|---|---|---|
| Piezas nuevas | 1 schedule + 1 IAM role (`lambda:InvokeFunction` sobre 1 ARN) | Acoplar el productor (creación de ticket) al encolado, manejar `DelaySeconds` ≤ 900s (límite SQS), partir SLAs largos en re-encolados |
| Punto de verdad | RDS (un solo lugar) | RDS **+** mensajes en vuelo en SQS (dos lugares que pueden divergir) |
| Observabilidad | "¿corrió el barrido?" = 1 métrica en CloudWatch; alarma ya planeada (BL-118) | "¿hay mensajes huérfanos / mal reprogramados?" — difícil de inspeccionar |
| Límite duro | Ninguno relevante | `DelaySeconds` máx **15 min**: cualquier SLA > 15 min obliga a re-encolar, multiplicando la lógica |

El límite de 15 minutos de `DelaySeconds` de SQS es decisivo: los SLAs de
soporte se miden en horas o días, así que B **no puede** representar un SLA
largo con un solo mensaje y degenera en un esquema de re-encolado periódico…
que es exactamente un barrido por reloj, pero peor distribuido.

### 4. Riesgo de deadline perdido (missed-deadline)

| | A — Scheduler sweep | B — SQS retardado |
|---|---|---|
| Latencia de detección | Acotada por la cadencia (≤ 5 min de retraso máx) | Teóricamente exacta… si el mensaje sigue válido |
| Falla silenciosa | Si el barrido no corre, BL-118 lo detecta (alarma sobre `Errors`/invocaciones) | Si un mensaje se pierde/expira/queda mal reprogramado, **no hay barrido de respaldo**: ese ticket nunca escala y nadie se entera |
| Recuperación | El siguiente barrido recupera **todo** lo vencido (es self-healing) | Requiere reconstruir el estado de la cola desde la BD manualmente |

A cambia precisión teórica por **resiliencia**: acepta hasta `cadencia` de
retraso a cambio de que *ningún* ticket vencido quede sin escalar, porque cada
corrida re-evalúa el universo completo desde la BD.

## Decisión

**EventBridge Scheduler invoca al Lambda de escalamiento en una cadencia
fija** (rate/cron, p. ej. cada 5 min) **con un `UPDATE` condicional idempotente
que evita el doble escalamiento.**

El Lambda, en cada corrida:

1. Selecciona los tickets vencidos y aún escalables:

   ```sql
   SELECT id, version, escalation_level
   FROM tickets
   WHERE state IN ('open', 'in_progress')
     AND sla_due_at < now()
     AND escalation_level < :max_level;
   ```

2. Para cada uno, aplica un **`UPDATE` condicional** (compare-and-set sobre
   `version` + `escalation_level`, alineado con el optimistic locking del
   equipo). Solo *una* ejecución gana la carrera; las demás afectan 0 filas y
   se saltan el ticket sin error:

   ```sql
   UPDATE tickets
   SET escalation_level = escalation_level + 1,
       version          = version + 1,
       escalated_at     = now()
   WHERE id = :id
     AND version = :version          -- optimistic lock: nadie tocó la fila
     AND state IN ('open','in_progress')
     AND escalation_level < :max_level;
   -- rows_affected = 1 -> escaló; 0 -> ya lo escaló otra corrida/proceso
   ```

3. Solo cuando `rows_affected = 1` emite la notificación/evento del nuevo
   nivel. Así la guardia de idempotencia y el efecto externo comparten la
   misma transacción de decisión.

La cadencia, el ARN del Lambda y el IAM role los materializa **BL-117**
(`aws_scheduler_schedule` con cron `*/5 * * * ? *`, DLQ apuntando a la DLQ de
SQS compartida).

### Por qué A y no B

- **El estado del "cuándo" vive en RDS, no en una cola.** Una sola fuente de
  verdad; editar el SLA de un ticket no requiere cancelar mensajes en vuelo.
- **El límite de `DelaySeconds` (15 min) de SQS** hace que B no pueda modelar
  SLAs de horas/días sin degenerar en re-encolado periódico.
- **A es self-healing:** cada barrido recupera todo lo vencido; B no tiene red
  de seguridad ante un mensaje perdido o mal reprogramado.
- **A reusa el Lambda worker existente** y solo agrega un schedule + un role
  con `lambda:InvokeFunction` sobre un único ARN (sin wildcards, cumple la
  rúbrica IAM).

## Consecuencias

✅ **Positivas**

- **Idempotencia garantizada por la BD**, no por el broker: el `UPDATE`
  condicional sobre `version`/`escalation_level` hace inofensivos los disparos
  duplicados, vengan de un solapamiento de barridos o de un retry de Lambda.
- **Una sola fuente de verdad (RDS).** No hay estado distribuido entre cola y
  base de datos que pueda divergir.
- **Resiliencia self-healing:** una corrida fallida no pierde tickets; la
  siguiente recupera todo lo vencido. La alarma de BL-118 cubre el caso de que
  el barrido deje de correr.
- **Costo ~$0** (Scheduler y Lambda dentro del free tier) y **footprint IAM
  mínimo** (un role, un ARN, sin wildcards).
- **Desacopla scheduling de compute:** cambiar la cadencia es editar una
  variable de Terraform; no toca el código del Lambda.

⚠️ **Negativas / trade-offs aceptados**

- **Latencia de detección acotada por la cadencia.** Con barrido cada 5 min, un
  ticket puede escalar hasta ~5 min después de vencer su SLA. Aceptable para
  SLAs medidos en horas; si algún SLA exigiera precisión al minuto se baja la
  cadencia (más invocaciones no-op, sigue dentro de free tier).
- **Invocaciones "vacías".** La mayoría de los barridos no encuentran tickets
  vencidos y terminan en no-op. Es el costo de la simplicidad; es despreciable
  en factura y en CPU.
- **El barrido escala con el volumen de tickets, no con los que vencen.** A
  escala de curso (≤ ~200 tickets concurrentes) un `SELECT` indexado por
  `(state, sla_due_at)` es trivial. Si el volumen creciera mucho, se acota el
  lote por corrida (paginación) sin cambiar el mecanismo.
- **Requiere columnas de dominio** (`sla_due_at`, `escalation_level`,
  `escalated_at`, `version`) que hoy no están en el `schema.prisma` mínimo de
  D3; se agregan al implementar CU-04 en D4 (fuera del alcance de este ADR).

## Referencias

- Backlog: `docs/backlog.md` — BL-116 (este ADR), BL-117 (schedule), BL-118 (alarma)
- Decisión de cómputo del worker: `docs/trade-offs/01-compute.md`
- Concurrencia con `version` (optimistic locking): decisión por defecto del PM (E1)
- Modelo de datos actual: `app/api/prisma/schema.prisma` (extensión de dominio diferida a D4)
