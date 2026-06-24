# Delivery 5 — Resumen (Security, Observability & One-Click Deployment)

**Equipo:** Luis André Morales · Erick Estuardo Saban
**Repo:** https://github.com/Esaban17/ticket-system-infra · **Tag:** `oyd-delivery-5`
**Cuenta AWS:** `203036352580` · **Región:** `us-east-1` · **Track:** EKS · **Entorno:** `dev`

> Mapeo de cobertura IaC (Deliverable I) en archivo separado: [`iac-coverage.md`](./iac-coverage.md).
> Valores en vivo marcados con ⟨…⟩ se rellenan tras el apply con `terraform output`.

---

## 1. Diseño de IAM y recuperación de secretos en runtime

El módulo `infra/modules/iam/` centraliza la identidad, reemplazando las definiciones de rol ad-hoc inline que vivían en `compute/`, `scheduler/` e `ingress/`. **Sin `Action="*"` ni `Resource="*"`** en ninguna política propia. Roles:

- **`lambda_exec`** (`ticket-system-dev-worker-role`): `logs:CreateLogStream`/`PutLogEvents` scoped al log group del Lambda; `s3:ListBucket`/`PutObject`/`GetObject` scoped al ARN exacto del bucket de adjuntos; `secretsmanager:GetSecretValue` al ARN del secret y `kms:Decrypt`/`GenerateDataKey` al ARN del CMK (el bucket es SSE-KMS); managed `AWSLambdaVPCAccessExecutionRole` para las ENIs en VPC.
- **`scheduler`** (`ticket-system-dev-report-scheduler-role`): únicamente `lambda:InvokeFunction` al ARN exacto del Lambda objetivo (compuesto por nombre para romper el ciclo iam↔compute).
- **`ci_runner`** (`ticket-system-dev-ci-runner-role`): asumible por OIDC de GitHub (ver §3).
- **Políticas de IRSA** de la API (`app`) y el consumer: S3 + SQS scoped a ARNs exactos; la de `app` además concede `secretsmanager:GetSecretValue` (ARN del secret) y `kms:Decrypt` (ARN del CMK). El *trust* de IRSA permanece en `ingress` (módulo comunitario `iam-role-for-service-accounts-eks`); solo se centralizó la **autoría de las políticas**, que se inyectan por variable — así no se rompen las anotaciones `eks.amazonaws.com/role-arn` ni se reinician pods.

**Qué cambió:** antes cada módulo definía su propio rol/política inline; ahora todo nace en `modules/iam` y los ARNs se consumen como outputs (ninguno hardcodeado).

**Recuperación de secretos en runtime:** el módulo `compute` ya no recibe la contraseña. La API NestJS (`app/api/src/config/secret-loader.ts`) ejecuta, **antes de `NestFactory`/Prisma** (`main.ts`), una llamada `GetSecretValue` (SDK `@aws-sdk/client-secrets-manager`, credenciales por IRSA — mismo patrón que `s3-presign.service.ts`) usando el **ARN del secret inyectado como env var no sensible `SECRET_ARN`** en el ConfigMap. Compone `DATABASE_URL` en memoria a partir de `{username,password}` del secret + `DB_HOST`/`DB_PORT`/`DB_NAME` (no sensibles, del ConfigMap). El Job de seed usa `secret-cli.ts` (carga el secret y hace `exec` de `prisma migrate deploy`). El `Secret` de Kubernetes ya **no** contiene `DATABASE_URL` en claro. Por eso **se retiró `TF_VAR_db_password`**: `var.db_password` es opcional (`default null`) y si es null la contraseña se autogenera (`random_password`) y se guarda cifrada en Secrets Manager — nunca viaja por variable de entorno de CI.

## 2. Gestión de llaves KMS

- **CMK:** `aws_kms_key` con `enable_key_rotation = true`, alias **`alias/ticket-system-dev-cmk`**. ARN: ⟨`terraform output kms_key_arn`⟩.
- **Qué cifra:** el bucket S3 de adjuntos (SSE pasó de `AES256` a `aws:kms` con `bucket_key_enabled`), la instancia RDS (`kms_key_id`), y el secret de Secrets Manager (`kms_key_id`).
- **Key policy (least-privilege, NO `kms:*` a root sin condición):** tres statements — (a) root con acciones **solo administrativas** (`Create*`/`Describe*`/`Put*`/`Update*`/`Revoke*`/`Get*`/`List*`/`ScheduleKeyDeletion`/…), **sin** `Decrypt`/`GenerateDataKey`, evitando que root descifre datos; (b) el service principal `secretsmanager.amazonaws.com` con `Decrypt`/`GenerateDataKey`/`CreateGrant`; (c) los roles de runtime (`lambda_exec` + IRSA de la API, por ARN) con `Decrypt`/`GenerateDataKey`/`DescribeKey`. El ciclo iam↔kms se rompe componiendo los ARNs de rol por nombre en la key policy (no se referencia `module.iam`).

## 3. Federación OIDC

- **Provider:** issuer **`https://token.actions.githubusercontent.com`**, audience (`aud`) **`sts.amazonaws.com`**. El provider es **account-global** y ya existía (compartido con el proyecto `rubik-frontend`), así que se **referencia** con `data.aws_iam_openid_connect_provider` (no se posee) — owning-it colisionaría en el apply y lo destruiría en el teardown de F, tumbando el CI del proyecto hermano. ARN: `arn:aws:iam::203036352580:oidc-provider/token.actions.githubusercontent.com`. La federación del equipo sí se provisiona como código vía el rol `ci_runner` + su trust policy.
- **Rol y condición de subject:** `ci_runner` = `arn:aws:iam::203036352580:role/ticket-system-dev-ci-runner-role`. El trust exige `token.actions.githubusercontent.com:sub = repo:Esaban17/ticket-system-infra:ref:refs/heads/main` — solo la rama `main` de **este** repo puede asumir el rol (un PR desde un fork no puede). *Nota:* el remote `gitcombo` es un redirect al owner actual `Esaban17`; el token OIDC emite el `sub` con el nombre actual, por eso se usa `Esaban17`.
- **Workflows:** los 6 workflows (`terraform-apply` [3 jobs], `terraform-ci`, `terraform-drift`, `terraform-destroy`, `api-deploy`, `web-deploy`) usan `aws-actions/configure-aws-credentials@v4` con `role-to-assume: ${{ vars.CI_RUNNER_ROLE_ARN }}` (GitHub Actions **Variable**, no hardcodeado) y `permissions: { id-token: write, contents: read }`. Se eliminaron `aws-access-key-id`/`aws-secret-access-key` y todo `secrets.AWS_*`.
- **Confirmación de remoción:** tras validar el intercambio OIDC, se eliminan de GitHub → Settings → Secrets los secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` y `TF_VAR_DB_PASSWORD`. Evidencia: `oidc-secrets-removed.png`, `oidc-auth-log.png`.

## 4. Diseño de observabilidad

Módulo `infra/modules/observability/` (cableado al root, antes no lo estaba):

- **Alarmas (→ SNS topic `ticket-system-dev-alerts` con suscripción email):**
  - `lambda-errors` — `AWS/Lambda Errors` del worker, umbral `> 1` en 1 período de 300 s. Elegido bajo porque un error del worker de escalamiento/reportes es accionable de inmediato (no hay reintento de usuario detrás).
  - `sqs-dlq-depth` — `AWS/SQS ApproximateNumberOfMessagesVisible` del DLQ, umbral `> 1`. Cualquier mensaje en la DLQ implica un fallo de procesamiento que debe investigarse; el umbral mínimo evita que se acumulen silenciosamente.
  - Umbrales/períodos/evaluation_periods son variables (no hardcodeados).
- **Dashboard** (`aws_cloudwatch_dashboard`, body vía `jsonencode()`): (1) RequestCount del ALB/ingress, (2) Errors + Invocations del Lambda, (3) profundidad del DLQ + DatabaseConnections de RDS. Se eligieron porque cubren las tres señales RED del sistema: tráfico de entrada (ALB), salud del procesamiento asíncrono (Lambda + DLQ) y presión sobre la base (conexiones RDS).
- **Cost budget** (`aws_budgets_budget`): límite mensual **`var.monthly_budget_usd = 300 USD`** (acorde al estimado ~$244/mes del diseño E5) con notificación al **80 %** (`ACTUAL`/`PERCENTAGE`/`GREATER_THAN`) publicada al mismo SNS topic. El topic tiene `aws_sns_topic_policy` que autoriza a `budgets.amazonaws.com` y `cloudwatch.amazonaws.com` a publicar (scoped por `aws:SourceAccount`).

## 5. Dos trade-offs arquitectónicos

**(a) Un único CMK compartido vs. un CMK por servicio.** Se eligió **un solo CMK** para S3, RDS y Secrets Manager. Un CMK por servicio daría aislamiento de blast-radius más fino (rotar/revocar la llave de un servicio sin tocar los demás) y políticas de key aún más estrechas, pero a costa de 3× el costo fijo de llaves, 3× la superficie de key policies que mantener y más complejidad de cableado en un entorno académico de un solo equipo. Con un CMK la key policy ya restringe el data-plane a los principals exactos (Secrets Manager + roles de runtime) y root no puede descifrar; el aislamiento extra de un CMK por servicio no justifica el costo/complejidad en `dev`. En producción multi-equipo la decisión podría invertirse.

**(b) CloudWatch Container Insights vs. kube-prometheus-stack (Deliverable G).** Para el monitoring de cluster se eligió **Container Insights** (DaemonSet ligero: CloudWatch agent + Fluent Bit vía `helm_release`) en lugar de `kube-prometheus-stack`. kube-prometheus-stack (Prometheus + Grafana + AlertManager) ofrece consultas PromQL y dashboards más ricos, pero su footprint (~1.5–2 GB de RAM) no cabe cómodamente en el nodo `t3.medium` con `desired_size = 1` del entorno dev, y duplicaría el stack de alertas que ya cubren CloudWatch Alarms + SNS (§4). Container Insights se integra nativamente con el mismo CloudWatch/SNS/budget del resto del delivery y mantiene la huella mínima. El trade-off es vendor lock-in a CloudWatch y menos flexibilidad de queries, aceptable para el alcance del curso.

---

### Acciones humanas pendientes (para el cierre, ver `infra/README.md` §Runbook)
- Crear GitHub Actions Variables `CI_RUNNER_ROLE_ARN` y `AWS_REGION`; borrar los 3 secrets long-lived.
- Confirmar la suscripción de email del SNS (clic en el correo de AWS).
- Ejecutar el one-click (destroy + push) y capturar la evidencia `.png`/`.txt`.
- (Opcional J) Repo del bot de Slack `ticket-deploy-bot` (link a agregar aquí).
