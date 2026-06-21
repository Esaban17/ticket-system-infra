# ADR 0012 — Layout multi-entorno y pipeline CD con promoción de artefacto

**Fecha:** 2026-06-21
**Estado:** Aceptado
**Owners:** Estuardo (D4 Deliverable D — infra + CI/CD)
**Cierra:** Elección de estrategia multi-entorno y modelo de apply (D4 spec §3.4)
**Items relacionados:** Delivery 4 Deliverable D, BL-140

---

## Contexto

Delivery 4 exige:
1. Un layout multi-entorno en Terraform (dev + staging con ≥3 valores distintos).
2. Un pipeline CD que incluya: PR validation con 3 status checks separados,
   apply con artefacto de plan (no re-plan), gate de staging con revisor, destroy
   gated por entorno, y drift detection diario.
3. Un branch ruleset en main que requiera los 3 status checks antes de hacer merge.

Restricciones:
- El state de dev ya existe en S3 bajo la key `infra/terraform.tfstate`.
- El DynamoDB lock table y el bucket S3 del backend ya están provisionados
  (`ticket-system-tfstate-galileo-pdds`, `ticket-system-tflock`).
- Los workflows deben funcionar con GitHub MCP (no hay `gh` CLI disponible para
  los pasos de operator UI).

---

## Opciones consideradas (layout multi-entorno)

### Opción A — Terraform Workspaces

| Aspecto | Evaluación |
|---|---|
| Layout | Un solo `backend.tf`; `terraform workspace select dev/staging`. |
| Keys S3 | Automáticas: `env:/dev/terraform.tfstate`, `env:/staging/terraform.tfstate`. |
| Por-env config | Variables de tfvars inyectadas manualmente según el workspace activo. |
| Problema | El workspace activo es estado implícito en el CLI — riesgo de apply en el entorno equivocado. |
| Riesgo | Sin separación visual en el repositorio de qué valores son de staging vs dev. |

### Opción B — Pattern A: backends separados por entorno

| Aspecto | Evaluación |
|---|---|
| Layout | `backend.tf` vacío (partial config); un `.hcl` por entorno en `envs/<env>/backend-<env>.hcl`. |
| Keys S3 | Explícitas: `infra/dev/terraform.tfstate`, `infra/staging/terraform.tfstate`. |
| Por-env config | Un `staging.tfvars` explícito con todos los valores. |
| Separación | Cada entorno inicializa con `terraform init -backend-config=...` — es imposible mezclar. |
| Auditoría | `git log envs/staging/staging.tfvars` muestra el historial del entorno. |

---

## Opciones consideradas (pipeline CD)

### Opción C — Re-plan en apply

El apply workflow hace su propio `terraform plan` antes del `terraform apply`.

- **Riesgo**: si el estado cambia entre el plan de CI (en el PR) y el plan del
  apply (en el merge), el apply ejecuta algo diferente a lo que se revisó.
- **Simpleza**: sin manejo de artefactos cross-job.

### Opción D — Plan-artifact promotion (elegida junto a B)

El plan generado en CI se sube como artefacto (`tfplan`). El apply descarga el
artefacto y ejecuta `terraform apply tfplan` — exactamente el plan revisado.

- **Garantía**: el apply ejecuta el plan aprobado, sin desviaciones por timing.
- **Complejidad**: manejo de artefactos dentro del mismo workflow run (plan-dev
  job → apply-dev job), eliminando la complejidad de búsqueda cross-workflow.

---

## Criterios de decisión

1. **Rubric §4 "Full CD Pipeline"**: exige explícitamente 3 status checks
   separados, plan-artifact promotion, gate de staging y drift detection.
2. **Aislamiento de state**: Pattern A hace imposible el apply accidental en el
   entorno equivocado — cada init vincula el CLI al state de UN solo entorno.
3. **Auditoría**: con Pattern A, `git diff envs/staging/` muestra exactamente
   qué cambia en staging antes del merge.
4. **Simplicidad en Actions**: el artefacto se sube y descarga dentro del mismo
   `workflow_run` — no hay búsqueda cross-workflow por SHA o run-id.

---

## Decisión

**Opción B (Pattern A) + Opción D (plan-artifact promotion).**

### Layout Terraform
- `infra/backend.tf` → `backend "s3" {}` vacío (partial config).
- `infra/envs/dev/backend-dev.hcl` → key `infra/dev/terraform.tfstate`.
- `infra/envs/staging/backend-staging.hcl` → key `infra/staging/terraform.tfstate`.
- `infra/envs/staging/staging.tfvars` → ≥3 valores distintos a dev:
  `db_instance_class=db.t4g.small`, `eks_node_max_size=3`, `eks_node_desired_size=2`,
  `sqs_message_retention_seconds=86400`, `keda_max_replica_count=3`.
- Migración del state de dev: `terraform init -migrate-state -backend-config=envs/dev/backend-dev.hcl`.

### Pipeline CI (`terraform-ci.yml`)
Tres jobs separados → tres status checks distintos en el PR:
- `fmt` — `terraform fmt --check -recursive` (sin AWS).
- `validate` — `terraform init` + `terraform validate`.
- `plan` — `terraform plan -out=tfplan` + upload artifact + PR comment.

El ruleset de main requiere los tres checks (`fmt`, `validate`, `plan`).

### Pipeline Apply (`terraform-apply.yml`)
- `plan-dev` — plan dev, sube `tfplan-dev-<run_id>` como artefacto.
- `apply-dev` — descarga el artefacto, `terraform apply tfplan` (env: `dev`).
- `apply-staging` — plan+apply staging (env: `staging`, required reviewer: gitcombo).

### Secrets por entorno
- `dev` environment: usa el secret de repo `TF_VAR_DB_PASSWORD`.
- `staging` environment: usa el secret del GitHub Environment `STAGING_DB_PASSWORD`.

---

## Consecuencias

✅ **Positivas**

- El apply de dev ejecuta EXACTAMENTE el plan revisado por el PR (artefacto).
- El apply de staging requiere aprobación explícita (gate).
- Los tres status checks aparecen como checks separados en el PR → el ruleset
  puede requerir cada uno individualmente.
- Pattern A: imposible hacer `terraform apply envs/staging` sin haber hecho
  `terraform init -backend-config=envs/staging/backend-staging.hcl` primero.
- El drift check diario alerta de cambios fuera de Terraform.

⚠️ **Negativas / trade-offs aceptados**

- **Migración del state de dev** (key antigua → nueva): paso manual con
  `-migrate-state`. Riesgo mitigado con respaldo previo del state.
- **Staging cold-start** requiere apply en dos fases (EKS chicken-egg). Mismo
  patrón que dev (ya documentado en el apply workflow).
- **Artefacto tfplan válido solo para el state al momento del plan**: si alguien
  aplica manualmente entre el plan y el apply, el artefacto puede fallar. Mitigado
  por el lock DynamoDB que impide dos applies simultáneos.

---

## Referencias

- Delivery 4 PDF §3.4 — "Full CD Pipeline"
- `.github/workflows/terraform-ci.yml`, `terraform-apply.yml`, `terraform-destroy.yml`, `terraform-drift.yml`
- `infra/envs/dev/`, `infra/envs/staging/`
- ADR 0011 — decisiones de compute (context del pipeline)
