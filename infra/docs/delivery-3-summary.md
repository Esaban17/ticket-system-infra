# Delivery 3 — Networking Layer (Fully Automated): Written Summary

**Team track:** VPC-required (AWS / **EKS**).
**Repo:** `gitcombo/ticket-system-infra` · **Submission tag:** `oyd-delivery-3`.

This delivery adds a complete, Terraform-managed networking layer on top of the
Delivery 2 compute/storage/database/EKS modules, plus the public ingress and an
end-to-end connectivity proof. It also completes the optional **Deliverable F**
(EKS ↔ VPC integration, +25) and **Deliverable E** (apply-on-merge CI).

---

## 1. Networking track and rationale (CIDR design + NAT topology)

We are on the **VPC-required track** because our compute is **Amazon EKS** (and
we also run **RDS for PostgreSQL**) — both are listed by the assignment as
VPC-required services. A serverless-only substitution (Edge & DNS) does not
apply.

**CIDR design** (`infra/modules/network/`, driven by `var.vpc_cidr`,
`var.availability_zones`, and the optional `var.public_subnet_cidrs` /
`var.private_subnet_cidrs` overrides):

- **VPC CIDR:** `10.20.0.0/16` (variable `vpc_cidr`, no hardcoded value).
- **2 Availability Zones:** `us-east-1a`, `us-east-1b` (the `availability_zones`
  list is simultaneously the AZ count and the per-tier subnet count).
- **Public subnets** (one per AZ): `10.20.0.0/24`, `10.20.1.0/24` — carved with
  `cidrsubnet(vpc_cidr, 8, index)`. Tagged `kubernetes.io/role/elb=1` so the AWS
  Load Balancer Controller can place internet-facing ALBs here.
- **Private subnets** (one per AZ): `10.20.10.0/24`, `10.20.11.0/24` — carved
  with `cidrsubnet(vpc_cidr, 8, index + 10)`. The `+10` offset leaves room for a
  future third tier. Tagged `kubernetes.io/role/internal-elb=1`. EKS nodes, RDS
  and Lambda ENIs live here.

**NAT topology:** configurable via **`var.single_nat_gateway`** (default
`true`). In dev we use a **single shared NAT Gateway** in the first public
subnet; every private route table's default route points to it. Setting the
variable to `false` provisions **one NAT Gateway per AZ** (each in its AZ's
public subnet, each private route table pointing to its AZ-local NAT). Rationale:
a NAT Gateway costs ~33 USD/month + data processing; for a course/dev workload
the AZ-failure HA a second NAT buys is not exercisable, so a single NAT halves
the largest line item. The toggle makes the production upgrade a one-line change.

---

## 2. Module and architecture design (inputs/outputs + how they're consumed)

**`infra/modules/network/`** (separate `main.tf`, `variables.tf`, `vpc.tf`,
`gateways.tf`, `endpoints.tf`, `outputs.tf`):

- **Inputs:** `name_prefix`, `environment`, `vpc_cidr`, `availability_zones`,
  `public_subnet_cidrs`, `private_subnet_cidrs`, `single_nat_gateway`,
  `cluster_name`, `interface_endpoint_services`, `tags` — all with descriptions.
- **Resources:** custom VPC; public + private subnets across 2 AZs; an Internet
  Gateway with an **explicit** public route table + route + associations (not
  the default RT); NAT Gateway(s) with EIP(s) in public subnets + explicit
  private route tables/routes/associations; an S3 **gateway** VPC endpoint and
  five **interface** endpoints (ECR api/dkr, Secrets Manager, Logs, SQS).
- **Outputs:** `vpc_id`, `vpc_cidr`, `public_subnet_ids`, `private_subnet_ids`,
  **`nat_gateway_ids`**, `nat_public_ips`, `vpc_endpoint_sg_id`.

**How the outputs are consumed (root `infra/main.tf`):**

| Consumer module | Consumes from `module.network` |
|---|---|
| `module.security` | `vpc_id`, `vpc_cidr`, `public_subnet_ids`, `private_subnet_ids` |
| `module.database` | `private_subnet_ids` (subnet group) |
| `module.compute` (Lambda) | `vpc_id`, `private_subnet_ids` |
| `module.eks` | `vpc_id`, `private_subnet_ids` (nodes + control plane), `public_subnet_ids` (ALB placement) |
| `module.ingress` | (indirectly, via EKS + security outputs) |

No module call contains hardcoded VPC/subnet IDs — every input is wired from
`module.network` outputs or root variables.

---

## 3. D2 wiring update (refactor of placeholders to consume D3 outputs)

Delivery 2 ran compute/DB/EKS against the **default VPC** as an acceptable
placeholder. Delivery 3 refactors all of them onto the dedicated VPC:

- **RDS subnet group** now uses `module.network.private_subnet_ids` (was default
  subnets). RDS stays `publicly_accessible = false`.
- **EKS** `vpc_id` and subnet IDs now come from `module.network` outputs; the
  managed node group is pinned to the **private** subnets (Deliverable F).
- **Lambda worker** ENIs moved to the private subnets, reaching AWS APIs through
  the NAT Gateway and the interface/gateway VPC endpoints.
- **Database security group** was refactored: `db-sg` is now owned by the
  **security module** (so all tiered SG-to-SG rules live in one place) and
  attached to RDS via `var.security_group_ids`. The old per-module DB SG and the
  `app_security_group_id` input were removed.

A live `terraform output` excerpt (new VPC ID + subnet IDs) is rendered in
`infra/README.md` under **## Evidence** and saved at
`infra/evidence/network-foundation.txt`.

---

## 4. Security (SG-to-SG strategy + stateless NACLs)

**`infra/modules/security/`** defines the three tiers with **SG-to-SG** rules
(never CIDR ranges for inter-tier traffic) using **separate
`aws_security_group_rule` resources** (this breaks the web⇄app reference cycle —
the documented circular-dependency pitfall):

- **web-sg** (ALB tier): ingress `80`/`443` from `0.0.0.0/0`; egress to **app-sg**
  on the app port only. Attached to the ALB via the Ingress
  `alb.ingress.kubernetes.io/security-groups` annotation.
- **app-sg** (EKS node tier): ingress **from web-sg** on the app port only;
  egress **to db-sg** on the db port only. Attached to the managed node group.
- **db-sg** (RDS tier): ingress **from app-sg** on `5432` only; **no `0.0.0.0/0`
  ingress on any port and no egress at all** (Terraform revokes the default
  allow-all egress). Attached to RDS.

We use SG **references** instead of CIDRs so the rules follow the workloads as
their private IPs change (pods/ENIs are ephemeral) and so the database is
reachable only from the application identity, not from an IP range.

**Stateless NACLs** (`nacl.tf`, every rule a standalone `aws_network_acl_rule`):

- **Public NACL** (public subnets): inbound `80`, `443`, the ephemeral range
  `1024-65535` (return traffic), and all intra-VPC traffic; outbound all.
- **Private NACL** (private subnets): inbound all intra-VPC (node⇄control-plane,
  node⇄RDS, CoreDNS) + ephemeral `1024-65535` (NAT return traffic); outbound all.

All ports/CIDRs/protocol are input variables with descriptions
(`http_port`, `https_port`, `app_port`, `db_port`, `ephemeral_from_port`,
`ephemeral_to_port`, `web_ingress_cidrs`, `tcp_protocol`).

---

## 5. End-to-end connectivity proof architecture

- **Language/runtime:** **NestJS 10 (Node.js 20, TypeScript)** running on EKS —
  the same stack committed for *Infraestructura en la Nube* (`app/api/`).
- **Endpoints (reachable only through the ALB Ingress):**
  - `GET /v1/tickets` — reads rows from RDS via **Prisma** (`tickets` table),
    returns them as JSON (not a hardcoded payload).
  - `POST /v1/tickets` — writes the JSON request body to the **S3 bucket** from
    Delivery 2 and returns **HTTP 201** with the object key.
  - `GET /healthz`, `/readyz` — ALB/probe health checks (outside `/v1`).
- **Secret flow:** `DB_PASSWORD` is a **GitHub Actions repository secret** →
  injected as **`TF_VAR_db_password`** on `terraform plan`/`apply` → Terraform
  builds the `DATABASE_URL` and writes it into a **Kubernetes Secret** (never a
  ConfigMap, never committed) → the pod reads it from its environment. The
  Terraform variable is declared `sensitive = true`; no `.tfvars` contains it.
- **Non-secret config:** `AWS_REGION`, `AWS_S3_BUCKET_ATTACHMENTS`, `PORT`,
  `LOG_LEVEL`, `NODE_ENV` flow through `var.*` → a Kubernetes **ConfigMap**.
- **IAM (least privilege):** the app pods assume an **IRSA** role
  (`<cluster>-app`) whose only permissions are `s3:PutObject`, `s3:GetObject` on
  **`<bucket-arn>/*`** and `s3:ListBucket` on **`<bucket-arn>`** — no wildcard
  resource. Database access uses password auth over the private network
  (db-sg ← app-sg), not IAM. The ALB Controller uses its own IRSA role
  (`<cluster>-alb-controller`).
- **Seed mechanism (committed, reproducible):** Prisma migration
  `app/api/prisma/migrations/0001_init/migration.sql` + seed script
  `app/api/src/seed.ts`, executed in-cluster by the **`db-seed` Kubernetes Job**
  (`kubernetes_job.db_seed`) which runs `prisma migrate deploy && node
  dist/seed.js` before the Deployment serves traffic. No console-inserted data.

---

## 6. Two architectural trade-offs

**(a) Single NAT Gateway vs. per-AZ NAT.** We chose a **single** NAT
(`single_nat_gateway = true`) for dev. A NAT Gateway is the platform's most
expensive always-on component (~33 USD/mo each); a second one only pays off
during a full AZ outage, which we never simulate. The cost of the trade-off is
that if `us-east-1a` fails, private workloads in `us-east-1b` lose internet
egress. Because the variable + per-AZ private route tables already exist, moving
to HA in production is a single variable flip — no re-plumbing.

**(b) S3 Gateway VPC endpoint + NAT vs. NAT-only egress.** Private workloads
reach S3 through a **free S3 gateway endpoint** (attached to the private route
tables) rather than through the NAT Gateway. S3 attachment uploads are our
largest egress flow, so routing them through the (paid, per-GB) NAT would be both
slower and more expensive; the gateway endpoint keeps that traffic on the AWS
backbone at no cost and also guarantees the `POST /v1/tickets` path works even
under a NAT outage. The trade-off is five extra interface endpoints + one gateway
endpoint to manage, justified by the egress savings and the tighter security
posture (S3/ECR/Secrets/Logs/SQS traffic never leaves the VPC).

---

## Apply order (Deliverable E note)

Because the Kubernetes/Helm providers authenticate against the EKS cluster, the
apply runs in **dependency order**: AWS infrastructure first
(`network → security → storage/registry/compute/database → eks`), then the
in-cluster resources (`alb_controller` Helm release → `ingress` app + Ingress).
The `terraform-apply.yml` workflow encodes this as a two-phase apply on merge to
`main`; `terraform-ci.yml` runs plan-on-PR and posts the plan as a PR comment.
