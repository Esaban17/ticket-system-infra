# Convención de secretos — AWS Secrets Manager (BL-126)

Esta convención aplica a **todo** secreto del sistema de tickets (credenciales de
BD, claves de firma JWT de servicio, webhooks). Es de cumplimiento obligatorio en
cualquier PR que cree, lea o rote un secreto. Owner: Estuardo.

## Regla de oro

> **Ningún valor de secreto se commitea jamás al repositorio.**

Los valores viven en **AWS Secrets Manager** (runtime) o se inyectan vía
`TF_VAR_*` desde el entorno de CI (apply). En el código nunca aparece el valor:
solo el **ARN** o el **nombre** del secreto.

- ❌ Prohibido: secretos en `*.tfvars`, en `variables.tf` con `default`, en
  manifests de `k8s/`, en `docs/`, en `*.env` versionado o en logs.
- ❌ Prohibido: interpolar el valor de un secreto en HCL
  (`password = aws_secretsmanager_secret_version.x.secret_string`) cuando se puede
  pasar el ARN y resolverlo en runtime.
- ✅ Permitido: referenciar el secreto por ARN/nombre y resolverlo en runtime
  (API vía IRSA, Lambda worker vía execution role) o inyectar el valor por
  `TF_VAR_db_password` desde el secret store de GitHub Actions solo durante el
  bootstrap.

## Naming

Formato canónico, jerárquico, con `/` como separador:

```
/ticket-system/<env>/<component>/<purpose>
```

| Campo | Valores | Notas |
|---|---|---|
| `<env>` | `dev` · `stg` · `prod` | mismo set que workspaces de Terraform |
| `<component>` | `rds` · `api` · `worker` · `integrations` | el sistema/servicio dueño |
| `<purpose>` | `master-credentials` · `jwt-signing-key` · `slack-webhook` | qué guarda |

Ejemplos reales:

```
/ticket-system/dev/rds/master-credentials      # JSON {"username","password"}
/ticket-system/dev/api/jwt-signing-key         # clave de firma del JWT de servicio
/ticket-system/dev/integrations/slack-webhook  # URL del webhook de Slack
/ticket-system/prod/rds/master-credentials
```

Reglas:

- Todo en `kebab-case`, minúsculas, sin espacios ni acentos.
- Un secreto por propósito; no agrupar credenciales no relacionadas en un solo
  blob.
- El secreto de RDS guarda JSON `{"username": "...", "password": "..."}` (formato
  que espera el Lambda de rotación oficial de AWS — ver BL-125).

## Política de rotación

| Secreto | Rotación | Mecanismo |
|---|---|---|
| `rds/master-credentials` | **30 días** (automática) | Lambda de rotación oficial de AWS sobre `aws_secretsmanager_secret` / `master_user_secret` |
| `api/jwt-signing-key` (JWT de servicio worker→API) | **90 días** | rotación con solape: se publica la nueva clave, ambas válidas durante la ventana, se retira la vieja |
| `integrations/slack-webhook` y demás webhooks | **manual** | no rotable de forma automática; se regenera en el proveedor y se actualiza el secreto a mano cuando se compromete o caduca |

Notas:

- **Rotables vs no-rotables.** RDS y la clave JWT se rotan en schedule. Los
  webhooks de terceros (Slack) **no** se rotan automáticamente: su ciclo de vida
  lo controla el proveedor externo.
- La rotación de RDS debe poder dispararse manualmente para validación:
  `aws secretsmanager rotate-secret --secret-id /ticket-system/dev/rds/master-credentials`.
- La clave JWT usa rotación con periodo de solape para no invalidar tokens en
  vuelo del worker.

## KMS

- Cifrado en reposo con la clave **AWS-managed** `aws/secretsmanager` por defecto.
- Solo se usa una **CMK** (customer-managed key) si un requisito explícito lo
  exige (p. ej. control de la rotación de la clave de cifrado o políticas de
  acceso cruzado entre cuentas). Documentar la justificación en `docs/decisiones.md`.

## Tagging

Todo secreto lleva como mínimo estos tags (heredados del esquema de tags del
proyecto en Terraform):

| Tag | Ejemplo | Uso |
|---|---|---|
| `Project` | `ticket-system` | inventario y facturación |
| `Environment` | `dev` / `stg` / `prod` | filtrado por entorno |
| `Component` | `rds` / `api` / `worker` / `integrations` | dueño del secreto |
| `Rotation` | `auto-30d` / `auto-90d` / `manual` | refleja la política de arriba |
| `ManagedBy` | `terraform` | distingue secretos IaC de los manuales |

## Acceso (resumen)

El detalle de IAM se trata en **BL-127**. Regla aquí: acceso de **mínimo
privilegio** — cada rol concede `secretsmanager:GetSecretValue` solo sobre los
ARNs que necesita, nunca con wildcard. La API solo lee el secreto de RDS; el
Lambda worker lee el de RDS más el webhook de Slack.

## Check de lint (PR)

Antes de aprobar un PR que toque `*.tf`, verificar que no haya interpolación
directa de valores de secreto. Búsqueda rápida:

```bash
grep -rnE '\.secret_string|password\s*=\s*"' infra/ \
  | grep -v 'secret_id\|arn\|TF_VAR_'
```

Cualquier coincidencia debe justificarse o corregirse (pasar el ARN y resolver en
runtime). Este check forma parte de la revisión obligatoria del PR template.
