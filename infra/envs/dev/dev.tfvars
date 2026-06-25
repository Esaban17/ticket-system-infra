environment           = "dev"
project_name          = "ticket-system"
region                = "us-east-1"
tickets_bucket_suffix = "galileo-pdds"

# Dominio propio / HTTPS. app_domain sirve la app por un CNAME en Hostinger.
# enable_https=true: el cert ACM ya está ISSUED (el CNAME de validación vive en
# Hostinger) y el ALB sirve el listener 443 + redirect 80→443. Esto reconcilia
# en IaC el HTTPS que ya está vivo en tickets.nextcodegt.com.
app_domain   = "tickets.nextcodegt.com"
enable_https = true

# S3 CORS para subir adjuntos prefirmados desde el navegador. Incluye el ALB
# (HTTP) y el subdominio propio (HTTPS), ya que el SPA puede servirse en ambos.
attachments_cors_allowed_origins = [
  "http://k8s-ticketsy-ticketsy-0187f58f9a-757327104.us-east-1.elb.amazonaws.com",
  "https://tickets.nextcodegt.com",
]

# CORS del API (CSV): localhost (demo SSO local) + el subdominio HTTPS.
api_cors_origins = "http://localhost:5173,http://localhost:3000,https://tickets.nextcodegt.com"

# Auth / Cognito (EP-14). auth_provider=mock mantiene el login por contraseña
# como fallback. Se registran AMBOS callbacks: localhost (demo local) y el
# subdominio HTTPS (app desplegada). El SPA arma el redirect_uri según su
# propio origin, así que el mismo build funciona en los dos.
auth_provider = "mock"
cognito_callback_urls = [
  "http://localhost:5173/auth/callback",
  "https://tickets.nextcodegt.com/auth/callback",
]
cognito_logout_urls = [
  "http://localhost:5173/login",
  "https://tickets.nextcodegt.com/login",
]
cognito_redirect_uri = "https://tickets.nextcodegt.com/auth/callback"
cognito_logout_uri   = "https://tickets.nextcodegt.com/login"

# Compute
lambda_memory_size     = 128
lambda_timeout_seconds = 30

# Database — db_password is NOT defined here; provide via TF_VAR_db_password
db_instance_class = "db.t4g.micro"
db_multi_az       = false

# EKS
eks_cluster_version     = "1.30"
eks_node_instance_types = ["t3.medium"]
eks_node_min_size       = 1
eks_node_max_size       = 2
eks_node_desired_size   = 1

# Async (SQS) — Delivery 4
sqs_max_receive_count          = 3
sqs_visibility_timeout_seconds = 60
sqs_message_retention_seconds  = 345600
sqs_dlq_retention_seconds      = 1209600
consumer_polling_batch_size    = 10

# KEDA — Delivery 4
keda_version              = "2.15.1"
keda_min_replica_count    = 0
keda_max_replica_count    = 5
keda_queue_length_trigger = 5

# Container Insights — Delivery 5, Deliverable G (opcional)
cloudwatch_metrics_chart_version = "0.0.11"
fluent_bit_chart_version         = "0.1.34"

# Scheduler — Delivery 4
scheduler_expression = "rate(1 day)"
scheduler_timezone   = "UTC"

# Observability — Delivery 5, Deliverable E
# Destinatario de las alertas SNS (alarmas CloudWatch). ops@nextcodegt.com NO es
# un buzón válido (nextcodegt.com se usa para la app, no para correo), así que su
# suscripción quedaba pendiente para siempre. Se apunta al correo del responsable.
alert_email        = "estuardo1314@gmail.com"
monthly_budget_usd = 300

# Notificaciones por email (EP-12 / BL-119) — identidad de email verificada en
# SES (sandbox, sin DNS). Remitente/destinatario de prueba de los correos de
# ticket. Verificar el buzón manualmente tras el apply.
notification_email = "estuardo1314@gmail.com"

# Image tags — pinned to the images currently running in the cluster.
# 0aa0037 = merge de #97 (delivery-5: SES/SNS, observabilidad), construido por
# api-deploy/web-deploy el 2026-06-24 y presente en ambos repos ECR. El pin
# anterior (6b2bc63, merge de #77) ya no existe en ECR: dejaba el Deployment del
# consumer en ImagePullBackOff (no drenaba la cola, sin envío SES). Mantener el
# pin sincronizado con el último deploy evita que terraform-apply revierta a una
# imagen vieja o inexistente.
api_image_tag = "0aa0037"
web_image_tag = "0aa0037"
