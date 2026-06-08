# ---------------------------------------------------------------------------
# alb_controller module — Deliverable C (EKS ingress prerequisite).
#
# Installs the AWS Load Balancer Controller as a Helm release in kube-system
# and wires its Kubernetes ServiceAccount to a least-privilege IAM role via
# IRSA (IAM Roles for Service Accounts). Once running, the controller watches
# kubernetes_ingress_v1 objects (created in the ingress module) and provisions
# an internet-facing ALB with target-type = ip pointing at the app pods.
#
# Why a dedicated module: the controller is cluster-scoped infrastructure with
# its own IAM trust relationship, distinct from the per-app ingress resources.
#
# Files:
#   main.tf       — IRSA role (official LB-controller policy) + helm_release
#   variables.tf  — cluster identifiers, OIDC provider, chart version
#   outputs.tf    — controller role ARN + helm release name
# ---------------------------------------------------------------------------

# IRSA role for the controller's ServiceAccount. The community IAM submodule
# attaches the canonical AWS Load Balancer Controller IAM policy and scopes the
# trust policy to the kube-system:aws-load-balancer-controller service account.
module "lb_controller_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.39"

  role_name                              = "${var.cluster_name}-alb-controller"
  attach_load_balancer_controller_policy = true

  oidc_providers = {
    main = {
      provider_arn               = var.oidc_provider_arn
      namespace_service_accounts = ["kube-system:${var.service_account_name}"]
    }
  }

  tags = var.tags
}

resource "helm_release" "aws_load_balancer_controller" {
  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  namespace  = "kube-system"
  version    = var.chart_version

  # Bind the chart's ServiceAccount to the IRSA role created above.
  set {
    name  = "clusterName"
    value = var.cluster_name
  }
  set {
    name  = "serviceAccount.create"
    value = "true"
  }
  set {
    name  = "serviceAccount.name"
    value = var.service_account_name
  }
  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = module.lb_controller_irsa.iam_role_arn
  }
  set {
    name  = "region"
    value = var.region
  }
  set {
    name  = "vpcId"
    value = var.vpc_id
  }

  # Recent charts create a default IngressClass named "alb"; keep it explicit.
  set {
    name  = "createIngressClassResource"
    value = "true"
  }
}
