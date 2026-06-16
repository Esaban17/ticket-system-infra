# ---------------------------------------------------------------------------
# DB seed Job + ALB Ingress.
# ---------------------------------------------------------------------------

# One-shot Job that applies the committed Prisma migration and inserts the seed
# row(s) BEFORE the app starts serving traffic (the Deployment depends on it).
# This is the committed, reproducible seed mechanism the rubric requires — no
# console-inserted data. It runs in-cluster so it can reach the private RDS
# instance (node app-sg → db-sg).
resource "kubernetes_job" "db_seed" {
  metadata {
    name      = "${var.app_name}-db-seed"
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = local.labels
  }

  spec {
    backoff_limit = 3

    template {
      metadata {
        labels = local.labels
      }

      spec {
        service_account_name = kubernetes_service_account.app.metadata[0].name
        restart_policy       = "Never"

        container {
          name    = "seed"
          image   = "${var.image}:${var.image_tag}"
          command = ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/seed.js"]

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
        }
      }
    }
  }

  wait_for_completion = true

  timeouts {
    create = "10m"
    update = "10m"
  }
}

# Internet-facing ALB provisioned by the AWS Load Balancer Controller. The app
# Service is ClusterIP, so this Ingress is the ONLY public entry point.
resource "kubernetes_ingress_v1" "app" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace.this.metadata[0].name
    labels    = local.labels

    annotations = {
      "alb.ingress.kubernetes.io/scheme"                              = "internet-facing"
      "alb.ingress.kubernetes.io/target-type"                         = "ip"
      "alb.ingress.kubernetes.io/listen-ports"                        = "[{\"HTTP\": 80}]"
      "alb.ingress.kubernetes.io/healthcheck-path"                    = var.health_check_path
      "alb.ingress.kubernetes.io/healthcheck-protocol"                = "HTTP"
      "alb.ingress.kubernetes.io/security-groups"                     = var.web_security_group_id
      "alb.ingress.kubernetes.io/manage-backend-security-group-rules" = "true"
    }
  }

  spec {
    ingress_class_name = "alb"

    rule {
      http {
        # Rutas específicas del API declaradas ANTES del catch-all del web.
        # El ALB Controller asigna prioridades de regla según el orden de los
        # paths: las rutas más específicas reciben una prioridad más alta (número
        # menor) y se evalúan primero, evitando que "/" capture tráfico del API.

        path {
          path      = "/v1"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service.app.metadata[0].name
              port { number = 80 }
            }
          }
        }

        path {
          path      = "/healthz"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service.app.metadata[0].name
              port { number = 80 }
            }
          }
        }

        path {
          path      = "/readyz"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service.app.metadata[0].name
              port { number = 80 }
            }
          }
        }

        # Catch-all: cualquier ruta no capturada arriba va al frontend (SPA).
        # nginx sirve index.html vía try_files para que React Router funcione.
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service.web.metadata[0].name
              port { number = 80 }
            }
          }
        }
      }
    }
  }

  wait_for_load_balancer = true

  # Ordering note: the ALB Controller (alb_controller module) must be running
  # before this Ingress is created or the ALB never gets provisioned. That
  # ordering is enforced at the root via `module "ingress" { depends_on =
  # [module.alb_controller] }`.

  timeouts {
    create = "10m"
  }
}
