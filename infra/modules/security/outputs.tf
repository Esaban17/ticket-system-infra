# ---------------------------------------------------------------------------
# Security module — outputs consumed by the root module and by the modules
# that attach these security groups (eks → app-sg, database → db-sg, ingress →
# web-sg).
# ---------------------------------------------------------------------------

output "web_sg_id" {
  description = "ID of web-sg (public/ALB tier). Attached to the ALB created by the Kubernetes Ingress (alb.ingress.kubernetes.io/security-groups)."
  value       = aws_security_group.web.id
}

output "app_sg_id" {
  description = "ID of app-sg (application tier). Attached to the EKS managed node group so pods inherit the tier's allowed paths (ingress from web-sg, egress to db-sg)."
  value       = aws_security_group.app.id
}

output "db_sg_id" {
  description = "ID of db-sg (database tier). Attached to the RDS instance; its only ingress is from app-sg on the db port."
  value       = aws_security_group.db.id
}

output "public_nacl_id" {
  description = "ID of the public subnets' Network ACL."
  value       = aws_network_acl.public.id
}

output "private_nacl_id" {
  description = "ID of the private subnets' Network ACL."
  value       = aws_network_acl.private.id
}
