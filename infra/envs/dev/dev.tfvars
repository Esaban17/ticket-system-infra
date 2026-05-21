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
