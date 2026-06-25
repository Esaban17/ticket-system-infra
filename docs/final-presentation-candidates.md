# Candidatos para la Presentación Final

**Equipo:** Luis André Morales · Erick Estuardo Saban  
**Repositorio:** https://github.com/Esaban17/ticket-system-infra  
**Curso:** Optimizations and Performance — PDDS, Universidad Galileo  
**Sesión:** Sesión 10 — 25 de junio de 2026  

> Este archivo lista las tres áreas candidatas de comportamiento de aplicación
> para el cambio en vivo del Segmento D de la presentación final. El instructor
> seleccionará una área y especificará el comportamiento exacto que el equipo
> debe implementar durante la sesión. Ningún cambio ha sido pre-escrito
> para ninguna de las entradas.

---

## Candidato A — Campo derivado en GET /v1/tickets/:id

**Título:** Campo de estado de SLA en el detalle del ticket

**Comportamiento observable:**  
Actualmente, `GET /v1/tickets/:id` devuelve el objeto del ticket incluyendo
`sla_due_at` (una marca de tiempo ISO) pero no indica si el ticket está dentro
o fuera de su plazo de SLA. Un cambio en esta área agregaría un campo calculado
`sla_status` a la respuesta — por ejemplo `"a_tiempo"` cuando `sla_due_at` está
en el futuro y `"vencido"` cuando ya pasó. El estado anterior no devuelve ningún
campo `sla_status`; el estado posterior lo devuelve en cada respuesta de ticket,
calculado al momento del request contra la marca de tiempo actual.

**Endpoint y handler afectado:**  
`GET /v1/tickets/:id`  
Handler: `app/api/src/tickets/tickets.controller.ts` → `findOne()`  
Service: `app/api/src/tickets/tickets.service.ts` → `findById()`

**Método de verificación:**  
```bash
# Antes del cambio — no existe el campo sla_status en la respuesta
curl -s -H "Authorization: Bearer <token>" \
  https://<staging-host>/v1/tickets/<id> | jq '.sla_status'
# Devuelve: null

# Después del cambio — sla_status presente y calculado
curl -s -H "Authorization: Bearer <token>" \
  https://<staging-host>/v1/tickets/<id> | jq '{id: .id, sla_due_at: .sla_due_at, sla_status: .sla_status}'
# Devuelve: { "id": "...", "sla_due_at": "2026-06-25T10:00:00Z", "sla_status": "vencido" }
```

**Alcance estimado:**  
~5 líneas. El campo calculado se agrega en la capa de servicio antes de retornar
el objeto — se compara `sla_due_at` contra `new Date()` y se adjunta `sla_status`
al resultado. Sin cambio de esquema de base de datos, sin migración, sin nueva
dependencia.

---

## Candidato B — Validación de input en POST /v1/tickets

**Título:** Validación de rango para los campos severity e impact

**Comportamiento observable:**  
Actualmente, `POST /v1/tickets` acepta cualquier valor entero para `severity` e
`impact` sin validación de rango. Los valores fuera del rango válido 1–5 son
aceptados silenciosamente y producen cálculos de prioridad incorrectos. Un cambio
en esta área devolvería `HTTP 400` con un cuerpo de error estructurado cuando
cualquiera de los campos esté fuera del rango 1–5. El estado anterior acepta
`{ "severity": 99, "impact": 0 }` y crea el ticket; el estado posterior rechaza
el request con un error de validación descriptivo indicando qué campo falló y
por qué.

**Endpoint y handler afectado:**  
`POST /v1/tickets`  
DTO: `app/api/src/tickets/dto/create-ticket.dto.ts`  
Handler: `app/api/src/tickets/tickets.controller.ts` → `create()`

**Método de verificación:**  
```bash
# Antes del cambio — valores inválidos aceptados, ticket creado
curl -s -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"prueba","severity":99,"impact":0}' \
  https://<staging-host>/v1/tickets | jq '.statusCode // "creado"'
# Devuelve: "creado" (o el objeto del ticket)

# Después del cambio — HTTP 400 con error de validación
curl -s -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"prueba","severity":99,"impact":0}' \
  https://<staging-host>/v1/tickets | jq '{statusCode: .statusCode, message: .message}'
# Devuelve: { "statusCode": 400, "message": ["severity debe estar entre 1 y 5", ...] }
```

**Alcance estimado:**  
~3 líneas. Se agregan los decoradores `@Min(1)` y `@Max(5)` de `class-validator`
a los campos `severity` e `impact` en el DTO. El `ValidationPipe` ya corre
globalmente en la aplicación NestJS — no se necesita ningún cableado adicional.

---

## Candidato C — Filtro por query parameter en GET /v1/tickets

**Título:** Filtrar tickets por estado mediante parámetro de consulta

**Comportamiento observable:**  
Actualmente, `GET /v1/tickets` devuelve todos los tickets a los que el usuario
autenticado tiene acceso, sin importar su estado. Un cambio en esta área agregaría
un parámetro opcional `?state=` que filtra la lista devuelta para mostrar
únicamente los tickets que coincidan con el valor de estado indicado (`abierto`,
`en_progreso` o `resuelto`). Sin el parámetro el endpoint se comporta exactamente
igual que antes — se devuelven todos los tickets. Con el parámetro se devuelven
solo los que coincidan. El estado anterior ignora cualquier parámetro `?state=`;
el estado posterior lo aplica como cláusula `WHERE` en la consulta a la base
de datos.

**Endpoint y handler afectado:**  
`GET /v1/tickets?state=<valor>`  
Handler: `app/api/src/tickets/tickets.controller.ts` → `findAll()`  
Service: `app/api/src/tickets/tickets.service.ts` → `findAll()`

**Método de verificación:**  
```bash
# Antes del cambio — parámetro ?state= ignorado, se devuelven todos los tickets
curl -s -H "Authorization: Bearer <token>" \
  "https://<staging-host>/v1/tickets?state=resuelto" | jq '[.[] | .state] | unique'
# Devuelve: ["abierto", "en_progreso", "resuelto"]  (estados mezclados — filtro no aplicado)

# Después del cambio — solo se devuelven los tickets que coinciden
curl -s -H "Authorization: Bearer <token>" \
  "https://<staging-host>/v1/tickets?state=resuelto" | jq '[.[] | .state] | unique'
# Devuelve: ["resuelto"]

# Verificar compatibilidad hacia atrás — sin parámetro devuelve todos
curl -s -H "Authorization: Bearer <token>" \
  "https://<staging-host>/v1/tickets" | jq 'length'
# Devuelve: el mismo total de tickets que antes del cambio
```

**Alcance estimado:**  
~4 líneas. Se agrega un parámetro opcional `@Query('state')` al handler `findAll()`
y se pasa al servicio. En el servicio, se agrega una cláusula `where` condicional
al `findMany()` de Prisma — `state ? { where: { state } } : {}`. Sin cambio de
esquema, sin migración.
