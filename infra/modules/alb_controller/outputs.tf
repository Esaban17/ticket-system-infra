# ---------------------------------------------------------------------------
# alb_controller module — outputs.
# ---------------------------------------------------------------------------

output "controller_role_arn" {
  description = "ARN of the IAM role assumed by the AWS Load Balancer Controller ServiceAccount via IRSA."
  value       = module.lb_controller_irsa.iam_role_arn
}

output "helm_release_name" {
  description = "Name of the Helm release that installed the controller. Exposed so the ingress module can depend on it (the Ingress must not be created before the controller is running)."
  value       = helm_release.aws_load_balancer_controller.name
}
