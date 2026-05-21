environment           = "prod"
project_name          = "ticket-system"
region                = "us-east-1"
tickets_bucket_suffix = "galileo-pdds-prod"

# Compute
lambda_memory_size     = 256
lambda_timeout_seconds = 60

# Database — db_password is NOT defined here; provide via TF_VAR_db_password
# (configured in CI as a GitHub Encrypted Secret). Multi-AZ enabled in prod
# for HA; instance class bumped to small to handle production traffic.
db_instance_class = "db.t4g.small"
db_multi_az       = true

# EKS — slightly larger node group baseline for prod
eks_cluster_version     = "1.30"
eks_node_instance_types = ["t3.medium"]
eks_node_min_size       = 2
eks_node_max_size       = 4
eks_node_desired_size   = 2
