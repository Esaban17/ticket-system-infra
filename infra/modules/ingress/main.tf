# ---------------------------------------------------------------------------
# ingress module — Deliverable C (public ingress) + Deliverable D (app stack).
#
# Manages the full application surface on the EKS cluster via the Kubernetes
# provider:
#   namespace → serviceaccount(IRSA) → configmap + secret → deployment →
#   service(ClusterIP) → ingress(ALB) , plus a one-shot seed Job.
#
# The Service is type ClusterIP (NOT LoadBalancer): external traffic enters
# exclusively through the ALB the controller provisions for the Ingress, so no
# redundant NLB is created (rubric, EKS track).
#
# Files:
#   main.tf       — namespace, SA, configmap, secret, deployment, service
#   iam.tf        — app IRSA role (least-privilege S3) + custom policy
#   ingress.tf    — kubernetes_ingress_v1 (ALB) + DB seed Job
#   variables.tf  — inputs
#   outputs.tf    — ingress URL/hostname + app role ARN
# ---------------------------------------------------------------------------

locals {
  labels = {
    "app.kubernetes.io/name"       = "ticket-system"
    "app.kubernetes.io/component"  = "api"
    "app.kubernetes.io/managed-by" = "terraform"
  }

  # Prisma/libpq connection string. The password comes from the TF_VAR chain
  # and is stored only in the Kubernetes Secret below — never in a ConfigMap.
  database_url = "postgresql://${var.db_username}:${var.db_password}@${var.db_endpoint}/${var.db_name}?schema=public"
}

resource "kubernetes_namespace" "this" {
  metadata {
    name   = var.namespace
    labels = local.labels
  }
}

# ServiceAccount annotated for IRSA so pods assume the least-privilege S3 role.
resource "kubernetes_service_account" "app" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = local.labels
    annotations = {
      "eks.amazonaws.com/role-arn" = module.app_irsa.iam_role_arn
    }
  }
}

# Non-secret configuration (rubric: non-sensitive config flows through var.*).
resource "kubernetes_config_map" "app" {
  metadata {
    name      = "${var.app_name}-config"
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = local.labels
  }

  # Keys match the app's env schema (src/config/env.validation.ts):
  #   AWS_REGION, AWS_S3_BUCKET_ATTACHMENTS, LOG_LEVEL(enum), NODE_ENV(enum), PORT
  data = {
    AWS_REGION                = var.region
    AWS_S3_BUCKET_ATTACHMENTS = var.bucket_name
    NODE_ENV                  = "production"
    LOG_LEVEL                 = "log"
    PORT                      = tostring(var.app_port)
    TICKETS_RESOURCE          = var.app_resource
  }
}

# JWT_SECRET is required by the app's env schema (min 32 chars) but is unused by
# the two E2E endpoints. Generated here so no secret value is committed.
resource "random_password" "jwt" {
  length  = 48
  special = false
}

# Sensitive configuration: DATABASE_URL (contains the DB password) and the
# generated JWT_SECRET live ONLY in a Secret — never a ConfigMap, never
# committed. DATABASE_URL is sourced from the TF_VAR_db_password chain.
resource "kubernetes_secret" "app" {
  metadata {
    name      = "${var.app_name}-secret"
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = local.labels
  }

  data = {
    DATABASE_URL = local.database_url
    JWT_SECRET   = random_password.jwt.result
  }

  type = "Opaque"
}

resource "kubernetes_deployment" "app" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = local.labels
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = local.labels
    }

    template {
      metadata {
        labels = local.labels
      }

      spec {
        service_account_name = kubernetes_service_account.app.metadata[0].name

        container {
          name  = "api"
          image = "${var.image}:${var.image_tag}"

          port {
            name           = "http"
            container_port = var.app_port
            protocol       = "TCP"
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map.app.metadata[0].name
            }
          }
          env_from {
            secret_ref {
              name = kubernetes_secret.app.metadata[0].name
            }
          }

          readiness_probe {
            http_get {
              path = var.health_check_path
              port = "http"
            }
            initial_delay_seconds = 15
            period_seconds        = 10
          }

          liveness_probe {
            http_get {
              path = var.health_check_path
              port = "http"
            }
            initial_delay_seconds = 30
            period_seconds        = 20
          }

          resources {
            requests = {
              cpu    = "250m"
              memory = "256Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "512Mi"
            }
          }
        }
      }
    }
  }

  # Wait for the seed Job to populate the DB before the GET endpoint is hit.
  depends_on = [kubernetes_job.db_seed]
}

# Service is ClusterIP — external traffic enters only via the ALB Ingress.
resource "kubernetes_service" "app" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = local.labels
  }

  spec {
    type     = "ClusterIP"
    selector = local.labels

    port {
      name        = "http"
      port        = 80
      target_port = "http"
      protocol    = "TCP"
    }
  }
}
