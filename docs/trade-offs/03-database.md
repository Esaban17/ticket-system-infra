# 03 · Database — RDS PostgreSQL vs DynamoDB

## Contexto

El sistema de tickets necesita persistir tres entidades relacionadas (E1 sección 4):

- **`tickets`** — fila por incidente. Campos: `id`, `title`, `description`, `state`, `priority`, `assignee_id`, `created_at`, `updated_at`.
- **`ticket_events`** — log inmutable de cada cambio de estado. Auditoría compliance.
- **`sla_rules`** — reglas de escalamiento por prioridad/tiempo.

Las consultas dominantes son:

- "Tickets en cola por prioridad y estado" (filtro + sort)
- "Reporte de tickets resueltos entre fecha X e Y" (rango de fecha + JOIN con `ticket_events`)
- "Historia de cambios de un ticket" (JOIN simple)

## Opciones consideradas

| Opción | Cómo se modelaría | Encaje con queries |
|---|---|---|
| **RDS PostgreSQL** | 3 tablas + foreign keys + índices en `state`, `priority`, `created_at` | Nativo. SQL `WHERE state = 'open' AND priority='high' ORDER BY created_at`. JOINs para auditoría. |
| DynamoDB | 1 tabla con PK compuesta + GSIs en `state`, `priority`, `created_at` | Funciona, pero queries cross-attribute (state + priority + date range) requieren múltiples GSIs y filtros en cliente |

## Criterios

1. **Patrón de queries.** Los reportes y la pantalla de cola del E1 son consultas analíticas — el caso fuerte de SQL.
2. **Audit log inmutable.** `ticket_events` con FK a `tickets` es trivial en PG; en DynamoDB requiere un schema híbrido en la misma tabla o una segunda tabla manual.
3. **Costo en cuenta de estudiante.** RDS `db.t4g.micro` ≈ $12/mes (no free tier sin haber abierto cuenta nueva). DynamoDB on-demand: cents por la carga del curso.
4. **Rubric requirements:** RDS exige más bloques (subnet group, parameter group, SG, password sensitive, storage_encrypted) que DynamoDB (GSI + TTL + SSE). RDS demuestra **más superficie** para puntos del rubric.
5. **Alineación con E1.** E1 explícitamente dice "RDS para la base de datos relacional de tickets".

## Decisión

**Amazon RDS PostgreSQL 16, instance class `db.t4g.micro`, en default VPC con subnet group de ≥2 AZs.**

## Consecuencias

✅ **Positivas**
- 3 tablas con FKs reflejan exactamente el modelo del E1, sin work-arounds.
- JOIN entre `tickets` y `ticket_events` directo para el endpoint `GET /tickets/{id}` con historia.
- Cumple los 6 requisitos del rubric (RDS): subnet group, parameter group, multi_az variable, storage_encrypted, password sensitive, SG no-wildcard.
- Password vía `TF_VAR_db_password` — nunca aparece en `.tf`/`.tfvars`/`.yml`.

⚠️ **Negativas**
- **No hay free tier** si la cuenta ya pasó los 12 meses iniciales. `db.t4g.micro` cuesta ~$12/mes; recordar `terraform destroy` al final del curso.
- Cold-start del API más lento que con DynamoDB (DynamoDB es siempre disponible, RDS requiere connection pool warm).
- Una sola AZ en dev (`multi_az = false` para ahorrar). Para prod del E1 se documenta el switch a `true`.
- Default VPC como placeholder — D3 reemplazará por una VPC dedicada.

### Seguridad de credenciales

- Variable `db_password` en `infra/variables.tf` con `sensitive = true` y **sin** `default`.
- Se inyecta vía `TF_VAR_db_password` (env var) localmente y como GitHub Actions secret en CI.
- No aparece en ningún archivo commiteado (verificable con `git grep`).
- Security Group restringe ingress al puerto 5432 **solo** desde el SG creado en el módulo compute (`app_security_group_id`). Sin `0.0.0.0/0`.
