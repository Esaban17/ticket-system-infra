#!/usr/bin/env bash
# ===========================================================================
# capture-delivery-3.sh — collects the text evidence for Delivery 3.
#
# Run from infra/ AFTER `terraform apply` has fully completed:
#   export TF_VAR_db_password=...      # same value used for the apply
#   cd infra/ && ./evidence/capture-delivery-3.sh
#
# It writes the *.txt artefacts referenced in infra/README.md. The *.png
# screenshots (security-groups.png, ingress-healthy.png, e2e-storage.png,
# ci-plan.png, eks-nodes-d3.png) must be captured manually from the AWS console
# / GitHub UI — the script prints exactly what each one should show.
# ===========================================================================
set -uo pipefail

EVID="$(cd "$(dirname "$0")" && pwd)"
REGION="$(terraform output -raw region 2>/dev/null || echo us-east-1)"
CLUSTER="$(terraform output -raw eks_cluster_name)"

echo "==> [A] Network foundation -> network-foundation.txt"
terraform output > "$EVID/network-foundation.txt"

echo "==> [B] Security groups plan excerpt -> security-groups-plan.txt"
terraform plan -var-file=envs/dev/dev.tfvars -no-color 2>/dev/null \
  | grep -iE "aws_security_group|web-sg|app-sg|db-sg|from_port|to_port|source_security_group_id|cidr_blocks|aws_network_acl" \
  > "$EVID/security-groups-plan.txt" || true

echo "==> [F] EKS nodes (private subnets) -> eks-nodes-d3.txt"
aws eks update-kubeconfig --region "$REGION" --name "$CLUSTER" >/dev/null
kubectl get nodes -o wide > "$EVID/eks-nodes-d3.txt"

INGRESS_URL="$(terraform output -raw ingress_url)"
echo "Ingress URL: $INGRESS_URL"

echo "==> [C] Ingress curl -> ingress-curl.txt"
curl -sv "$INGRESS_URL/healthz" > "$EVID/ingress-curl.txt" 2>&1 || true

echo "==> [D] GET /v1/tickets (reads RDS) -> e2e-get.txt"
curl -sv "$INGRESS_URL/v1/tickets" > "$EVID/e2e-get.txt" 2>&1 || true

echo "==> [D] POST /v1/tickets (writes S3, 201) -> e2e-post.txt"
curl -sv -X POST -H "Content-Type: application/json" \
  -d '{"note":"delivery-3 e2e proof","ts":"'"$(date -u +%FT%TZ)"'"}' \
  "$INGRESS_URL/v1/tickets" > "$EVID/e2e-post.txt" 2>&1 || true

cat <<'EOF'

==> Screenshots to capture manually (save under infra/evidence/):
  security-groups.png  — EC2 console: web-sg/app-sg/db-sg inbound+outbound rules
  ingress-healthy.png  — EC2 > Target Groups: the ALB target group with healthy targets
  e2e-storage.png      — S3 console: the new uploads/*.json object in the bucket
  ci-plan.png          — GitHub: the Terraform CI run with the plan posted as a PR comment
  eks-nodes-d3.png     — terminal: kubectl get nodes -o wide (>=1 Ready, IP 10.20.10.x/11.x)
EOF
echo "Done."
