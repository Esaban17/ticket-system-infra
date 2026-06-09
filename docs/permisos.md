# Matriz de permisos (RBAC) — Sistema de Tickets

RBAC con JWT (mock en dev — `JwtAuthGuard` decodifica sin verificar firma;
verificación real contra JWKS de Cognito en EP-14). El `RolesGuard` global
evalúa `@RequireRole(...)`. La pertenencia de tickets se valida con
`requireOwnTicket()` (un reportante que pide un ticket ajeno recibe **404**, no
403, para no filtrar su existencia).

Roles: **reportante**, **agente**, **administrador**.

| Endpoint | reportante | agente | administrador | Notas |
|---|:---:|:---:|:---:|---|
| `GET /healthz`, `GET /readyz` | ✅ | ✅ | ✅ | `@Public` — sin JWT |
| `POST /v1/tickets` | ✅ (como sí mismo) | ✅ | ✅ | `reporter_id` = usuario del JWT |
| `GET /v1/tickets` (cola) | ✅ (solo propios) | ✅ | ✅ | reportante filtrado a `reporter_id` propio |
| `GET /v1/tickets/{id}` | ✅ (propio) | ✅ | ✅ | `requireOwnTicket` → 404 si ajeno |
| `GET /v1/tickets/{id}/events` | ✅ (propio) | ✅ | ✅ | historial inmutable |
| `POST /v1/tickets/{id}/assign` | ❌ 403 | ✅ | ✅ | `@RequireRole('agente','administrador')` |
| `PATCH /v1/tickets/{id}/state` (iniciar) | ❌ 403 | ✅ (assignee) | ✅ | solo el assignee o admin |
| `PATCH /v1/tickets/{id}/state` (resolver) | ❌ 403 | ✅ (assignee) | ✅ | exige `root_cause` + `solution` |
| `POST /v1/attachments` | ✅ | ✅ | ✅ | upload presignado, dueño = uploader |
| `GET /v1/attachments/{id}/download` | ✅ (de sus tickets) | ✅ | ✅ | 404 si adjunto ajeno |
| `GET /v1/reports/tickets.csv` | ❌ 403 | ❌ 403 | ✅ | export CSV de resueltos (solo admin, BL-037) |

**Reglas transversales**
- Sin header `Authorization: Bearer` → **401** (excepto endpoints `@Public`).
- JWT mal formado o `sub` inexistente → **401**.
- Rol insuficiente para un endpoint con `@RequireRole` → **403**.
- Reportante accediendo a recurso ajeno → **404** (vía `requireOwnTicket`).
