# ---------------------------------------------------------------------------
# ingress module — outputs.
# ---------------------------------------------------------------------------

output "ingress_hostname" {
  description = "DNS hostname of the ALB provisioned by the Kubernetes Ingress. Populated once the controller finishes (wait_for_load_balancer = true blocks until then)."
  value       = try(kubernetes_ingress_v1.app.status[0].load_balancer[0].ingress[0].hostname, "")
}

output "ingress_url" {
  description = "Public HTTP URL of the application (http://<alb-hostname>). The two E2E endpoints are reachable at <ingress_url>/<resource>."
  value       = try("http://${kubernetes_ingress_v1.app.status[0].load_balancer[0].ingress[0].hostname}", "")
}

output "app_role_arn" {
  description = "ARN of the app's IRSA role (least-privilege S3 access). Listed in the MD summary as the execution role for the E2E proof."
  value       = module.app_irsa.iam_role_arn
}

output "namespace" {
  description = "Namespace the application is deployed into."
  value       = kubernetes_namespace.this.metadata[0].name
}

output "consumer_role_arn" {
  description = "ARN of the consumer IRSA role (least-privilege SQS + S3 access). Empty when sqs_queue_arn is not set."
  value       = length(module.consumer_irsa) > 0 ? module.consumer_irsa[0].iam_role_arn : ""
}
