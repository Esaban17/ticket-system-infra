# 05 · State Backend — Bootstrap pattern + S3/DynamoDB locking

## Contexto

D1 usó estado local (`infra/terraform.tfstate` en cada máquina del dev). D2 obliga a migrar a backend remoto con locking distribuido (S3 + DynamoDB en AWS, GCS en GCP). El reto: el bucket S3 y la tabla DynamoDB que **almacenan** el estado no pueden ser creados por el workspace que **usa** ese estado — sería una dependencia circular y un `terraform destroy` del main destruiría su propio backend.

## Opciones consideradas

| Opción | Cómo funciona | Riesgo |
|---|---|---|
| **Bootstrap workspace separado** (`infra/bootstrap/`) con estado local commiteado y `prevent_destroy = true` en sus recursos | Workspace pequeño, aislado, run-once. Commit del `terraform.tfstate` permite que cualquiera del equipo audite el estado del backend. | Hay que mantener dos workspaces y disciplina de "no tocar bootstrap" |
| Crear S3 + DynamoDB manualmente vía AWS Console o CLI | Cero Terraform extra | Rubric explícito: "bootstrap workspace absent or manual CLI used instead" = **0 pts** en el criterio Remote State Migration |
| Workspace mono con `terraform_remote_state` apuntando a sí mismo | Suena clever | Imposible — la dependencia circular es absoluta |
| Backend remoto desde D1 | Hubiera evitado la migración | D1 explícitamente lo difirió por razones de bootstrap; ya estamos en D2 |

## Criterios

1. **Rubric explícito** (sección 3.4 del PDF): bootstrap workspace **requerido**, no manual.
2. **Reversibilidad.** Si alguien hace `terraform destroy` en el main por error, el estado debe sobrevivir.
3. **Auditoría.** El equipo debe poder ver qué recursos respaldan el backend.
4. **Costos.** S3 + DynamoDB on-demand → cents/mes.

## Decisión

**Bootstrap workspace en `infra/bootstrap/`** con:

- `aws_s3_bucket` "ticket-system-tfstate-galileo-pdds" con:
  - `lifecycle { prevent_destroy = true }`
  - `aws_s3_bucket_versioning` separado, `status = Enabled`
  - `aws_s3_bucket_server_side_encryption_configuration` con `AES256`
  - `aws_s3_bucket_public_access_block` con los 4 flags `true`
- `aws_dynamodb_table` "ticket-system-tflock" con:
  - `billing_mode = PAY_PER_REQUEST`
  - `hash_key = "LockID"`
  - `attribute { name = "LockID" type = "S" }`
  - `lifecycle { prevent_destroy = true }`
- Outputs: `state_bucket_name`, `lock_table_name`, `region`
- **Sin** backend block — estado local intencional, commiteado al repo (excluido del `.gitignore` global mediante regla `!infra/bootstrap/terraform.tfstate`).

Tras `terraform apply` en `infra/bootstrap/`, se configura `infra/backend.tf` con los valores **hardcoded** (constraint del lenguaje Terraform: backend blocks no pueden referenciar variables).

## Consecuencias

✅ **Positivas**
- Cumple 100% del criterio "Remote State Migration" del rubric (21 pts).
- `prevent_destroy = true` convierte un destroy accidental en un **plan error**, no en pérdida de datos.
- Estado del bootstrap auditado en git: cualquiera puede ver qué se creó sin tener credenciales AWS.
- Lock contention probable y demostrable: dos `apply` paralelos → el segundo falla con "Error acquiring the state lock", screenshot va a `infra/evidence/state-lock-contention.png`.

⚠️ **Negativas / disciplina requerida**
- El equipo no debe **nunca** modificar `infra/bootstrap/` casualmente. Cambios al bucket de estado o a la tabla de lock requieren removo manual del `prevent_destroy` + plan + apply, con coordinación.
- El estado del bootstrap está en git plano — si tuviera secretos sería un problema. Verificación: el state contiene sólo nombres de recurso y ARNs, no datos sensibles.
- Si el bootstrap workspace se corre desde dos máquinas distintas con el mismo estado committeado, hay riesgo de race conditions. Mitigación: documentar que sólo un dev del equipo lo ejecuta (por ejemplo, el "owner" de infra).
