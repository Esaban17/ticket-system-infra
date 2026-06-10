# ticket-system-infra

Sistema de tickets e incidentes — diseño, aplicación e infraestructura como código.

**Universidad Galileo · Postgrado en Diseño y Desarrollo de Software**  
Cursos: *Infraestructura en la Nube* + *Optimizations and Performance*  
Ciclo: Mayo–Junio 2026

---

## Repositorio

Este repositorio contiene el diseño del sistema (curso de *Infraestructura en la Nube*) y el código de automatización Terraform + pipeline CI/CD (curso de *Optimizations and Performance*) para el mismo sistema. Ambos cursos trabajan sobre el mismo repositorio de forma iterativa.

## Estructura

```
app/api/        → API REST (NestJS 10 + Prisma 5 + PostgreSQL)
app/web/        → Frontend (Vite + React 18 + TypeScript + Tailwind) + suite E2E Playwright
deploy/charts/  → Helm chart de la API (EKS)
docs/           → Documento vivo del diseño, entregas E1–E4, mockups (low-fi y hi-fi), ADRs, RFCs, backlog
infra/          → Código Terraform e infraestructura como código
k8s/            → Manifests de Kubernetes (EKS track)
.github/        → Pipelines de GitHub Actions (CI api/web/terraform, CD imagen + deploy)
```

Ver [`infra/README.md`](infra/README.md) (Terraform), [`app/api/README.md`](app/api/README.md) (API) y [`app/web/README.md`](app/web/README.md) (frontend) para instrucciones de uso.

## Entregas — Infraestructura en la Nube

| Entrega | Tag | Fecha | Estado |
|---|---|---|---|
| E1 — Casos de uso + mockups low-fi | `inube-entrega-1` | 17 may 2026 | ✅ |
| E2 — Cómputo, datos y plan de pruebas | `inube-entrega-2` | 24 may 2026 | ✅ |
| E3 — Red + escenarios de prueba | `inube-entrega-3` | 31 may 2026 | ✅ |
| E4 — Procesamiento asíncrono + frontend | `inube-entrega-4` | 7 jun 2026 | ✅ |
| E5 — Seguridad, observabilidad y costos | — | — | ⏳ |

## Deliveries — Optimizations and Performance

| Delivery | Tag | Fecha | Estado |
|---|---|---|---|
| D1 — Workspace Bootstrap & CI | `oyd-delivery-1` | 10 may 2026 | ✅ |
| D2 — Cómputo, Storage, BD | `oyd-delivery-2` | 21 may 2026 | ✅ |
| D3 — Capa de Red | `oyd-delivery-3` | 8 jun 2026 | ✅ |
| D4 — Asíncrono + CD | `oyd-delivery-4` | 21 jun 2026 | 🔨 en curso |
| D5 — Seguridad + Observabilidad | `oyd-delivery-5` | 25 jun 2026 | ⏳ |

## Estado actual (10 jun 2026)

**Aplicación — mergeado a `main`:**

- **API completa** (`app/api`): dominio (users/tickets/eventos/SLA/adjuntos), RBAC con JWT (mock hasta Cognito), creación con idempotencia, ciclo de vida con state machine + optimistic locking, historial/filtros/búsqueda con cursor, adjuntos S3 prefirmados, CSV streaming, workers de escalamiento y notificaciones (stub). 23 suites / 190 tests, cobertura ≥70% en CI contra Postgres efímero.
- **Frontend completo** (`app/web`, PRs #41–#50): las 8 pantallas de los casos de uso (login, cola, crear incidente/solicitud, detalle+resolución, historial, escalados SLA, reportes), conectado al API real. Mockups hi-fi generados con Stitch en [`docs/mockups/hifi/`](docs/mockups/hifi/README.md). Verificación E2E de autenticación, creación, asignación y resolución con Playwright (`npm run test:e2e` — 4 passed).
- **CD funcional**: build de imagen a ECR + deploy a EKS por GitHub Actions; RBAC activo en prod verificado (último despliegue: imagen `b506b58`, 2/2 pods).

**Infraestructura:** el entorno AWS está **destruido por control de costos** (`terraform destroy`); re-aplicar requiere `terraform apply` desde CI o una red con acceso al endpoint de EKS. El estado remoto y los workspaces se conservan.

**Pendiente para D4/D5:** decisiones humanas (IdP Cognito, dominio SES, retención S3), recursos que requieren AWS vivo (SQS/EventBridge/Secrets/alarmas, envío real del worker) y el cierre de documentación — detalle en [`docs/backlog.md`](docs/backlog.md).
