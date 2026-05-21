# Delivery 2 — Compute, Storage, Database & Remote State

**Curso:** Optimizations and Performance — PDDS, Universidad Galileo
**Fecha de entrega:** 21 de mayo de 2026
**Tag:** `oyd-delivery-2`

---

## 1. Compute target y rationale

**Servicio elegido:** **AWS Lambda** (`python3.12`, 128 MB, timeout 30 s), provisionada **dentro de la default VPC** con su propio Security Group.

**Cambio respecto a Delivery 1:** D1 no provisionó ningún recurso de cómputo (sólo un bucket S3 como proof-of-concept). Para D2 el equipo decidió **separar** las dos cargas del sistema E1:

- **API REST síncrona** → corre en el cluster EKS (Deliverable E opcional, Track 1).
- **Worker async (notificaciones, escalamiento SLA)** → corre como Lambda — éste es el módulo `compute` de la entrega.

**Trade-off considerado:** Lambda vs ECS Fargate. Ambos pueden correr el worker. Se eligió Lambda porque (a) **evita redundancia** con EKS (no tener dos planos de contenedores), (b) tiene **free tier muy generoso** para invocaciones bajas (1M req/mes), y (c) el rubric de IAM "sin wildcards" se cumple naturalmente al scoping permisos a un único log group ARN y un AWS-managed policy para acceso VPC. Fargate hubiera requerido task definition + service + ALB + costos 24/7. El análisis completo está en [`docs/trade-offs/01-compute.md`](../../docs/trade-offs/01-compute.md).

---

## 2. Module design

### Inputs / outputs por módulo

| Módulo | Inputs clave | Outputs |
|---|---|---|
| `modules/storage` | `bucket_name`, `environment`, `lifecycle_prefix` (default `attachments/`), `force_destroy`, `transition_to_ia_days`, `expire_noncurrent_versions_days` | `bucket_id`, `bucket_arn`, `bucket_domain_name` |
| `modules/compute` | `environment`, `name`, `memory_size`, `timeout_seconds`, `runtime`, **`vpc_id`**, **`subnet_ids`** | `function_arn`, `function_name`, `role_arn`, **`security_group_id`** |
| `modules/database` | `environment`, `subnet_ids` (validador ≥2), `vpc_id`, **`app_security_group_id`**, `instance_class`, `multi_az`, `db_password` (sensitive) | `instance_arn`, `endpoint`, `port`, `db_security_group_id` |
| `modules/eks` | `cluster_name`, `cluster_version`, `vpc_id`, `subnet_ids`, `node_min_size`, `node_max_size`, `node_desired_size`, `node_instance_types` | `cluster_name`, `cluster_endpoint`, `cluster_certificate_authority_data`, `cluster_arn` |

### Wiring del root module

`infra/main.tf` declara los cuatro módulos y los conecta así:

```hcl
data "aws_vpc"     "default" {}
data "aws_subnets" "default" { ... }

module "storage"  { source = "./modules/storage"  ; bucket_name = "..." ; ... }
module "compute"  {
  source     = "./modules/compute"
  vpc_id     = data.aws_vpc.default.id
  subnet_ids = data.aws_subnets.default.ids
  ...
}
module "database" {
  source                = "./modules/database"
  vpc_id                = data.aws_vpc.default.id
  subnet_ids            = data.aws_subnets.default.ids
  app_security_group_id = module.compute.security_group_id   # ← cross-module
  db_password           = var.db_password
  ...
}
module "eks" {
  source     = "./modules/eks"
  vpc_id     = data.aws_vpc.default.id
  subnet_ids = data.aws_subnets.default.ids
  ...
}
```

### Decisión de diseño explicada

**¿Por qué el módulo `database` acepta `app_security_group_id` (un SG ID) en lugar de un CIDR string?**

El rubric exige que el SG de RDS no permita `0.0.0.0/0` y que el tráfico provenga "del application tier only". Hay dos formas de modelar esto:

1. Pasar un CIDR (e.g., `"10.0.0.0/16"`) — funciona pero acopla el módulo a la topología de subnets.
2. Pasar el **Security Group ID** del compute tier — la regla de ingress queda con `source_security_group_id = ...`, que es referencia simbólica, no IP.

Elegimos **(2)** porque (a) sobrevive a cambios de IP / subnet (Lambda recrea ENIs en IPs distintas en cada cold-start), (b) hace el grafo de dependencias explícito (`module.database` depende de `module.compute`), y (c) es el patrón AWS canónico para arquitecturas de microservicios. La consecuencia es que el módulo `compute` **debe** crear y exponer un SG, lo cual también obligó a poner la Lambda dentro de la VPC (no es lo más rápido, pero es la elección correcta de seguridad).

---

## 3. Remote state migration

### Pasos seguidos

1. Crear el workspace `infra/bootstrap/` con `main.tf` que provisiona:
   - `aws_s3_bucket "state"` (`ticket-system-tfstate-galileo-pdds`) con `prevent_destroy = true`, versioning enabled, SSE-S3 (AES256), public access block en los 4 flags.
   - `aws_dynamodb_table "lock"` (`ticket-system-tflock`) con `hash_key = "LockID"`, `billing_mode = PAY_PER_REQUEST`, `prevent_destroy = true`.
2. Aplicar **una sola vez**:
   ```bash
   cd infra/bootstrap
   terraform init      # local state — sin backend block
   terraform apply
   terraform output    # capturar state_bucket_name, lock_table_name, region
   ```
3. Configurar `infra/backend.tf` con los **valores hardcoded** del paso anterior (los backend blocks no admiten variables).
4. Migrar el estado del workspace principal:
   ```bash
   cd infra/
   terraform init      # Terraform pregunta: "Do you want to copy existing state to the new backend? yes"
   ```

### Extracto real del `terraform init` (a llenar tras correr el comando)

```text
Successfully configured the backend "s3"! Terraform will automatically
use this backend unless the backend configuration changes.
Initializing modules...
- compute in modules/compute
- database in modules/database
- eks in modules/eks
Downloading registry.terraform.io/terraform-aws-modules/eks/aws 20.37.2 for eks.eks...
- eks.eks in .terraform/modules/eks.eks
- eks.eks.eks_managed_node_group in .terraform/modules/eks.eks/modules/eks-managed-node-group
- eks.eks.eks_managed_node_group.user_data in .terraform/modules/eks.eks/modules/_user_data
- eks.eks.fargate_profile in .terraform/modules/eks.eks/modules/fargate-profile
Downloading registry.terraform.io/terraform-aws-modules/kms/aws 2.1.0 for eks.eks.kms...
- eks.eks.kms in .terraform/modules/eks.eks.kms
- eks.eks.self_managed_node_group in .terraform/modules/eks.eks/modules/self-managed-node-group
- eks.eks.self_managed_node_group.user_data in .terraform/modules/eks.eks/modules/_user_data
- storage in modules/storage
Initializing provider plugins...
- Finding hashicorp/tls versions matching ">= 3.0.0"...
- Finding hashicorp/time versions matching ">= 0.9.0"...
- Finding hashicorp/null versions matching ">= 3.0.0"...
- Finding hashicorp/cloudinit versions matching ">= 2.0.0"...
- Finding hashicorp/aws versions matching ">= 4.33.0, ~> 5.0, >= 5.95.0, < 6.0.0"...
- Finding hashicorp/archive versions matching "~> 2.4"...
- Installing hashicorp/null v3.3.0...
- Installed hashicorp/null v3.3.0 (signed by HashiCorp)
- Installing hashicorp/cloudinit v2.4.0...
- Installed hashicorp/cloudinit v2.4.0 (signed by HashiCorp)
- Installing hashicorp/aws v5.100.0...
- Installed hashicorp/aws v5.100.0 (signed by HashiCorp)
- Installing hashicorp/archive v2.8.0...
- Installed hashicorp/archive v2.8.0 (signed by HashiCorp)
- Installing hashicorp/tls v4.3.0...
- Installed hashicorp/tls v4.3.0 (signed by HashiCorp)
- Installing hashicorp/time v0.14.0...
- Installed hashicorp/time v0.14.0 (signed by HashiCorp)
Terraform has created a lock file .terraform.lock.hcl to record the provider
selections it made above. Include this file in your version control repository
so that Terraform can guarantee to make the same selections by default when
you run "terraform init" in the future.

Terraform has been successfully initialized!

You may now begin working with Terraform. Try running "terraform plan" to see
any changes that are required for your infrastructure. All Terraform commands
should now work.

If you ever set or change modules or backend configuration for Terraform,
rerun this command to reinitialize your working directory. If you forget, other
commands will detect it and remind you to do so if necessary.
```

> Nota: pegar aquí el output **real** que aparezca al correr `terraform init` la primera vez con el backend `s3`. El rubric pide el excerpt completo mostrando la migración o el prompt de copia.

### Valores del backend

| Item | Valor |
|---|---|
| State bucket | `ticket-system-tfstate-galileo-pdds` |
| Lock table | `ticket-system-tflock` |
| Region | `us-east-1` |
| Key (path en S3) | `infra/terraform.tfstate` |
| Encrypt | `true` |

---

## 4. Database security

### Manejo de credenciales

- La variable `db_password` está definida en `infra/variables.tf` con `type = string` y `sensitive = true`. **Sin default.**
- Localmente, el equipo la inyecta como variable de entorno antes de correr `terraform`:
  ```bash
  export TF_VAR_db_password='<password fuerte de ≥12 chars>'
  terraform apply -var-file=envs/dev/dev.tfvars
  ```
- En CI, está definida como GitHub Encrypted Secret `TF_VAR_DB_PASSWORD` y se expone al runner como variable de entorno `TF_VAR_db_password` (ver `.github/workflows/terraform-ci.yml`).
- **No aparece** en ningún `.tf`, `.tfvars`, `.yml` ni en commit history. Verificación: `git grep -i 'password' -- '*.tf' '*.tfvars' '*.yml'` debe retornar 0 matches que contengan el valor.
- En el plan/apply, Terraform marca el valor como `(sensitive value)` y no lo imprime.

### Network controls

El SG `${project}-${env}-db-sg` se crea en `modules/database/main.tf` y tiene **una sola regla de ingress**:

```hcl
resource "aws_security_group_rule" "db_ingress_from_app" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = var.app_security_group_id    # ← compute SG
  ...
}
```

Es decir, RDS sólo acepta tráfico TCP/5432 desde el SG de la Lambda. No hay CIDR-based ingress, no hay `0.0.0.0/0`, no hay rangos privados amplios. Si en D3 se añaden más consumidores (e.g., pods en EKS), el patrón es agregar nuevas reglas que apunten al SG de cada consumidor — nunca abrir el puerto a IPs.

Además: `storage_encrypted = true`, `publicly_accessible = false`, `deletion_protection = true en prod`.

---

## 5. Dos trade-offs arquitectónicos

### Trade-off A — Lifecycle rule del bucket S3: scoped a `attachments/` vs bucket-wide

El rubric prohíbe explícitamente lifecycle sin scope. Más allá del cumplimiento, la pregunta de diseño fue: ¿usamos `prefix = "attachments/"` o `tag-based filter`? Elegimos **prefix**. Los adjuntos del sistema viven bajo `attachments/` por convención del E1; ese path es estable y predecible. Un tag filter hubiera requerido que la aplicación (Lambda/API) agregue tags a cada object PUT, lo cual añade lógica de cliente que aún no existe y es propensa a olvidarse. La regla actual: transición a `STANDARD_IA` a los 30 días (la mayoría de las consultas de adjuntos ocurren en los primeros días post-resolución) + expiración de non-current versions a los 90 días (versioning está enabled, así que cada PUT genera basura acumulable). Detalle en [`docs/trade-offs/02-storage.md`](../../docs/trade-offs/02-storage.md).

### Trade-off B — EKS placement en default VPC (placeholder) vs adelantar VPC dedicada de D3

El PDF permite usar una "placeholder VPC at this stage if networking is not yet provisioned". Considerar adelantar la VPC propia (que es Deliverable D del curso Infraestructura en la Nube → D3 del curso de Optimizaciones) era tentador porque deja la arquitectura "limpia". Pero D3 todavía no ha cerrado decisiones sobre subnetting, NAT gateway sharing, ni los CIDRs de prod. Construir una VPC ahora con criterios incompletos generaría rework. El trade-off de usar la default VPC es deuda técnica explícita: cuando llegue D3, el `terraform apply` recreará los node groups en las nuevas subnets (zero-downtime con `max_unavailable_percentage` en el rolling update del módulo EKS). Documentado en [`docs/trade-offs/04-eks-track.md`](../../docs/trade-offs/04-eks-track.md) y en `infra/README.md` § Network placeholder.

---

*Delivery 2 — Sistema de Tickets e Incidentes · PDDS Universidad Galileo · Mayo 2026*
