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

# Notifications — Delivery 5 (SES email + SNS ops alerts).
# SES: the async consumer sends notification emails from this verified sender.
# The domain quattro.com.gt is verified in this account (production access), so
# the consumer can email any recipient. ses_identity_arn scopes ses:SendEmail to
# that identity (least privilege, no wildcard).
ses_from_address = "no-reply@quattro.com.gt"
ses_identity_arn = "arn:aws:ses:us-east-1:203036352580:identity/quattro.com.gt"

# SNS: the observability module creates the ticket-system-dev-alerts topic and
# the CloudWatch alarms that publish to it; the consumer also publishes ops
# alerts there. Set alerts_email to have Terraform manage the ops email
# subscription (a confirmation email is sent). Left empty here because a manual
# subscription to ops@nextcodegt.com already exists in the account; set it to
# let TF own the subscription instead.
# alerts_email = "ops@nextcodegt.com"
