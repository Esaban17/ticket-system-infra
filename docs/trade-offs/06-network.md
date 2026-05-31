# 06 · Red — VPC, AZs, NAT vs VPC endpoints, exposición de pods

## Contexto

Delivery 3 (E3) exige diseñar la capa de red sobre el cómputo (EKS + Lambda) y los datos (RDS + S3) decididos en E2. El módulo `infra/modules/network/` ya estaba implementado en el curso paralelo de Automatización con IaC (BL-107..110, PRs #6 y #7). E3 documenta las cuatro decisiones que ese módulo materializa y que E2 había dejado como preguntas abiertas:

1. CIDR de la VPC dedicada.
2. Número de Availability Zones.
3. Estrategia de conectividad saliente (NAT vs VPC endpoints).
4. Dónde viven los pods de EKS y cómo se exponen.

## Opciones consideradas

### 1. CIDR

| Opción | Rango | Riesgo de colisión | Headroom |
|---|---|---|---|
| A | `10.0.0.0/16` | Alto en cuentas con VPCs heredadas | Sí, `10.x.x.x` permite hasta 256 VPCs `/16` adyacentes |
| **B (elegida)** | **`10.20.0.0/16`** | **Bajo** — offset evita los rangos comunes 10.0/10.1 | **Sí, mismo `10.x.x.x` que A** |
| C | `192.168.0.0/16` | Conflicto con VPN de oficina si se conecta | Bajo — colisiona con redes domésticas/SOHO |
| D | `172.31.0.0/16` | Conflicto directo con la default VPC | N/A |

### 2. Availability Zones

| Opción | AZs | Costo extra de subir 1 | HA real medida |
|---|---|---|---|
| A | 1 AZ | — | No — RDS y EKS exigen ≥2 |
| **B (elegida)** | **2 AZs** | — | **99.99% (documentado por AWS, suficiente)** |
| C | 3 AZs | +~$58/mes (subnet × 1, endpoints 5×$7.30, NAT si per-AZ +$33) | 99.999% (no medible en este sistema) |

### 3. Conectividad saliente

| Opción | Costo fijo/mes | Costo variable | Cobertura | Riesgo |
|---|---|---|---|---|
| A — Solo NAT | ~$33 single-AZ | $0.045/GB egress | Total (cualquier destino IP) | NAT cuello de botella; ECR pulls y logs cuestan caro en GB |
| B — Solo endpoints | ~$70 (5 × 2 AZ × $7) | $0.01/GB endpoint | Solo AWS — sin DNS público, sin SaaS externos | Cualquier dependencia no-AWS queda sin egress |
| **C (elegida) — Híbrido** | **~$106 (NAT $33 + 5 endpoints $73)** | **Mínimo (gordo va por endpoints)** | **Total** | **Ninguno relevante** |

### 4. Exposición de pods EKS

| Opción | Cómo expone | Capas de defensa | Operación |
|---|---|---|---|
| A — NodePort público | Pods en subnets públicas con IP pública | 1 (SG del nodo) | Manual: SG por puerto |
| B — ClusterIP + bastion | Pods privados, acceso por túnel SSH | N/A para usuarios finales | No sirve para tráfico público |
| **C (elegida) — ALB Ingress** | **Pods privados, ALB en subnets públicas** | **2 (SG del ALB + SG de los nodos)** | **AWS Load Balancer Controller + Ingress YAML** |

## Criterios

1. **Mínima viabilidad técnica.** RDS multi-AZ y EKS exigen ≥2 AZs. NodePort público no termina TLS de forma central.
2. **Defensa en profundidad.** Más de una capa de control para tráfico entrante. SGs por capa.
3. **Costo proporcional al sistema.** El sistema sirve a una empresa de 50–200 ingenieros con ~200 tickets concurrentes. Sobreingeniar HA (3 AZs, NAT per-AZ desde día 1) cuesta más de lo que ahorra.
4. **Reversibilidad.** Cada decisión de hoy permite cambiar de opinión sin renumerar ni recrear: agregar 3ra AZ es una variable, NAT per-AZ es cambiar `count = 1` por `count = local.az_count`, endpoints adicionales son agregar strings a la lista.
5. **Coherencia con el código real ya mergeado.** Las decisiones tienen que reflejar lo que `infra/modules/network/` provisiona, no aspiraciones.

## Decisiones

| # | Decisión | Justificación corta |
|---|---|---|
| 1 | **VPC `10.20.0.0/16`** | RFC1918, evita rangos comunes 10.0/10.1, evita default VPC 172.31, deja `10.21+` libre para crecimiento |
| 2 | **2 AZs (`us-east-1a`, `us-east-1b`)** | Mínimo para RDS multi-AZ y EKS; 99.99% suficiente; 3 AZs cuesta ~50% más sin mejora medible |
| 3 | **NAT single-AZ + 5 VPC endpoints** | S3 gateway gratis absorbe el flujo más pesado; interface endpoints (ECR, Logs, Secrets, SQS) ahorran egress NAT en el tráfico AWS frecuente; NAT cubre el resto |
| 4 | **Pods en subnets privadas + ALB Ingress en subnets públicas** | 2 capas de defensa, TLS centralizado en ALB, tags k8s ya configurados |

## Consecuencias

✅ **Positivas**

- Separación pública/privada explícita, cumple la rúbrica de E3.
- Costo fijo predecible ~$106/mes para la capa de red completa.
- Módulo reusable: dev y prod difieren en cómputo/db pero comparten la VPC.
- Outputs limpios (`vpc_id`, `public_subnet_ids`, `private_subnet_ids`, `nat_eip`, `vpc_endpoint_sg_id`) consumidos por módulos downstream sin acoplamiento.
- 4 preguntas abiertas de E2 cerradas con valores concretos.

⚠️ **Negativas / trade-offs aceptados**

- **NAT single-AZ no es HA.** Si `us-east-1a` cae, las subnets privadas pierden egress general (NAT). Las llamadas via endpoints siguen funcionando porque cada endpoint tiene ENI por AZ. Aceptable en curso académico; migración a per-AZ documentada en `infra/modules/network/gateways.tf:1-15`.
- **5 interface endpoints fijos × 2 AZ ≈ $73/mes** aunque el sistema no esté generando tráfico. Es el costo de no depender del NAT para el tráfico AWS crítico.
- **No hay VPC Flow Logs aún.** Diferido a E5 — Seguridad. Riesgo: menor trazabilidad de incidentes de red mientras tanto.
- **Sin tercer tier de subnets.** Si en E5 la rúbrica exige aislar BD en subnets propias, hay que agregar `10.20.20.0/24` y `10.20.21.0/24` (offset reservado) y mover RDS. Reversible pero no gratis.

## Referencias

- Implementación: `infra/modules/network/{variables,vpc,gateways,endpoints,main,outputs}.tf`
- Runbook de migración default VPC → dedicada: `docs/runbooks/migracion-vpc.md`
- Documento de la entrega: `docs/E3_TicketSystem.md` §5
- Decisión registrada en ADR: `docs/decisiones.md` D-004
