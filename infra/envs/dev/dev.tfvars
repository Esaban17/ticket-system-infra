environment           = "dev"
project_name          = "ticket-system"
region                = "us-east-1"
tickets_bucket_suffix = "galileo-pdds"

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
