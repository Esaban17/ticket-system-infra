environment           = "dev"
project_name          = "ticket-system"
region                = "us-east-1"
tickets_bucket_suffix = "galileo-pdds"

# S3 CORS for browser presigned attachment uploads (FE create-ticket dropzone).
# Must match the SPA origin served by the ingress ALB (scheme + host, no
# trailing slash). Update this if the ALB is recreated and its DNS changes.
attachments_cors_allowed_origins = [
  "http://k8s-ticketsy-ticketsy-0187f58f9a-757327104.us-east-1.elb.amazonaws.com",
]

# Auth / Cognito (EP-14). auth_provider=mock mantiene el login por contraseña
# como fallback en el ALB (HTTP). El SSO Hosted UI exige callback HTTPS salvo
# http://localhost, y el ALB de dev es HTTP plano (sin dominio/cert), por eso
# el flujo SSO se prueba con el SPA en localhost contra el Cognito real + API.
auth_provider         = "mock"
cognito_callback_urls = ["http://localhost:5173/auth/callback"]
cognito_logout_urls   = ["http://localhost:5173/login"]
cognito_redirect_uri  = "http://localhost:5173/auth/callback"
cognito_logout_uri    = "http://localhost:5173/login"

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

# Scheduler — Delivery 4
scheduler_expression = "rate(1 day)"
scheduler_timezone   = "UTC"

# Image tags — pinned to the images currently running in the cluster.
# api-deploy and web-deploy (PR #64) pushed c8d1d66 on 2026-06-22.
# Without these pins terraform-apply would fall back to the variable
# defaults ("d3" / "bootstrap") causing unwanted rollbacks / ImagePullBackOff.
api_image_tag = "c8d1d66"
web_image_tag = "c8d1d66"
