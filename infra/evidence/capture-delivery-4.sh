#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# capture-delivery-4.sh — Genera los archivos de evidencia de texto para D4.
#
# Uso:
#   cd infra/
#   terraform init -backend-config=envs/dev/backend-dev.hcl
#   export TF_VAR_db_password='...'
#   bash evidence/capture-delivery-4.sh
#
# Los archivos .png los toma el operador manualmente (consola AWS / GitHub UI).
# ---------------------------------------------------------------------------

set -euo pipefail

EVIDENCE_DIR="$(dirname "$0")"
INFRA_DIR="$(dirname "$EVIDENCE_DIR")"

echo "=== Delivery 4 evidence capture — $(date -u '+%Y-%m-%dT%H:%M:%SZ') ===" | tee "$EVIDENCE_DIR/capture.log"

# ---- A: SQS async-foundation ----------------------------------------------
echo "[A] terraform output..."
terraform -chdir="$INFRA_DIR" output 2>&1 \
  | grep -E '(sqs_|scheduler_|keda_|consumer_role|async)' \
  | tee "$EVIDENCE_DIR/async-foundation.txt"

# Full output too
terraform -chdir="$INFRA_DIR" output 2>&1 >> "$EVIDENCE_DIR/async-foundation.txt"

echo "--- SQS queue attributes ---" >> "$EVIDENCE_DIR/async-foundation.txt"
QUEUE_URL=$(terraform -chdir="$INFRA_DIR" output -raw sqs_queue_url 2>/dev/null || true)
if [ -n "$QUEUE_URL" ]; then
  aws sqs get-queue-attributes \
    --queue-url "$QUEUE_URL" \
    --attribute-names All \
    --region us-east-1 \
    2>&1 >> "$EVIDENCE_DIR/async-foundation.txt"
fi

# ---- B: Event-source plan extract -----------------------------------------
echo "[B] event-source plan..."
terraform -chdir="$INFRA_DIR" plan \
  -var-file=envs/dev/dev.tfvars \
  -no-color 2>&1 \
  | grep -A5 -E '(consumer_irsa|consumer_deployment|sqs_queue|async)' \
  | head -100 \
  | tee "$EVIDENCE_DIR/event-source-plan.txt"

# ---- C: Scheduler plan extract --------------------------------------------
echo "[C] scheduler plan..."
terraform -chdir="$INFRA_DIR" plan \
  -var-file=envs/dev/dev.tfvars \
  -no-color 2>&1 \
  | grep -A5 -E '(scheduler|report)' \
  | head -80 \
  | tee "$EVIDENCE_DIR/scheduler-plan.txt"

# ---- E: End-to-end enqueue (requires ALB URL) ----------------------------
echo "[E] async enqueue (requires ALB URL + valid JWT token)..."
ALB_URL=$(terraform -chdir="$INFRA_DIR" output -raw ingress_url 2>/dev/null || true)
if [ -n "$ALB_URL" ]; then
  TOKEN="${E2E_JWT_TOKEN:-}"
  if [ -z "$TOKEN" ]; then
    echo "E2E_JWT_TOKEN not set — skipping curl. Set it and re-run."
    echo "SKIPPED: E2E_JWT_TOKEN not set" > "$EVIDENCE_DIR/async-enqueue.txt"
  else
    echo "POST $ALB_URL/v1/notifications/enqueue" | tee "$EVIDENCE_DIR/async-enqueue.txt"
    curl -s -w "\n\nHTTP %{http_code}\n" \
      -X POST "$ALB_URL/v1/notifications/enqueue" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d '{"event":"ticket_creado","ticketId":"00000000-0000-0000-0000-000000000001","source":"evidence-capture"}' \
      | tee -a "$EVIDENCE_DIR/async-enqueue.txt"
  fi
else
  echo "ALB URL not available — skipping E2E curl."
fi

# ---- EKS checks (F: KEDA) --------------------------------------------------
echo "[F] KEDA evidence..."
CLUSTER_NAME=$(terraform -chdir="$INFRA_DIR" output -raw eks_cluster_name 2>/dev/null || echo "ticket-system-dev-eks")
aws eks update-kubeconfig --name "$CLUSTER_NAME" --region us-east-1 2>/dev/null || true

{
  echo "=== kubectl get scaledobject -A ==="
  kubectl get scaledobject -A 2>&1 || echo "kubectl unavailable or KEDA not installed yet"
  echo ""
  echo "=== kubectl get hpa -A ==="
  kubectl get hpa -A 2>&1 || true
  echo ""
  echo "=== kubectl get deployment ticket-system-consumer -n ticket-system ==="
  kubectl get deployment ticket-system-consumer -n ticket-system -o wide 2>&1 || true
  echo ""
  echo "=== kubectl get pods -n ticket-system -l app.kubernetes.io/component=consumer ==="
  kubectl get pods -n ticket-system -l "app.kubernetes.io/component=consumer" 2>&1 || true
} | tee "$EVIDENCE_DIR/keda-evidence.txt"

echo ""
echo "=== Capture complete ==="
echo "Text evidence written to $EVIDENCE_DIR/"
echo ""
echo "PNG evidence (manual captures needed):"
echo "  event-source.png    — kubectl describe deploy ticket-system-consumer + logs"
echo "  keda-scaled-object.png — kubectl get/describe scaledobject -n ticket-system"
echo "  keda-hpa.png        — kubectl get hpa -A"
echo "  scheduler.png       — AWS Console > EventBridge > Schedules"
echo "  async-consumer.png  — kubectl logs <consumer-pod> -n ticket-system"
echo "  async-object.png    — AWS Console > S3 > bucket > async/"
echo "  github-environments.png  — GitHub Settings > Environments"
echo "  ci-apply-dev.png    — GitHub Actions > Terraform Apply run"
echo "  ci-apply-staging.png — GitHub Actions > Terraform Apply > staging gate"
echo "  ci-destroy.png      — GitHub Actions > Terraform Destroy UI"
echo "  ci-drift.png        — GitHub Actions > Terraform Drift Detection"
echo "  ruleset-config.png  — GitHub Settings > Rules > Rulesets"
echo "  ruleset-blocked-merge.png — PR with check pending/failing + merge blocked"
