# RFC Q8 — Estrategia de concurrencia en mutaciones de `tickets`

**Estado:** Aceptado
**Fecha:** 2026-06-09
**Owner:** Estuardo Sabán (BL-016)
**Cierra:** Q8
**CUs afectados:** CU-02 (asignación), CU-03 (cambio de estado / resolución)
**Implementan:** BL-017, BL-018 (asignar), BL-019 (cambio de estado),
BL-021 (test e2e de concurrencia)

---

## 1. Contexto y problema

Varios casos de uso del sistema mutan la **misma fila de `tickets`** desde
actores distintos sin coordinación previa:

- **CU-02 — Asignación.** Dos agentes pueden intentar auto-asignarse el mismo
  ticket de la cola casi al mismo tiempo (race clásico de "tomar el siguiente
  de la cola").
- **CU-03 — Cambio de estado / resolución.** Un agente cambia el estado
  mientras un admin reasigna o resuelve el mismo ticket.
- **Escalamiento SLA (E4).** El worker de escalamiento corre fuera de la API
  y puede ejecutarse en paralelo con una mutación del agente sobre la misma
  fila (e incluso dispararse dos veces si EventBridge reintenta — ver
  `docs/E4_TicketSystem.md` §330).

Sin control de concurrencia, dos `UPDATE` solapados producen **lost update**:
el segundo pisa el primero y el `ticket_events` queda con un historial
incoherente (p.ej. una asignación "fantasma" que nadie ve reflejada).

El modelo de datos ya prevé este problema: la migración de `tickets`
(BL-008, `docs/backlog.md:388`) define **`version INT NOT NULL DEFAULT 0`**.
Este RFC decide cómo usarla.

### Escala esperada

50–200 ingenieros, ~200 tickets concurrentes en el sistema. La probabilidad
de que **dos** mutaciones caigan sobre **la misma** fila en la misma ventana
de milisegundos es **baja pero no nula** — basta que ocurra una vez para
corromper el audit log, así que necesitamos correctitud, no solo "casi nunca".

---

## 2. Alternativas consideradas

### Opción A — Optimistic locking con columna `version` (elegida)

Cada mutación lee el ticket (obteniendo su `version` actual), el cliente envía
ese valor como `expected_version`, y el `UPDATE` incluye la versión en el
`WHERE` e incrementa el contador:

```sql
UPDATE tickets
   SET assignee_id = :assignee, version = version + 1, updated_at = now()
 WHERE id = :id AND version = :expected_version;
```

Se inspecciona el **número de filas afectadas**:

- `1 fila` → la mutación ganó la carrera; se registra el evento en
  `ticket_events`.
- `0 filas` → alguien más ya incrementó `version`; se devuelve **409** y el
  cliente reintenta (ver §4).

No toma locks de fila durante la lectura; el conflicto se detecta en el commit.

### Opción B — Pessimistic locking con `SELECT ... FOR UPDATE`

Cada mutación abre una transacción, bloquea la fila al leerla y la mantiene
bloqueada hasta el commit:

```sql
BEGIN;
SELECT * FROM tickets WHERE id = :id FOR UPDATE;  -- lock de fila
-- ... validar máquina de estados ...
UPDATE tickets SET ... WHERE id = :id;
INSERT INTO ticket_events ...;
COMMIT;
```

La segunda transacción que toque la misma fila **espera** a que la primera
haga commit; nunca hay conflicto observable, pero sí espera (o `lock_timeout`).

---

## 3. Comparación por criterios

| Criterio | A · Optimistic (`version`) | B · Pessimistic (`FOR UPDATE`) |
|---|---|---|
| **Throughput** | Alto. No hay locks de fila retenidos a lo largo de la request; las mutaciones a *filas distintas* nunca se serializan. Las colisiones sobre la *misma* fila son raras (≈200 tickets, mutaciones esporádicas), así que el costo de reintentar es marginal. | Menor bajo contención. La fila queda bloqueada toda la transacción; si la transacción incluye validación + `INSERT` en `ticket_events`, otros writers de esa fila esperan. Filas calientes (un ticket muy disputado) se serializan. |
| **Complejidad** | Baja en el servidor: un `UPDATE` con `WHERE version=?` + chequeo de `rowCount`. Se traslada algo de lógica al cliente (mandar `expected_version`, manejar 409). No requiere transacción explícita para el caso simple. | Baja conceptualmente pero exige **transacción explícita** envolviendo SELECT+UPDATE+INSERT, y disciplina para configurar `lock_timeout`/`statement_timeout`. Olvidar el `FOR UPDATE` reintroduce el lost update silenciosamente. |
| **Manejo en el cliente** | Explícito y simple: 409 → refetch → reintento con el `version` nuevo (§4). El cliente ya conoce el patrón porque la API lo expone con Problem Details `type=conflict` (BL-005). | Transparente para el cliente (no ve conflictos), pero puede ver **latencia variable** o timeouts de lock que se traducen igualmente en un error que hay que manejar — sin la semántica clara de "tu copia está vieja, refresca". |
| **Riesgo de deadlock** | **Nulo** en la práctica. Cada mutación es un `UPDATE` atómico de una fila; no se sostienen locks de múltiples filas en orden arbitrario. | **Real.** Transacciones que bloquean varias filas (p.ej. ticket + su evento, o dos tickets en un flujo de reasignación) en distinto orden pueden deadlock; Postgres aborta a una de ellas y hay que reintentar igual. |

### Observaciones adicionales

- **El worker de escalamiento ya usa optimistic locking** (`UPDATE ...
  WHERE id=? AND escalation_level=?`, BL-203 / `docs/backlog.md:1229`). Elegir
  la Opción A unifica el patrón de concurrencia en toda la base de código —
  API y workers detectan el conflicto del mismo modo (filas afectadas = 0 →
  no-op o 409), sin mezclar dos modelos mentales.
- **Idempotencia ante reintentos de EventBridge:** con `version`/`escalation_level`
  en el `WHERE`, un reintento del worker sobre una fila ya mutada afecta 0 filas
  y se descarta limpiamente, sin doble escalamiento.

---

## 4. Decisión

**Se adopta optimistic locking con la columna `version`** para todas las
mutaciones de `tickets` (asignación, cambio de estado, resolución y
escalamiento).

### Contrato de la API

1. Toda mutación que cambia estado del ticket acepta **`expected_version`** en
   el body (`docs/backlog.md:626`).
2. El servidor ejecuta el `UPDATE ... WHERE id=? AND version=:expected_version`
   incrementando `version` en la misma sentencia.
3. **0 filas afectadas → HTTP 409** con cuerpo Problem Details (RFC 7807,
   BL-005): `type=conflict` / `conflict-version`, `title`, `status: 409`,
   `detail` legible, `instance` y `request_id`.
4. El evento correspondiente en `ticket_events` se inserta **solo si el UPDATE
   afectó 1 fila** (misma transacción), garantizando que el audit log nunca
   refleje una mutación que perdió la carrera.

### Flujo del cliente ante un 409

```
PATCH /v1/tickets/{id}/assign  { assignee_id, expected_version: 3 }
        │
        ├─ 200 → ticket actualizado (version = 4). Fin.
        │
        └─ 409 conflict-version
                │
                1. Refetch:  GET /v1/tickets/{id}   → obtiene version = 4 (real)
                2. Re-evaluar: ¿la intención del usuario sigue siendo válida
                   con el nuevo estado? (p.ej. el ticket ya fue asignado a otro)
                3. Reintentar:  PATCH ... { ..., expected_version: 4 }
                4. Tope de reintentos (p.ej. 3). Si se agota, mostrar al usuario
                   "el ticket cambió, revisa el estado actual" y no reintentar.
```

El refetch + reintento es **decisión del cliente**, no un retry ciego del
servidor: en CU-02 un 409 suele significar "otro agente ya lo tomó", caso en
el que el usuario probablemente **no** quiera reintentar, sino elegir otro
ticket. La semántica explícita del 409 hace esa decisión posible.

---

## 5. Trade-offs aceptados

- **Se traslada trabajo al cliente** (enviar `expected_version`, manejar 409).
  Se acepta porque hace la concurrencia visible y testeable, y porque el SPA y
  los workers son consumidores controlados por el propio equipo.
- **Bajo contención extrema en una fila caliente** el optimistic locking puede
  degenerar en varios reintentos. Para la escala del sistema (~200 tickets) no
  es un escenario realista; si una fila se volviera patológicamente caliente se
  reevaluaría un `FOR UPDATE` puntual **solo en ese endpoint**, sin cambiar el
  modelo general.

---

## 6. Validación

- **BL-021** — test de concurrencia e2e: dispara N=20 requests simultáneas
  (assign + cambio de estado) al mismo ticket y verifica **exactamente 1 éxito
  y 19 conflictos** por iteración, `version` final coherente con el número de
  updates exitosos y `ticket_events` sin eventos contradictorios ni duplicados
  (`docs/backlog.md:682`).
- **BL-018 / BL-019** — tests unitarios: dos requests con el mismo
  `expected_version` → exactamente una 200 y una 409.

---

## 7. Referencias

- `docs/backlog.md:388` — migración de `tickets` con `version INT NOT NULL DEFAULT 0`.
- `docs/backlog.md:623` — handler de asignación (UPDATE con check de `version`).
- `docs/backlog.md:208` — BL-005, Problem Details / RFC 7807.
- `docs/E4_TicketSystem.md:284,330` — optimistic lock en el worker de escalamiento.
- `docs/preguntas-abiertas.md` — entrada **Q8 — Cerrada**.
