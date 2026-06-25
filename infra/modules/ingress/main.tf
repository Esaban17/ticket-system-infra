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

  # Labels propios del frontend: selector DISTINTO del API para evitar que
  # kubernetes_service.web capture también los pods del API.
  web_labels = {
    "app.kubernetes.io/name"       = "ticket-system"
    "app.kubernetes.io/component"  = "web"
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
  #   SQS_QUEUE_URL (Delivery 4): consumed by the producer (POST /enqueue) and
  #   the consumer Deployment. Populated from module.async.queue_url output at
  #   the root — no hardcoded URLs.
  #   SES_FROM_ADDRESS / SNS_ALERTS_TOPIC_ARN (Delivery 5): consumed by the
  #   consumer to send notification emails (SES) and publish ops alerts (SNS).
  #   Both are non-secret and only added when provided by the root.
  data = merge(
    {
      AWS_REGION                = var.region
      AWS_S3_BUCKET_ATTACHMENTS = var.bucket_name
      NODE_ENV                  = "production"
      LOG_LEVEL                 = "log"
      PORT                      = tostring(var.app_port)
      TICKETS_RESOURCE          = var.app_resource
    },
    var.sqs_queue_url != "" ? { SQS_QUEUE_URL = var.sqs_queue_url } : {},
    var.ses_from_address != "" ? { SES_FROM_ADDRESS = var.ses_from_address } : {},
    var.sns_alerts_topic_arn != "" ? { SNS_ALERTS_TOPIC_ARN = var.sns_alerts_topic_arn } : {}
  )
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

# ---------------------------------------------------------------------------
# Web frontend (SPA) — nginx sirviendo el build de Vite
#
# VITE_API_URL="" en el build → las llamadas a /v1/... son relativas → mismo
# origen que el ALB → sin CORS. El healthcheck /healthz es servido por nginx
# (location = /healthz → 200 'ok') para que el TG no quede unhealthy.
#
# wait_for_rollout = false evita un deadlock en el primer apply: el Deployment
# se crea apuntando a la imagen recién provisionada pero el push de ECR aún no
# ha ocurrido; el pod queda en ImagePullBackOff (temporal) sin bloquear Terraform.
# El workflow web-deploy.yml publica la imagen y dispara un segundo apply que
# resuelve el pull.
# ---------------------------------------------------------------------------

resource "kubernetes_deployment" "web" {
  metadata {
    name      = "ticket-system-web"
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = local.web_labels
  }

  wait_for_rollout = false

  spec {
    replicas = var.web_replicas

    selector {
      match_labels = local.web_labels
    }

    template {
      metadata {
        labels = local.web_labels
      }

      spec {
        container {
          name  = "web"
          image = "${var.web_image}:${var.web_image_tag}"

          port {
            name           = "http"
            container_port = 8080
            protocol       = "TCP"
          }

          readiness_probe {
            http_get {
              path = "/healthz"
              port = "http"
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          liveness_probe {
            http_get {
              path = "/healthz"
              port = "http"
            }
            initial_delay_seconds = 10
            period_seconds        = 20
          }

          resources {
            requests = {
              cpu    = "50m"
              memory = "64Mi"
            }
            limits = {
              cpu    = "100m"
              memory = "128Mi"
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_service" "web" {
  metadata {
    name      = "ticket-system-web"
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = local.web_labels
  }

  spec {
    type     = "ClusterIP"
    selector = local.web_labels

    port {
      name        = "http"
      port        = 80
      target_port = "http"
      protocol    = "TCP"
    }
  }
}

# ---------------------------------------------------------------------------
# Async Consumer (Delivery 4 — Deliverable B)
#
# A dedicated ServiceAccount + Deployment that polls the SQS queue and writes
# one S3 object per message (key = MessageId). KEDA (keda module) scales this
# Deployment based on the queue depth. Only provisioned when sqs_queue_arn is
# set (feature gate via count = ... ? 1 : 0).
#
# The consumer reuses the API container image so we don't need a separate build.
# The command override points to the standalone consumer entry point, which is
# NOT served over HTTP — KEDA/HPA manage its replica count without an ALB.
# ---------------------------------------------------------------------------

locals {
  consumer_labels = {
    "app.kubernetes.io/name"       = "ticket-system"
    "app.kubernetes.io/component"  = "consumer"
    "app.kubernetes.io/managed-by" = "terraform"
  }
}

# Dedicated ServiceAccount for the consumer, annotated with the consumer IRSA
# role (sqs:Receive/Delete/GetAttrs + s3:PutObject — narrower than the app SA).
resource "kubernetes_service_account" "consumer" {
  count = var.sqs_queue_arn != "" ? 1 : 0

  metadata {
    name      = var.consumer_sa_name
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = local.consumer_labels
    annotations = {
      "eks.amazonaws.com/role-arn" = module.consumer_irsa[0].iam_role_arn
    }
  }
}

# Consumer Deployment: one container running the async-consumer script in a
# polling loop. KEDA scales the replica count from 0 to max based on queue depth.
resource "kubernetes_deployment" "consumer" {
  count = var.sqs_queue_arn != "" ? 1 : 0

  metadata {
    name      = var.consumer_deployment_name
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = local.consumer_labels
  }

  # wait_for_rollout = false avoids blocking Terraform if the initial image pull
  # is slow or if min_replica_count = 0 (KEDA scales to 0 immediately).
  wait_for_rollout = false

  spec {
    # Initial replica count; KEDA will override via the ScaledObject/HPA.
    replicas = 1

    selector {
      match_labels = local.consumer_labels
    }

    template {
      metadata {
        labels = local.consumer_labels
      }

      spec {
        service_account_name = kubernetes_service_account.consumer[0].metadata[0].name

        container {
          name = "consumer"
          # Reuse the API image: the consumer entry point is compiled with the
          # NestJS build (node dist/workers/async-consumer/main.js).
          image = "${var.image}:${var.image_tag}"

          # Override the default entrypoint to run the standalone consumer script
          # (not the NestJS HTTP server). The script polls SQS in a loop.
          command = ["node", "dist/workers/async-consumer/main.js"]

          # All env vars come from the same ConfigMap as the API. The consumer
          # only reads SQS_QUEUE_URL, AWS_S3_BUCKET_ATTACHMENTS, AWS_REGION,
          # and POLLING_BATCH_SIZE; the other keys are ignored but harmless.
          env_from {
            config_map_ref {
              name = kubernetes_config_map.app.metadata[0].name
            }
          }

          # POLLING_BATCH_SIZE is a separate env var so KEDA and the consumer
          # can be tuned independently (batch size doesn't affect queue depth).
          env {
            name  = "POLLING_BATCH_SIZE"
            value = tostring(var.polling_batch_size)
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "250m"
              memory = "256Mi"
            }
          }
        }
      }
    }
  }

  # Wait for the namespace and service account before creating the Deployment.
  depends_on = [
    kubernetes_namespace.this,
    kubernetes_service_account.consumer,
    kubernetes_config_map.app,
  ]
}
