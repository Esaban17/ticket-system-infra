# ---------------------------------------------------------------------------
# keda module — outputs.
# ---------------------------------------------------------------------------

output "keda_irsa_role_arn" {
  description = "ARN of the IRSA role attached to the keda-operator ServiceAccount. Allows KEDA to call sqs:GetQueueAttributes without static credentials."
  value       = module.keda_irsa.iam_role_arn
}

output "scaledobject_name" {
  description = "Name of the KEDA ScaledObject resource. Used in evidence capture: kubectl get scaledobject -n <namespace>."
  value       = kubectl_manifest.consumer_scaledobject.name
}
