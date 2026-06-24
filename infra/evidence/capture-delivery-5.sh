#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# capture-delivery-5.sh — Genera los archivos de evidencia de TEXTO para D5
# (Security, Observability & One-Click Deployment).
#
# Uso:
#   cd infra/
#   terraform init -backend-config=envs/dev/backend-dev.hcl
#   bash evidence/capture-delivery-5.sh
#
# Variables opcionales:
#   APP_DOMAIN     (default tickets.nextcodegt.com)  — endpoint público para TLS
#   K8S_NAMESPACE  (default ticket-system)           — namespace del Ingress
#
# Requiere: terraform (init con backend dev), aws, curl; kubectl opcional
# (si Zscaler bloquea el endpoint del EKS, el paso de Ingress se omite).
#
# Los archivos .png los toma el operador manualmente (consola AWS / GitHub UI):
#   secrets-console.png, oidc-secrets-removed.png, oidc-auth-log.png,
#   dashboard.png, budget.png, clean-state-pipeline.png, deployed-components.png,
#   irsa-sa.png, eks-monitoring.png, bot-command.png, bot-pipeline-run.png.
# ---------------------------------------------------------------------------

set -uo pipefail

EVIDENCE_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$(dirname "$EVIDENCE_DIR")"
APP_DOMAIN="${APP_DOMAIN:-tickets.nextcodegt.com}"
NS="${K8S_NAMESPACE:-ticket-system}"
TS="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

tf() { terraform -chdir="$INFRA_DIR" "$@"; }
log() { echo "=== $* ==="; }

echo "=== Delivery 5 evidence capture — $TS ===" | tee "$EVIDENCE_DIR/capture-d5.log"

# ---- A: IAM module (roles/policies/OIDC sin wildcards) --------------------
log "A: recursos IAM del plan -> iam-plan.txt"
tf plan -no-color 2>/dev/null \
  | grep -E 'module\.iam|aws_iam_role|aws_iam_policy|aws_iam_role_policy|aws_iam_openid_connect_provider' \
  | tee "$EVIDENCE_DIR/iam-plan.txt" || true

# ---- B: KMS CMK + Secrets Manager -----------------------------------------
log "B: outputs de KMS + Secrets -> secrets-kms.txt"
tf output -no-color 2>/dev/null \
  | grep -iE 'kms|secret' \
  | tee "$EVIDENCE_DIR/secrets-kms.txt" || true

# ---- D: TLS termination (https 200 + cert, http 301, ingress) -------------
log "D: TLS end-to-end -> tls-curl.txt"
{
  echo "### $TS"
  echo "### curl -v https://$APP_DOMAIN/healthz  (espera handshake TLS + HTTP 200)"
  curl -sv "https://$APP_DOMAIN/healthz" 2>&1 \
    | grep -E 'subject:|issuer:|SSL connection|TLS|^< HTTP|^> GET' || true
  echo
  echo "### curl -sI http://$APP_DOMAIN/healthz  (espera HTTP 301 -> https)"
  curl -sI "http://$APP_DOMAIN/healthz" 2>&1 \
    | grep -iE 'HTTP/|location:' || true
  echo
  echo "### kubectl describe ingress -n $NS  (espera certificate-arn + ssl-redirect)"
  if command -v kubectl >/dev/null 2>&1; then
    kubectl describe ingress -n "$NS" 2>&1 \
      | grep -iE 'certificate-arn|ssl-redirect|listen-ports|Host|/v1|/healthz|Address' || true
  else
    echo "(kubectl no disponible en este host)"
  fi
} | tee "$EVIDENCE_DIR/tls-curl.txt"

# ---- E: Observability (log groups, alarmas, dashboard, budget) ------------
log "E: outputs de observability -> observability-outputs.txt"
tf output -no-color 2>/dev/null \
  | grep -iE 'observability|alarm|dashboard|sns|log_group' \
  | tee "$EVIDENCE_DIR/observability-outputs.txt" || true

# ---- I: IaC coverage — terraform state list (7 categorías) ----------------
log "I: terraform state list -> state-list.txt"
tf state list 2>/dev/null | tee "$EVIDENCE_DIR/state-list.txt" || true

# ---- F: one-click — output completo + chequeo de idempotencia -------------
log "F: terraform output completo -> terraform-output-full.txt"
tf output -no-color 2>/dev/null | tee "$EVIDENCE_DIR/terraform-output-full.txt" || true

log "F: terraform plan -detailed-exitcode -> idempotent-plan.txt"
tf plan -detailed-exitcode -no-color > "$EVIDENCE_DIR/idempotent-plan.txt" 2>&1
EC=$?
echo "" >> "$EVIDENCE_DIR/idempotent-plan.txt"
echo "detailed_exitcode=$EC  (0 = sin cambios / idempotente, 2 = hay cambios)" \
  | tee -a "$EVIDENCE_DIR/idempotent-plan.txt"

echo "=== captura D5 completa. Revisa $EVIDENCE_DIR/*.txt y toma los .png en consola. ==="
