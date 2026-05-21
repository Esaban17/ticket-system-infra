# 04 · EKS Track — Entrar o saltar

## Contexto

El Delivery 2 incluye un criterio opcional **EKS Cluster** (sección 3.5) valorado en **40 pts adicionales** sobre los 100 base. Provisionar EKS implica: cluster + ≥1 managed node group + outputs de `endpoint`, `cluster_ca_data` y `cluster_name` + screenshot de `kubectl get nodes` con ≥1 nodo en estado `Ready`.

El equipo ya declaró el EKS Track en `infra/README.md:145` durante D1 y dejó manifests stub en `k8/` (namespace, deployment, service, configmap) para el API del sistema.

## Opciones consideradas

| Opción | Pros | Contras |
|---|---|---|
| **Sí — EKS con default VPC como placeholder** | +40 pts. Alinea con D1 declarado. El PDF explícitamente permite "placeholder VPC at this stage if networking is not yet provisioned". Saca de la cola el trabajo más pesado de la entrega. | Costo del cluster: ~$0.10/hr de control plane ≈ $73/mes. Hay que destruir al final del curso. |
| Sí — EKS con VPC propia (adelantar D3) | Limpia, sin deuda técnica. | D3 todavía no llega; provisionar VPC ahora mezcla scope de entregas. Si el diseño de D3 cambia, hay que rehacer. |
| No — saltar EKS Track | Cero costo. Foco en los 100 pts base. | Pierde 40 pts. Contradice D1 README. Habría que **borrar** la declaración del Track y refactorear `k8/`. |

## Criterios

1. **Puntos disponibles.** 40 sobre 100 base es 40% — material.
2. **Costo en cuenta de estudiante.** EKS control plane no es free tier. ~$2.40 USD/día. Para el cronograma del curso (8 semanas) y haciendo `destroy` después de demos, el costo total esperado es ≤$30 USD.
3. **Coherencia con declaración previa.** D1 ya comprometió EKS Track.
4. **Riesgo técnico.** `terraform-aws-modules/eks ~> 20.0` es comunitario maduro; setup conocido.
5. **Scope creep hacia D3.** Crear una VPC propia ahora mezcla deliverables.

## Decisión

**Sí, entrar al EKS Track con default VPC como placeholder.** Provisionar mediante `terraform-aws-modules/eks v20`, 1 managed node group `t3.medium` (min=1, max=2, desired=1).

## Consecuencias

✅ **Positivas**
- +40 pts directos si la evidencia (`kubectl get nodes` screenshot con `Ready`) queda correcta.
- `cluster_endpoint`, `cluster_certificate_authority_data`, `cluster_name` quedan expuestos como outputs para que D5 genere kubeconfig sin tocar consola.
- Los manifests de `k8/` (deployment, service) pueden aplicarse después del `kubectl` y validar el flujo completo en D3.

⚠️ **Negativas / mitigaciones**
- **Costo:** Recordatorio en `infra/README.md` y `delivery-2-summary.md` de correr `terraform destroy` después de la entrega. ~$2.40/día x el periodo entre entregas activas.
- **VPC placeholder:** Documentado en `infra/README.md` como deuda técnica explícita: "EKS placed on default VPC subnets as placeholder; Delivery 3 will provision a dedicated VPC and `terraform apply` will re-create node groups in the new subnets."
- **Node group sizing:** desired=1, max=2 — suficiente para 2 deployments stub. Si la demo de D3 requiere más, subir `node_max_size` y re-aplicar (zero-downtime).
