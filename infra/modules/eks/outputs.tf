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

output "cluster_security_group_id" {
  description = "ID of the EKS cluster security group (control-plane SG created by the module). Required as a Deliverable F output and used for cross-SG rules / diagnostics."
  value       = module.eks.cluster_security_group_id
}

output "oidc_provider_arn" {
  description = "ARN of the IAM OIDC provider associated with the cluster. Consumed by the alb_controller module to scope the IRSA trust policy to the controller's Kubernetes service account."
  value       = module.eks.oidc_provider_arn
}

output "oidc_provider" {
  description = "Issuer URL (host/path) of the cluster OIDC provider, without the https:// scheme. Used to build IRSA trust conditions."
  value       = module.eks.oidc_provider
}

output "node_security_group_id" {
  description = "ID of the shared node security group the EKS module manages. The AWS Load Balancer Controller adds backend ingress rules here for ALB→pod health checks."
  value       = module.eks.node_security_group_id
}
