# 02 · Storage — Configuración del bucket S3

## Contexto

D1 dejó un `aws_s3_bucket` planificado (bucket de **adjuntos de tickets y reportes de resolución** del E1). D2 obliga a:

- Versioning habilitado
- ≥1 regla de lifecycle **con prefix/filter específico** (no aplicar a todo el bucket)
- Server-side encryption
- Bucket policy de **SSL-only access** (`aws:SecureTransport`)
- ≥2 inputs y ≥2 outputs con descripciones

No hay "opciones" en términos de servicio (S3 ya está definido por el provider AWS) — los trade-offs están en **cómo configurar** cada bloque.

## Opciones consideradas (configuración)

### Encriptación

| Opción | Pros | Contras |
|---|---|---|
| **SSE-S3 (AES256)** | Sin costo, sin gestión de keys, requisito mínimo del rubric | No hay control granular de uso ni audit trail por key |
| SSE-KMS (aws/s3 managed key) | Audit en CloudTrail por uso de la key | Costo de KMS request (~$0.03 por 10k requests), latencia adicional |
| SSE-KMS (CMK customer-managed) | Rotación controlada, restringible por IAM | Setup de la key, manejo de tags, costo $1/mes/key |

### Lifecycle rule scope

| Opción | Pros | Contras |
|---|---|---|
| **Prefix `attachments/` → IA después de 30 d + expire non-current 90 d** | Targeted: sólo afecta adjuntos, no metadata futura del bucket | Si en el futuro se cambia la jerarquía hay que actualizar el prefix |
| Sin prefix (todo el bucket) | Aplica a cualquier objeto futuro | **Rubric prohíbe explícitamente lifecycle sin scope** |
| Por tag (`tag-based filter`) | Más flexible, no atado a paths | Requiere taggear objetos al momento de subirlos (extra app code) |

### Acceso público

| Opción | Pros | Contras |
|---|---|---|
| **`aws_s3_bucket_public_access_block` con los 4 flags `true` + policy `Deny s3:* si SecureTransport=false`** | Defensa en profundidad: incluso si alguien añade una ACL pública, el block lo invalida | Más bloques de recursos en el módulo |
| Sólo la policy SSL-only | Cumple rubric mínimo | Una ACL accidental podría exponer datos |

## Criterios

1. **Cumplimiento del rubric** (4 requisitos del módulo Storage).
2. **Costo en cuenta de estudiante** (SSE-S3 = gratis; SSE-KMS ya tiene cargos).
3. **Defensa en profundidad** sin sobre-ingeniería.
4. **Refleja el comportamiento real del sistema** — los adjuntos viven en `attachments/`.

## Decisión

- **Encriptación: SSE-S3 (AES256).** Suficiente para datos del proyecto; el rubric dice explícitamente "aws:kms is acceptable but not required at this stage". Sin necesidad de adelantar trabajo de D5 (seguridad).
- **Lifecycle: prefix `attachments/`** → transición a `STANDARD_IA` después de 30 días + expiración de non-current versions después de 90 días.
- **Acceso: bucket policy SSL-only + public access block completo** (4 flags `true`).

## Consecuencias

✅ **Positivas**
- 100% del rubric Storage Module cubierto.
- Lifecycle solo aplica a la parte real del bucket (`attachments/`), no a futuros prefixes como `reports/` o `exports/` que pueden tener políticas distintas.
- SSL-only se enforza a nivel de policy, no sólo de buenas prácticas del cliente.

⚠️ **Negativas / pendientes**
- SSE-S3 no genera audit per-key en CloudTrail; si en Delivery 5 se requiere auditoría granular hay que migrar a SSE-KMS (cambio terraform menor).
- El bucket sigue siendo regional (`us-east-1`); replicación cross-region queda fuera de scope para D2.
