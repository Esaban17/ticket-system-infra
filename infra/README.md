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

---

## Evidence — Delivery 3 (Networking Layer)

Comandos de captura en [`infra/evidence/capture-delivery-3.sh`](./evidence/capture-delivery-3.sh).
Resumen escrito en [`infra/docs/delivery-3-summary.md`](./docs/delivery-3-summary.md).

> Nota de captura: las evidencias `*.png` de consola se sustituyen aquí por su
> equivalente reproducible vía AWS CLI / `curl` en archivos `*.txt` (más
> verificable que una captura). El endpoint del API de EKS está bloqueado desde
> la red de build, por lo que la evidencia de nodos (F) se tomó vía AWS API en
> lugar de `kubectl`. Todo el stack in-cluster se aplicó vía GitHub Actions
> (`terraform-apply.yml`) desde una red que sí alcanza EKS.

### Deliverable A — Network Foundation (`terraform output`)

VPC, subnets públicas/privadas, NAT Gateway y SGs provisionados por `module.network` (archivo completo: [`network-foundation.txt`](./evidence/network-foundation.txt)):

```text
vpc_id                = "vpc-06883c7ea728434d5"
vpc_cidr              = "10.20.0.0/16"
public_subnet_ids     = ["subnet-03783df4a113bed6f", "subnet-05dff2dabee355dfe"]
private_subnet_ids    = ["subnet-095ba061c360a8e4f", "subnet-01fc32691e4c64e79"]
nat_gateway_ids       = ["nat-0e792b33f49a6ec43"]
nat_public_ips        = ["18.205.146.120"]
ingress_url           = "http://k8s-ticketsy-ticketsy-0187f58f9a-125632820.us-east-1.elb.amazonaws.com"
web/app/db SG ids     = sg-019d0daf1c622a830 / sg-081c3adb0338f8644 / sg-0594086c02bf0a0cd
eks_cluster_sg_id     = "sg-0dd471fb273761ff0"
tickets_bucket_name   = "ticket-system-dev-attachments-galileo-pdds"
```

### Deliverable B — Network Security (Security Groups + NACLs)

Reglas SG-to-SG aplicadas (`web-sg → app-sg → db-sg`); **db-sg no tiene ingress `0.0.0.0/0`** (archivo completo con `terraform state show` + describe + NACLs: [`security-groups-plan.txt`](./evidence/security-groups-plan.txt)):

```text
web-sg (sg-019d…): ingress 80 ← 0.0.0.0/0, 443 ← 0.0.0.0/0;  egress 8080 → app-sg
app-sg (sg-081c…): ingress 8080 ← web-sg (sg-019d…);          egress 5432 → db-sg
db-sg  (sg-0594…): ingress 5432 ← app-sg (sg-081c…);          (sin egress, sin 0.0.0.0/0)
NACLs: nacl-public (acl-0978…) y nacl-private (acl-0b76…) con reglas stateless in/out
```

Captura de consola (opcional): `infra/evidence/security-groups.png`.

### Deliverable C — Public Ingress (ALB)

`curl -v` contra la URL pública del ALB (Ingress → Service ClusterIP → pods). Archivo: [`ingress-curl.txt`](./evidence/ingress-curl.txt):

```text
> GET /healthz HTTP/1.1
> Host: k8s-ticketsy-ticketsy-0187f58f9a-125632820.us-east-1.elb.amazonaws.com
< HTTP/1.1 200 OK
{"status":"ok"}
```

Captura del target group con targets `healthy` (opcional): `infra/evidence/ingress-healthy.png`.

### Deliverable D — End-to-End Connectivity Proof

`GET /v1/tickets` → `200 OK`, datos **leídos de RDS** (fila sembrada por el Job, no hardcodeada). Archivo: [`e2e-get.txt`](./evidence/e2e-get.txt):

```text
< HTTP/1.1 200 OK
[{"id":1,"title":"Seed ticket — Delivery 3 end-to-end connectivity proof",
  "status":"open","priority":"high","createdAt":"2026-06-08T06:14:50.582Z"}]
```

`POST /v1/tickets` → `201 Created`, objeto **escrito en S3**, devuelve la object key. Archivos: [`e2e-post.txt`](./evidence/e2e-post.txt) · [`e2e-storage.txt`](./evidence/e2e-storage.txt):

```text
< HTTP/1.1 201 Created
{"key":"uploads/2026-06-08T06-18-07-400Z-3afb1f0f-7d2d-49ab-ac4e-d52aa913c182.json",
 "bucket":"ticket-system-dev-attachments-galileo-pdds"}

# objeto verificado en el bucket (SSE AES256, 59 bytes):
2026-06-08 00:18:08   59  uploads/2026-06-08T06-18-07-400Z-3afb1f0f-...json
```

Captura del objeto en consola S3 (opcional): `infra/evidence/e2e-storage.png`.

### Deliverable E — CI Pipeline (plan-on-PR + apply-on-merge)

- **plan-on-PR:** PR [#12](https://github.com/gitcombo/ticket-system-infra/pull/12) — el workflow `Terraform CI` corrió y publicó el plan como comentario ([run 27119328956](https://github.com/gitcombo/ticket-system-infra/actions/runs/27119328956)).
- **apply-on-merge:** al hacer merge a `main`, `terraform-apply.yml` aplicó la capa de red + ingress (incluida la instalación in-cluster del ALB Controller y el Ingress).

Captura del comentario de plan (opcional): `infra/evidence/ci-plan.png`.

### Deliverable F — EKS nodes in private subnets

Nodo `Ready` en subred privada, **sin IP pública** (capturado vía AWS API porque el endpoint de EKS está bloqueado desde la red de build). Archivo: [`eks-nodes-d3.txt`](./evidence/eks-nodes-d3.txt):

```text
node group subnets: [subnet-01fc32691e4c64e79, subnet-095ba061c360a8e4f]  (privadas)
node i-0e044fd4ff6d0d9dc  privateIp=10.20.11.81  publicIp=null  az=us-east-1b
```

Captura `kubectl get nodes -o wide` (opcional, desde una red que alcance EKS): `infra/evidence/eks-nodes-d3.png`.

