# ---------------------------------------------------------------------------
# container-insights module — Delivery 5, Deliverable G (opcional):
# monitoring stack on EKS via CloudWatch Container Insights.
#
# Arquitectura:
#   - amazon-cloudwatch namespace (creado aquí).
#   - IRSA: un IAM role para el ServiceAccount "cloudwatch-agent" con la managed
#     policy CloudWatchAgentServerPolicy adjunta (igual patrón que alb_controller).
#     El módulo comunitario scopea el trust a
#     system:serviceaccount:amazon-cloudwatch:cloudwatch-agent.
#   - helm_release "aws-cloudwatch-metrics": despliega el CloudWatch agent como
#     DaemonSet, que publica métricas de Container Insights (CPU/memoria/red por
#     pod/node/namespace) al namespace de métricas ContainerInsights.
#   - helm_release "aws-for-fluent-bit": DaemonSet que envía los logs de los
#     contenedores a CloudWatch Logs (application/dataplane/host log groups).
#     Reutiliza el mismo IRSA — CloudWatchAgentServerPolicy ya incluye los
#     permisos logs:CreateLogGroup/Stream/PutLogEvents que Fluent Bit necesita.
#
# Files:
#   main.tf       — namespace + IRSA + helm_release (metrics + fluent-bit)
#   variables.tf  — cluster identifiers, OIDC provider, region, chart versions
#   outputs.tf    — IRSA role ARN + namespace
# ---------------------------------------------------------------------------

# IRSA role para el ServiceAccount del CloudWatch agent. El submódulo comunitario
# adjunta la managed policy CloudWatchAgentServerPolicy y scopea el trust policy
# al ServiceAccount amazon-cloudwatch:cloudwatch-agent.
module "cloudwatch_agent_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.39"

  role_name = "${var.cluster_name}-cloudwatch-agent"

  # CloudWatchAgentServerPolicy: permite publicar métricas (cloudwatch:PutMetricData)
  # y logs (logs:CreateLogGroup/CreateLogStream/PutLogEvents/DescribeLogStreams),
  # exactamente lo que el agente de Container Insights y Fluent Bit requieren.
  role_policy_arns = {
    cloudwatch_agent = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
  }

  oidc_providers = {
    main = {
      provider_arn               = var.oidc_provider_arn
      namespace_service_accounts = ["${var.namespace}:${var.service_account_name}"]
    }
  }

  tags = var.tags
}

# Namespace donde viven el CloudWatch agent y Fluent Bit. Creado explícitamente
# (en lugar de create_namespace en cada Helm release) para que ambos releases lo
# compartan sin condiciones de carrera y el namespace tenga un dueño único.
resource "kubernetes_namespace" "amazon_cloudwatch" {
  metadata {
    name = var.namespace

    labels = {
      "app.kubernetes.io/managed-by" = "terraform"
      "app.kubernetes.io/part-of"    = "container-insights"
    }
  }
}

# ---- CloudWatch agent (métricas de Container Insights) ----------------------
# DaemonSet que recolecta métricas de nodos/pods y las publica en el namespace
# ContainerInsights de CloudWatch. El ServiceAccount lo crea el chart y se anota
# con el role ARN del IRSA para autenticar sin credenciales estáticas.
resource "helm_release" "aws_cloudwatch_metrics" {
  name       = "aws-cloudwatch-metrics"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-cloudwatch-metrics"
  namespace  = kubernetes_namespace.amazon_cloudwatch.metadata[0].name
  version    = var.cloudwatch_metrics_chart_version

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
    value = module.cloudwatch_agent_irsa.iam_role_arn
  }

  depends_on = [module.cloudwatch_agent_irsa]
}

# ---- Fluent Bit (logs de contenedores → CloudWatch Logs) --------------------
# DaemonSet que enruta application/dataplane/host logs a CloudWatch Logs. Reutiliza
# el mismo IRSA: CloudWatchAgentServerPolicy ya concede los permisos logs:* que
# Fluent Bit necesita, así que no hace falta un role dedicado.
resource "helm_release" "aws_for_fluent_bit" {
  name       = "aws-for-fluent-bit"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-for-fluent-bit"
  namespace  = kubernetes_namespace.amazon_cloudwatch.metadata[0].name
  version    = var.fluent_bit_chart_version

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
    value = module.cloudwatch_agent_irsa.iam_role_arn
  }

  # Región de los log groups de CloudWatch Logs a los que Fluent Bit escribe.
  set {
    name  = "cloudWatch.region"
    value = var.region
  }

  # Log group por cluster para los logs de aplicación.
  set {
    name  = "cloudWatch.logGroupName"
    value = "/aws/containerinsights/${var.cluster_name}/application"
  }

  depends_on = [module.cloudwatch_agent_irsa]
}
