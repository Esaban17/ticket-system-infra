# IaC Coverage Proof — Delivery 5 (Deliverable I, obligatorio)

> Documento SEPARADO de `delivery-5-summary.md` (no fusionar). Prueba que **cada recurso cloud en ejecución está gestionado por Terraform**: no hay recursos creados manualmente, no hay configuration drift, y ningún componente vive fuera del Terraform state.

**Proyecto:** `ticket-system` · **Entorno:** `dev` · **Cuenta AWS:** `203036352580` · **Región:** `us-east-1`
**Repo:** https://github.com/Esaban17/ticket-system-infra · **Track:** EKS

## Mapeo componente → IaC

| Application Component | Cloud Service Used | Terraform Resource Type | Module Path |
|---|---|---|---|
| **Compute** — worker de reportes/escalamiento | AWS Lambda | `aws_lambda_function` | `infra/modules/compute` |
| **Compute** — cluster Kubernetes | Amazon EKS | `module.eks` (`aws_eks_cluster`, `aws_eks_node_group` vía `terraform-aws-modules/eks`) | `infra/modules/eks` |
| **Compute** — API + web + consumer (pods) | EKS workloads | `kubernetes_deployment`, `kubernetes_service`, `kubernetes_ingress_v1`, `kubernetes_config_map`, `kubernetes_secret`, `kubernetes_job` | `infra/modules/ingress` |
| **Storage** — adjuntos y reportes | Amazon S3 | `aws_s3_bucket` (+ `_versioning`, `_server_side_encryption_configuration` con CMK, `_lifecycle_configuration`, `_public_access_block`, `_policy`, `_cors_configuration`) | `infra/modules/storage` |
| **Database** — Postgres | Amazon RDS PostgreSQL 16 | `aws_db_instance` (cifrado con CMK), `aws_db_subnet_group`, `aws_db_parameter_group` | `infra/modules/database` |
| **Networking** — VPC y subred | Amazon VPC | `aws_vpc`, `aws_subnet`, `aws_internet_gateway`, `aws_nat_gateway`, `aws_eip`, `aws_route_table`, `aws_route`, `aws_route_table_association`, `aws_vpc_endpoint` | `infra/modules/network` |
| **Networking** — entrada HTTP(S) | AWS ALB (vía AWS Load Balancer Controller) | `kubernetes_ingress_v1` (el controller crea el ALB declarativamente) + `helm_release` del controller | `infra/modules/ingress`, `infra/modules/alb_controller` |
| **Networking** — TLS | AWS Certificate Manager | `aws_acm_certificate`, `aws_acm_certificate_validation` | `infra/modules/tls` |
| **Async** — cola + DLQ | Amazon SQS | `aws_sqs_queue` (main + DLQ con RedrivePolicy) | `infra/modules/async` |
| **Async** — autoescalado del consumer | KEDA (Helm) + SQS | `helm_release`, `kubernetes_manifest` (ScaledObject), `aws_iam_policy` | `infra/modules/keda` |
| **Async** — trabajo programado | Amazon EventBridge Scheduler | `aws_scheduler_schedule` | `infra/modules/scheduler` |
| **Security/IAM** — roles y federación | AWS IAM | `aws_iam_role`, `aws_iam_policy`, `aws_iam_role_policy`, `aws_iam_role_policy_attachment` (el `ci_runner` provisiona la federación OIDC); el OIDC provider de GitHub se **referencia** vía `data.aws_iam_openid_connect_provider` (ver nota abajo) | `infra/modules/iam` |
| **Security/IAM** — IRSA de pods | AWS IAM (IRSA) | `module` `iam-role-for-service-accounts-eks` + OIDC del cluster EKS | `infra/modules/ingress`, `infra/modules/alb_controller`, `infra/modules/keda`, `infra/modules/container-insights` |
| **Security** — segmentación de red | VPC Security Groups + NACLs | `aws_security_group`, `aws_security_group_rule`, `aws_network_acl`, `aws_network_acl_rule` | `infra/modules/security`, `infra/modules/network` |
| **Security** — cifrado | AWS KMS (CMK) | `aws_kms_key`, `aws_kms_alias` | `infra/modules/kms` |
| **Security** — secretos | AWS Secrets Manager | `aws_secretsmanager_secret`, `aws_secretsmanager_secret_version`, `random_password` | `infra/modules/secrets` |
| **Security** — IdP / SSO | Amazon Cognito | `aws_cognito_user_pool`, `_client`, `_domain`, `_user`, `_user_group`, `_user_in_group` | `infra/modules/cognito` |
| **Registry** — imágenes de contenedor | Amazon ECR | `aws_ecr_repository`, `aws_ecr_lifecycle_policy` | `infra/modules/registry` (api + web) |
| **Observability** — logs | Amazon CloudWatch Logs | `aws_cloudwatch_log_group` | `infra/modules/observability`, `infra/modules/compute` |
| **Observability** — métricas/alarmas | CloudWatch Alarms + SNS | `aws_cloudwatch_metric_alarm`, `aws_sns_topic`, `aws_sns_topic_subscription`, `aws_sns_topic_policy` | `infra/modules/observability` |
| **Observability** — dashboard | CloudWatch Dashboard | `aws_cloudwatch_dashboard` (`jsonencode`) | `infra/modules/observability` |
| **Observability** — costo | AWS Budgets | `aws_budgets_budget` (umbral 80 %) | `infra/modules/observability` |
| **Observability** — métricas de cluster (opcional G) | CloudWatch Container Insights | `helm_release` (aws-cloudwatch-metrics / aws-for-fluent-bit) + IRSA | `infra/modules/container-insights` |

Cobertura de las **7 categorías requeridas**: ✅ compute · ✅ storage · ✅ database · ✅ networking · ✅ async · ✅ security/IAM · ✅ observability.

## Declaración de recursos manuales

**No se creó ningún recurso cloud manualmente a través de la consola.** Todo recurso en ejecución del proyecto se provisiona y gestiona vía Terraform desde este repositorio y aparece en `terraform state list` (ver `infra/evidence/state-list.txt`).

- **Sin `terraform import`:** ningún recurso fue creado a mano e importado posteriormente al state. (Si en alguna entrega futura se importara un recurso, debe documentarse aquí el tipo, su cloud ID y la dirección Terraform de destino.)
- **El ALB** que sirve `tickets.nextcodegt.com` **no** es un `aws_lb` directo: lo crea el **AWS Load Balancer Controller** a partir del recurso Terraform `kubernetes_ingress_v1` (`infra/modules/ingress`). Es gestión declarativa vía Terraform (el ciclo de vida del ALB sigue al del Ingress), no un recurso manual. Por eso no aparece como `aws_lb` en el state, pero su fuente de verdad (el Ingress y el certificate-arn) sí está en Terraform.
- **El backend remoto** (bucket S3 + tabla DynamoDB de state lock) vive en `infra/bootstrap/` (state local, `prevent_destroy=true`) y es el único workspace separado; se documenta como bootstrap one-time, no como recurso de aplicación.
- **El GitHub OIDC provider** (`arn:aws:iam::203036352580:oidc-provider/token.actions.githubusercontent.com`) es **account-global** (AWS permite exactamente uno por URL) y es **compartido** con otro proyecto de la cuenta (`rubik-frontend-gh-actions` también confía en él). Por eso NO lo creamos/poseemos: lo **referenciamos** vía `data.aws_iam_openid_connect_provider` en `infra/modules/iam`. No aparece como recurso *managed* en nuestro `state list` (sí como data source) — es intencional, no un recurso manual no rastreado: poseerlo colisionaría en el apply y, peor, lo destruiría en el teardown del Entregable F, tumbando el CI del proyecto hermano. La federación OIDC del equipo sí se provisiona como código mediante el rol `ci_runner` y su trust policy.

## Verificación

- `infra/evidence/state-list.txt` — salida completa de `terraform state list` (≥1 recurso por cada una de las 7 categorías). Se genera con `bash infra/evidence/capture-delivery-5.sh`.
- `infra/evidence/deployed-components.png` — captura de consola AWS con los recursos en estado running/active (acción del operador).
