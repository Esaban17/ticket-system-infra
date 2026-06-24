# ---------------------------------------------------------------------------
# container-insights module — outputs.
# ---------------------------------------------------------------------------

output "irsa_role_arn" {
  description = "ARN of the IAM role assumed by the CloudWatch agent (and Fluent Bit) ServiceAccount via IRSA. Has CloudWatchAgentServerPolicy attached."
  value       = module.cloudwatch_agent_irsa.iam_role_arn
}

output "namespace" {
  description = "Kubernetes namespace where the CloudWatch agent and Fluent Bit DaemonSets are deployed."
  value       = kubernetes_namespace.amazon_cloudwatch.metadata[0].name
}
