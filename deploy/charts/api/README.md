# Helm chart: `ticket-system-api`

Chart base para desplegar la API (NestJS 10 + Prisma, `app/api`) en EKS.
Cubre **BL-103** (chart base) y se integra con **BL-104** (IRSA).

## Relación con el despliegue de Terraform

> [!IMPORTANT]
> Este chart es una **alternativa / compañera** al despliegue gestionado con
> los recursos `kubernetes_*` de Terraform (y a los manifests sueltos de `k8/`).
> **No deben aplicarse ambos a la vez sobre el mismo namespace**: gestionan los
> mismos objetos (`Deployment`, `Service`, `ServiceAccount`) y entrarían en
> conflicto. Elegir una sola vía de despliegue por entorno.

Se mantiene este chart para tener un empaquetado portable, versionable y
parametrizable por entorno, apto para GitOps (Argo CD / Flux) o `helm upgrade`
desde CI, sin acoplar el despliegue de la app al `terraform apply` de la infra.

## Contenido

| Recurso | Plantilla | Notas |
|---|---|---|
| `Deployment` | `templates/deployment.yaml` | Puerto 8080, `envFrom` ConfigMap+Secret, probes `/healthz` y `/readyz`, requests/limits, no-root |
| `Service` | `templates/service.yaml` | `ClusterIP`, puerto 80 → `targetPort: http` |
| `ServiceAccount` | `templates/serviceaccount.yaml` | Anotación IRSA `eks.amazonaws.com/role-arn` |
| `HorizontalPodAutoscaler` | `templates/hpa.yaml` | `autoscaling/v2`, CPU 70%, min 1 / max 3 |
| `PodDisruptionBudget` | `templates/pdb.yaml` | `policy/v1`, `minAvailable: 1` |

Todos los `apiVersion` usados (`apps/v1`, `autoscaling/v2`, `policy/v1`) son GA
en Kubernetes 1.30.

## IRSA (BL-104)

El `ServiceAccount` se llama `api-sa` (en el namespace `ticket-system`) para que
coincida con la _trust policy_ del rol IAM. El ARN del rol se inyecta vía
`serviceAccount.roleArn` (salida del módulo Terraform de IRSA):

```yaml
serviceAccount:
  create: true
  name: api-sa
  roleArn: arn:aws:iam::<account_id>:role/<cluster>-app
```

Si `roleArn` está vacío, la anotación no se emite (útil para `helm template` o
pruebas locales sin IRSA).

## Configuración (`envFrom`)

La app recibe su configuración con `envFrom`, no variable por variable:

- ConfigMap `config.configMapName` (por defecto `ticket-system-config`): valores
  no sensibles (`AWS_REGION`, `LOG_LEVEL`, `APP_ENV`, …).
- Secret `config.secretName` (por defecto `ticket-system-secrets`): valores
  sensibles (password de DB, JWT de servicio, …).

Ambos deben existir en el namespace antes del despliegue (los provisiona la
infra / Secrets Manager). El chart **no** los crea.

## Uso

```bash
# Validación estática
helm lint deploy/charts/api -f deploy/charts/api/values-dev.yaml
helm template api deploy/charts/api -f deploy/charts/api/values-dev.yaml

# Dev (1 réplica, sin PDB)
helm upgrade --install api deploy/charts/api \
  -n ticket-system --create-namespace \
  -f deploy/charts/api/values-dev.yaml \
  --set image.repository=<account_id>.dkr.ecr.us-east-1.amazonaws.com/ticket-system-api \
  --set serviceAccount.roleArn=arn:aws:iam::<account_id>:role/<cluster>-app

# Prod (2 réplicas, PDB, anti-afinidad por nodo)
helm upgrade --install api deploy/charts/api \
  -n ticket-system \
  -f deploy/charts/api/values-prod.yaml \
  --set image.repository=<account_id>.dkr.ecr.us-east-1.amazonaws.com/ticket-system-api \
  --set serviceAccount.roleArn=arn:aws:iam::<account_id>:role/<cluster>-app
```

## Valores por entorno

| Valor | `values-dev.yaml` | `values-prod.yaml` |
|---|---|---|
| `replicaCount` | 1 | 2 |
| `autoscaling.minReplicas` / `maxReplicas` | 1 / 2 | 2 / 3 |
| `podDisruptionBudget.enabled` | `false` | `true` |
| `affinity` | — | anti-afinidad por `hostname` |
| recursos | austeros | base |
