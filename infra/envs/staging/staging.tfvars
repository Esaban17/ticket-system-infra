environment           = "staging"
project_name          = "ticket-system"
region                = "us-east-1"
tickets_bucket_suffix = "galileo-pdds"

# Compute
lambda_memory_size     = 128
lambda_timeout_seconds = 30

# Database — db_password is NOT defined here; provide via TF_VAR_db_password
# (injected as STAGING_DB_PASSWORD secret in the GitHub Environment).
# ≥1 difference from dev: larger instance to validate staging behavior.
db_instance_class = "db.t4g.small"
db_multi_az       = false

# EKS — ≥2 more differences from dev: larger node group to simulate load.
eks_cluster_version     = "1.30"
eks_node_instance_types = ["t3.medium"]
eks_node_min_size       = 1
eks_node_max_size       = 3
eks_node_desired_size   = 2

# Async (SQS) — shorter retention in staging to keep costs low.
sqs_message_retention_seconds = 86400
sqs_dlq_retention_seconds     = 259200

# KEDA — smaller fleet ceiling in staging.
keda_max_replica_count = 3

# Scheduler
scheduler_expression = "rate(1 day)"
scheduler_timezone   = "UTC"

# Image tag — pinned to the same API image used in dev (same ECR repo).
# The web ECR (registry_web) is empty in staging; the web pod will stay
# in ImagePullBackOff, which is acceptable: staging evidence targets the
# CD pipeline gate and the async stack, not the web frontend.
api_image_tag = "c8d1d66"
