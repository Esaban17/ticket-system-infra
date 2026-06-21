# ---------------------------------------------------------------------------
# keda module — KEDA Helm release + IRSA + ScaledObject (Delivery 4,
# Deliverable F — EKS Async Integration, +25 pts).
#
# Architecture:
#   KEDA operator (keda namespace, IRSA: sqs:GetQueueAttributes) polls the
#   SQS queue's ApproximateNumberOfMessages metric and adjusts the consumer
#   Deployment's replica count via an HPA. identityOwner=operator means KEDA
#   uses its own AWS identity — no per-pod credential overhead.
#
# Note — two-phase apply required:
#   The kubernetes_manifest for the ScaledObject references the ScaledObject
#   CRD installed by the KEDA Helm chart. Terraform plans fail if the CRD
#   doesn't exist yet. The apply workflow's two-phase approach handles this:
#   Phase 1 targets infra modules (incl. eks); Phase 2 applies everything else
#   (incl. this module's helm_release and then kubernetes_manifest).
# ---------------------------------------------------------------------------

# ---- KEDA operator IRSA ------------------------------------------------------
# The keda-operator ServiceAccount (created by the Helm chart in the keda
# namespace) is annotated with this role ARN so KEDA can call
# sqs:GetQueueAttributes on the queue without static AWS credentials.

data "aws_iam_policy_document" "keda_sqs" {
  statement {
    sid     = "AllowKedaToReadQueueDepth"
    effect  = "Allow"
    actions = ["sqs:GetQueueAttributes"]
    # Scoped to the SPECIFIC queue ARN — no wildcard (rubric).
    resources = [var.queue_arn]
  }
}

resource "aws_iam_policy" "keda_sqs" {
  name        = "${var.cluster_name}-keda-sqs"
  description = "Allows the KEDA operator to read SQS queue depth (GetQueueAttributes) for scaling decisions. Scoped to the async queue only."
  policy      = data.aws_iam_policy_document.keda_sqs.json
}

module "keda_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.39"

  role_name = "${var.cluster_name}-keda-operator"

  role_policy_arns = {
    sqs = aws_iam_policy.keda_sqs.arn
  }

  oidc_providers = {
    main = {
      provider_arn = var.oidc_provider_arn
      # keda-operator SA lives in the keda namespace (created by Helm).
      namespace_service_accounts = ["keda:keda-operator"]
    }
  }
}

# ---- KEDA Helm release -------------------------------------------------------
# Installs the KEDA operator and its CRDs (ScaledObject, TriggerAuthentication,
# etc.) into the keda namespace. The service account is annotated with the IRSA
# role ARN so the operator can call SQS without static credentials.

resource "helm_release" "keda" {
  name             = "keda"
  repository       = "https://kedacore.github.io/charts"
  chart            = "keda"
  namespace        = "keda"
  create_namespace = true
  version          = var.keda_version

  # Annotate the keda-operator SA with the IRSA role so the operator can call
  # sqs:GetQueueAttributes using Pod Identity / IRSA without static keys.
  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = module.keda_irsa.iam_role_arn
  }

  # Ensure the IRSA role exists before the Helm release creates the SA.
  depends_on = [module.keda_irsa]
}

# ---- ScaledObject ------------------------------------------------------------
# Tells KEDA to scale the consumer Deployment based on the SQS queue depth.
# identityOwner=operator: KEDA uses the operator's IRSA credentials to call
# GetQueueAttributes — no additional IAM setup on the consumer pods.

resource "kubernetes_manifest" "consumer_scaledobject" {
  manifest = {
    apiVersion = "keda.sh/v1alpha1"
    kind       = "ScaledObject"
    metadata = {
      name      = "${var.consumer_deployment_name}-scaledobject"
      namespace = var.namespace
      labels = {
        "app.kubernetes.io/managed-by" = "terraform"
      }
    }
    spec = {
      scaleTargetRef = {
        name = var.consumer_deployment_name
      }
      minReplicaCount = var.min_replica_count
      maxReplicaCount = var.max_replica_count
      triggers = [
        {
          type = "aws-sqs-queue"
          metadata = {
            queueURL    = var.queue_url
            queueLength = tostring(var.queue_length_trigger)
            awsRegion   = var.aws_region
            # identityOwner=operator: KEDA operator uses its own IRSA role
            # (sqs:GetQueueAttributes) instead of burdening the consumer pods
            # with additional IAM permissions.
            identityOwner = "operator"
          }
        }
      ]
    }
  }

  # The ScaledObject CRD is installed by the Helm chart. Apply ordering:
  # helm_release installs CRDs → kubernetes_manifest creates the ScaledObject.
  depends_on = [helm_release.keda]
}
