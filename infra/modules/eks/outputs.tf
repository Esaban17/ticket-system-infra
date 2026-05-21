output "cluster_name" {
  description = "Name of the EKS cluster. Used by `aws eks update-kubeconfig --name ...` to generate a kubeconfig entry."
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "HTTPS endpoint of the Kubernetes API server. Required to populate kubeconfig without manual AWS console access."
  value       = module.eks.cluster_endpoint
}

output "cluster_certificate_authority_data" {
  description = "Base64-encoded CA certificate used to verify the API server's TLS certificate. Required to populate kubeconfig."
  value       = module.eks.cluster_certificate_authority_data
  sensitive   = true
}

output "cluster_arn" {
  description = "ARN of the EKS cluster. Useful when granting IAM access to the cluster via aws-auth or pod identity associations."
  value       = module.eks.cluster_arn
}

output "node_group_arn" {
  description = "ARN of the default managed node group."
  value       = module.eks.eks_managed_node_groups["default"].node_group_arn
}
