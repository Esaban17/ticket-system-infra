# Preguntas abiertas del proyecto

---

## Q3 — Versionado de la API: ¿prefijo de path o header?

**Estado:** CERRADA — 2026-05-27
**Owner:** Estuardo (BL-003)

### Decisión

Se usa **versionado por prefijo de path `/v1/`** para todos los endpoints
de negocio. Los endpoints de salud (`/healthz`, `/readyz`) quedan fuera
del prefijo.

### Rationale

1. **Operabilidad en ALB y CloudFront.** Las reglas de enrutamiento del
   Application Load Balancer y las distribuciones de CloudFront trabajan
   con path patterns (`/v1/*`). Agregar una versión como header custom
   (`X-API-Version: 1`) requiere configurar reglas basadas en cabeceras,
   que son más frágiles y menos legibles en la consola de AWS.

2. **Depuración en logs.** El path completo (`/v1/tickets/123`) aparece
   en los access logs del ALB y en CloudWatch sin configuración extra.
   Un header de versión requeriría configuración adicional para que quede
   registrado.

3. **Sin fricción para los clientes.** Los consumidores de la API (frontend
   SPA, apps móviles, integraciones externas) construyen URLs directas;
   no necesitan gestionar headers custom. Cambiar de `v1` a `v2` en una
   ruta es trivial y visible en la URL del navegador.

### Implementación

`main.ts` configura:

```typescript
app.setGlobalPrefix('v1', {
  exclude: ['/healthz', '/readyz'],
});
```

Los probes de liveness y readiness del ALB/Kubernetes apuntan a
`/healthz` y `/readyz` directamente (sin prefijo). Esto evita que una
reconfiguración de versión rompa los health checks.

---

## Q-NET-1 — CIDR de la VPC dedicada

**Estado:** CERRADA — 2026-05-31
**Owner:** Estuardo (BL-107)

### Decisión

VPC con CIDR primario **`10.20.0.0/16`** (65 536 IPs). Subnets `/24` por
tier por AZ, con offset `+10` entre tier público y privado para dejar
headroom a un tercer tier.

### Rationale

Resumido aquí; detalle completo en `docs/TicketSystem.md` §5.1 y
`docs/trade-offs/06-network.md`.

1. RFC1918 y sin colisión con la default VPC (`172.31.0.0/16`).
2. El offset `10.20` evita los rangos comunes `10.0.0.0/16` y
   `10.1.0.0/16` que suelen estar tomados en cuentas compartidas.
3. Permite agregar VPCs adicionales en `10.21+` sin renumerar.

### Implementación

`infra/modules/network/variables.tf:18` (default `10.20.0.0/16`).
Validado en CIDR-host (`variables.tf:20-23`).

---

## Q-NET-2 — Número de Availability Zones

**Estado:** CERRADA — 2026-05-31
**Owner:** Estuardo (BL-107)

### Decisión

**2 AZs**: `us-east-1a` y `us-east-1b`. El módulo valida `≥2` (no fija
`= 2`), de modo que escalar a 3 AZs en el futuro es cambiar el `.tfvars`
sin tocar el código del módulo.

### Rationale

1. Mínimo requerido por RDS multi-AZ y EKS managed node group.
2. La tercera AZ no se justifica para el sistema (50–200 ingenieros,
   ~200 tickets concurrentes): duplica costo de NAT/endpoints sin
   mejora medible de disponibilidad (99.99% → 99.999%).

### Implementación

`infra/modules/network/variables.tf:29-35` (default + validación).

---

## Q-NET-3 — NAT Gateway vs VPC endpoints

**Estado:** CERRADA — 2026-05-31
**Owner:** Estuardo (BL-108, BL-109)

### Decisión

**Híbrido**: 1 NAT Gateway single-AZ + 5 VPC endpoints (1 gateway S3 +
4 interface: `ecr.api`, `ecr.dkr`, `secretsmanager`, `logs`, `sqs`).

### Rationale

1. El tráfico AWS de alta frecuencia (ECR pulls, logs, secrets, SQS,
   S3) va por endpoints para no consumir egress de NAT.
2. El NAT cubre el egress general (DNS público, dependencias
   transitorias, paquetes del SO) sin tener que provisionar un endpoint
   específico para cada servicio.
3. NAT single-AZ acepta el trade-off de no-HA por costo (~$33/mes vs
   ~$66/mes per-AZ). Migración a per-AZ documentada en
   `infra/modules/network/gateways.tf:1-15`.

### Endpoints diferidos a E5

`kms`, `sts`, `ssm`, `events` — sin uso concreto en E3, se evaluarán
junto con la decisión de Secrets Manager/Parameter Store e IRSA en E5.

### Implementación

`infra/modules/network/endpoints.tf` (5 endpoints + SG compartido) y
`gateways.tf` (NAT + IGW + rutas).

---

## Q-NET-4 — Exposición de los pods de EKS

**Estado:** CERRADA — 2026-05-31
**Owner:** Estuardo (BL-110, BL-111-BL-113 en D4)

### Decisión

Pods de EKS en **subnets privadas**, expuestos al exterior únicamente
vía **ALB Ingress** en subnets públicas (gestionado por el AWS Load
Balancer Controller). No se usa NodePort público.

### Rationale

1. Dos capas de defensa (SG del ALB + SG de los nodos) en lugar de
   confiar solo en el SG del nodo.
2. TLS centralizado en el ALB (ACM cert), los pods reciben HTTP en
   target group privado.
3. Subnets ya tagueadas para el ALB controller:
   `kubernetes.io/role/elb=1` en públicas,
   `kubernetes.io/role/internal-elb=1` en privadas.

### Pendiente de implementación

Helm release del Load Balancer Controller, Ingress YAML, certificado
ACM y redirect HTTP→HTTPS. Items BL-111, BL-112, BL-113 en
`docs/backlog.md` épica EP-09, scoped para D4.

---

## Q9 — Cerrada

**Estado:** CERRADA — 2026-06-09
**Owner:** Estuardo (BL-130 infra · BL-040 lado API)
**ADR:** `docs/adrs/0009-auth-worker-api.md`

### Decisión

La identidad del worker hacia la API se prueba con un **service JWT asimétrico
(RS256)**. El worker (Lambda) firma un JWT corto con una **clave privada RSA-2048**
que lee de Secrets Manager (`ticket-system/${env}/worker-jwt-private`); la API lo
verifica con la **clave pública** (`ticket-system/${env}/worker-jwt-public`) en un
guard dedicado (`ServiceTokenGuard`) montado sobre `/internal/v1/*`.

Se eligió sobre **IAM SigV4** porque el borde del sistema es **ALB Ingress, no
API Gateway** (Q-NET-4): SigV4 no es nativo en ALB+EKS y exigiría anteponer API
Gateway o un verificador casero. Se descartó que el worker escribiera directo en
RDS porque rompe la política de "API como única puerta de escritura" y salta la
lógica de dominio (estados, RBAC, optimistic locking de Q8).

### Rationale (resumen)

1. **Coherente con la topología ya mergeada** — el token entra por el ALB como
   `Authorization: Bearer`, sin componentes nuevos.
2. **Asimetría / mínimo privilegio** — la API solo lee la clave pública y no puede
   falsificar tokens; el worker solo lee la privada (separación por IAM en BL-131).
3. **Verificación idiomática y testeable** — guard de NestJS que valida firma
   RS256 + `iss=ticket-system-worker` + `aud=ticket-system-api` + `exp` ≤ 5 min.

### Trade-off aceptado

**Rotación manual cada 90 días** (SigV4 la daría gratis con STS), mitigada con
runbook (`docs/runbooks/rotar-worker-jwt.md`, BL-131) y aceptación de dos claves
públicas durante la ventana de rotación. Detalle, claims y pseudo-código del
verificador en `docs/adrs/0009-auth-worker-api.md`.

---
