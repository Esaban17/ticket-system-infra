# ticket-system — Infraestructura Terraform

Sistema de tickets e incidentes · Universidad Galileo · Postgrado PDDS · Mayo–Junio 2026

---

## Requisitos

| Herramienta | Versión mínima |
|---|---|
| Terraform | 1.8.x |
| AWS CLI | 2.x |
| Git | 2.x |

---

## Credenciales de AWS

Las credenciales **nunca se hardcodean** en archivos `.tf` ni en el repositorio.

### Opción A — Variables de entorno (local)

```bash
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="us-east-1"
```

### Opción B — AWS CLI profile

```bash
aws configure --profile ticket-system-dev
export AWS_PROFILE=ticket-system-dev
```

En el pipeline de CI las credenciales se inyectan como **GitHub Actions Encrypted Secrets** (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`). Ver sección de CI más abajo.

### Password de la base de datos — `TF_VAR_db_password`

A partir de Delivery 2, el módulo `database` (RDS PostgreSQL) requiere una variable `db_password` marcada `sensitive = true`. **NUNCA** se commitea a `.tfvars` ni a `.tf`.

Inyectarla vía variable de entorno antes de correr Terraform localmente:

```bash
export TF_VAR_db_password='<password fuerte de ≥12 chars>'
terraform plan  -var-file=envs/dev/dev.tfvars
terraform apply -var-file=envs/dev/dev.tfvars
```

En CI, está configurada como GitHub Encrypted Secret `TF_VAR_DB_PASSWORD`.

---

## Bootstrap del backend remoto (run-once)

El workspace `infra/bootstrap/` provisiona el bucket S3 y la tabla DynamoDB que respaldan el remote state del workspace principal. Se ejecuta **una sola vez** por proyecto:

```bash
cd infra/bootstrap
terraform init
terraform apply
terraform output       # state_bucket_name, lock_table_name, region
```

Los outputs ya están hardcoded en `infra/backend.tf`. Si los cambias, actualiza `backend.tf` y corre `terraform init -migrate-state` en `infra/`.

> **No** agregar backend block a `infra/bootstrap/` — su estado es local intencionalmente (commiteado al repo, excluido del `.gitignore` global). Detalle en [`docs/trade-offs/05-state-backend.md`](../../docs/trade-offs/05-state-backend.md).

---

## Inicializar el workspace principal

```bash
cd infra/

# Inicializa el backend remoto (S3 + DynamoDB lock). En la primera ejecución
# Terraform pregunta si copiar el state local al backend — responder "yes".
terraform init

# Verifica el formato de todos los archivos .tf
terraform fmt -recursive

# Validación estática (sin llamadas a la API)
terraform validate
```

---

## Generar un plan

```bash
# Plan contra el entorno dev
terraform plan -var-file=envs/dev/dev.tfvars -out=tfplan

# Ver el plan en detalle
terraform show tfplan
```

---

## Aplicar cambios

```bash
terraform apply tfplan
```

> **Nota:** El estado se guarda localmente en `terraform.tfstate`. No subir este archivo con credenciales o datos sensibles a un repositorio público. El archivo está en `.gitignore` solo a partir de Delivery 2 cuando se migra a backend remoto.

---

## Destruir recursos

```bash
terraform destroy -var-file=envs/dev/dev.tfvars
```

---

## Estructura del repositorio

```
infra/
├── provider.tf            # Provider AWS + versiones
├── backend.tf             # Backend remoto S3 + DynamoDB lock (D2+)
├── variables.tf           # Variables de entrada
├── outputs.tf             # Outputs expuestos (re-export de módulos)
├── main.tf                # Wiring de módulos
├── envs/
│   ├── dev/dev.tfvars     # Valores para desarrollo
│   └── prod/prod.tfvars   # Valores para producción
├── bootstrap/             # Workspace run-once para crear el backend (D2+)
│   └── terraform.tfstate  # Local + commiteado intencionalmente
├── modules/               # Módulos reutilizables (D2+)
│   ├── storage/           # S3 con versioning, lifecycle, SSE, SSL-only
│   ├── compute/           # Lambda worker async en VPC
│   ├── database/          # RDS PostgreSQL con subnet group, SG, sensitive password
│   └── eks/               # EKS cluster (Optional Track 1)
├── evidence/              # Artefactos requeridos por el rubric de D2
├── docs/                  # Resúmenes MD de cada Delivery
└── README.md              # Este archivo
.github/
└── workflows/
    └── terraform-ci.yml   # Pipeline CI en cada PR a main
```

---

## CI/CD — GitHub Actions

El pipeline se dispara en cada Pull Request hacia `main`. Pasos en orden:

| Paso | Comando | Qué verifica |
|---|---|---|
| 1 | `terraform fmt --check -recursive` | Formato canónico HCL |
| 2 | `terraform init -backend=false` | Resolución de versiones del provider |
| 3 | `terraform validate` | Análisis estático sin llamadas a la API |
| 4 | `terraform plan -var-file=envs/dev/dev.tfvars` | Plan real contra AWS |
| 5 | Post plan como comentario en el PR | Visibilidad del plan para revisión |

Los pasos 1–4 **bloquean el PR** si fallan. El paso 5 es no-bloqueante.

### Secretos requeridos en GitHub

Ir a `Settings → Secrets and variables → Actions` y agregar:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (valor: `us-east-1`)

---

## Variables de entorno

| Variable | Tipo | Dev | Prod |
|---|---|---|---|
| `environment` | `string` | `"dev"` | `"prod"` |
| `project_name` | `string` | `"ticket-system"` | `"ticket-system"` |
| `region` | `string` | `"us-east-1"` | `"us-east-1"` |
| `tickets_bucket_suffix` | `string` | `"galileo-pdds"` | TBD en Delivery 2 |

---

## Track seleccionado

**Optional Track 1 — Kubernetes / Amazon EKS**

Este equipo ha optado por el EKS track. El directorio `k8s/` en la raíz del repositorio contiene los manifests de Kubernetes (scaffolding para Delivery 3). En Delivery 2 se agregará el módulo Terraform para el cluster EKS usando `terraform-aws-modules/eks`. En Delivery 5 se configurará IRSA (IAM Roles for Service Accounts).

---

## Entregables por Delivery

| Delivery | Fecha | Qué agrega |
|---|---|---|
| D1 | 10 may | Workspace + CI pipeline |
| D2 | 21 may | Módulos de cómputo, almacenamiento, BD + EKS + remote state |
| D3 | 7 jun | Capa de red (VPC, subnets, NAT) — reemplaza default VPC placeholder |
| D4 | 21 jun | Infraestructura asíncrona + pipeline CD |
| D5 | 25 jun | Seguridad, observabilidad, one-click deployment |

---

## Network placeholder (Delivery 2)

EKS, Lambda y RDS están desplegados en la **default VPC** de la cuenta AWS y sus default subnets en `us-east-1`. Es una decisión explícita autorizada por el rubric ("placeholder VPC at this stage if networking is not yet provisioned"). Delivery 3 reemplaza la default VPC por una VPC dedicada con subnets privadas/públicas y NAT gateway. Trade-off completo en [`docs/trade-offs/04-eks-track.md`](../../docs/trade-offs/04-eks-track.md).

---

## Trade-offs documentados

Toda decisión arquitectónica importante está justificada en [`docs/trade-offs/`](../docs/trade-offs/). Para D2:

- [01 — Compute (Lambda vs Fargate vs EC2)](../docs/trade-offs/01-compute.md)
- [02 — Storage (lifecycle / encryption / policy)](../docs/trade-offs/02-storage.md)
- [03 — Database (RDS PG vs DynamoDB)](../docs/trade-offs/03-database.md)
- [04 — EKS Track (entrar o saltar)](../docs/trade-offs/04-eks-track.md)
- [05 — State backend (bootstrap pattern)](../docs/trade-offs/05-state-backend.md)

---

## Evidence

Artefactos requeridos por el rubric del Delivery 2 (ver `infra/evidence/README.md` para los comandos de captura):

### Compute deployed — Lambda async worker

Output de `aws lambda get-function` confirmando que la Lambda está `Active`:

```text
$(< infra/evidence/compute-deployed.txt)
```

Archivo: [`infra/evidence/compute-deployed.txt`](./evidence/compute-deployed.txt)

### Remote state lock contention

Screenshot mostrando que un segundo `terraform apply` falla con `Error acquiring the state lock` cuando ya hay otro corriendo:

![State lock contention](./evidence/state-lock-contention.png)

### EKS — `kubectl get nodes`

Screenshot de `kubectl get nodes -o wide` con al menos un nodo en `STATUS Ready`:

![EKS nodes ready](./evidence/eks-nodes.png)