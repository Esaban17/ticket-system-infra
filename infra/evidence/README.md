# Evidence — Delivery 2

Esta carpeta contiene los 3 artefactos de evidencia que pide el rubric del Delivery 2.

## 1. `compute-deployed.txt`

Output de `aws lambda get-function` confirmando que la Lambda está aplicada y en estado `Active`.

**Cómo generarlo después de `terraform apply`:**

```bash
aws lambda get-function \
  --function-name ticket-system-dev-worker \
  --query '{FunctionArn:Configuration.FunctionArn,State:Configuration.State}' \
  > infra/evidence/compute-deployed.txt
```

## 2. `state-lock-contention.png`

Screenshot que demuestra que el lock distribuido de DynamoDB rechaza un `apply` concurrente.

**Cómo capturarlo:**

1. Abrir dos terminales en `infra/`.
2. **Terminal 1**: `terraform apply -var-file=envs/dev/dev.tfvars`
3. Mientras esté corriendo, en **Terminal 2**: `terraform apply -var-file=envs/dev/dev.tfvars`
4. Terminal 2 debe fallar con `Error: Error acquiring the state lock` (DynamoDB lock id ya tomado).
5. Hacer captura de pantalla del error en Terminal 2 → guardar como `infra/evidence/state-lock-contention.png`.

## 3. `eks-nodes.png`

Screenshot de `kubectl get nodes -o wide` mostrando ≥1 nodo en estado `Ready`.

**Cómo capturarlo:**

```bash
# 1. Update kubeconfig (después de terraform apply)
aws eks update-kubeconfig --region us-east-1 --name ticket-system-dev-eks

# 2. Verificar nodos
kubectl get nodes -o wide
```

Tomar captura del output donde se vea al menos un nodo con `STATUS Ready` → guardar como `infra/evidence/eks-nodes.png`.

## Renderizado en infra/README.md

Después de generar los tres archivos, verificar que `infra/README.md` los renderice bajo la sección `## Evidence` (esto ya está hecho como placeholder — los archivos deben existir en el commit del tag `oyd-delivery-2`).

---

# Evidence — Delivery 3 (Networking Layer)

Los artefactos de texto se generan automáticamente con
[`capture-delivery-3.sh`](./capture-delivery-3.sh) (correr desde `infra/`
después de `terraform apply`):

```bash
export TF_VAR_db_password=...        # mismo valor usado en el apply
cd infra/ && ./evidence/capture-delivery-3.sh
```

Genera: `network-foundation.txt` (A), `security-groups-plan.txt` (B),
`ingress-curl.txt` (C), `e2e-get.txt` + `e2e-post.txt` (D), `eks-nodes-d3.txt` (F).

Screenshots a capturar manualmente (el script imprime qué debe mostrar cada uno):
`security-groups.png`, `ingress-healthy.png`, `e2e-storage.png`, `ci-plan.png`,
`eks-nodes-d3.png`. Todos se renderizan en `infra/README.md` bajo
`## Evidence — Delivery 3` y deben existir en el commit del tag `oyd-delivery-3`.
