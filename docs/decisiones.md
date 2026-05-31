# Registro de decisiones de arquitectura

---

## D-001 — Stack de la API REST: Node + NestJS + Prisma

**Fecha:** 2026-05-27
**Estado:** Aceptado
**Owners:** Estuardo Sabán, Luis André (BL-001)

### Contexto

El equipo evaluó dos alternativas para el backend del sistema de tickets:

| Opción | Lenguaje | Framework | ORM | Runtime |
|---|---|---|---|---|
| A | Python 3.12 | FastAPI | SQLAlchemy / SQLModel | Lambda o ECS |
| **B (elegida)** | **Node 20 LTS** | **NestJS 10** | **Prisma** | **EKS** |

### Criterios de decisión

1. **Curva del equipo.** Ambos integrantes tienen mayor experiencia previa con
   TypeScript/Node que con Python para servicios web. Reducir la curva de
   aprendizaje acelera las entregas D3-D5.

2. **Ecosistema NestJS + Prisma.** NestJS aporta estructura opinada (módulos,
   guards, interceptors, pipes) que encaja directamente con los requerimientos
   del sistema de tickets: RBAC granular, filtros de excepción globales, y
   separación clara en capas (controller → service → repository). Prisma
   genera un cliente tipado desde el schema, eliminando errores de
   discrepancia entre modelo y BD en tiempo de compilación.

3. **Soporte TypeScript para workers Lambda.** Los workers asíncronos (BL-SQS,
   notificaciones, escalamiento SLA) se desplegaron en Lambda con Python como
   placeholder (D2). Si en D4 se migraran a Node, compartirían tipos con la
   API sin conversión. La opción B mantiene la posibilidad abierta.

4. **Integración con EKS Track.** El track opcional EKS (+40 pts) requiere
   una imagen OCI. NestJS compila a `dist/main.js` con un Dockerfile
   multi-stage limpio; el binario resultante no requiere runtime especial
   más allá de Node.

5. **Herramientas de calidad.** El generador de NestJS CLI incluye ESLint +
   Prettier preconfigurados. Husky y lint-staged se agregan con una línea,
   cerrando el requerimiento de linter en CI del BL-001.

### Trade-offs aceptados

- **Verbosidad de NestJS vs FastAPI.** NestJS requiere más boilerplate
  (decoradores, módulos explícitos). Se acepta porque el sistema de tickets
  tiene dominio complejo (estados, SLA, RBAC) donde la estructura paga
  dividendos a medida que crece.

- **Memoria de Node vs Python.** Node 20 consume ~20-30 MB más en idle que
  FastAPI con uvicorn. Irrelevante a escala de curso; en producción se
  compensa con el autoescalado de EKS.

- **Workers Lambda en Python.** El worker Lambda del D2 permanece en Python
  (`index.py` placeholder). Si en D4 se implementa la lógica real, el equipo
  evaluará si migrar a Node o mantener Python para esa pieza. La interfaz
  (SQS events + env vars) es agnóstica al lenguaje.

---

## D-002 — Imagen base del contenedor: node:20-slim en lugar de distroless

**Fecha:** 2026-05-27
**Estado:** Aceptado
**Owner:** Estuardo (BL-004)

### Contexto

El Dockerfile multi-stage evalúa dos imágenes base para el stage runtime:

| Opción | Imagen | Tamaño base | Consideraciones |
|---|---|---|---|
| A | `gcr.io/distroless/nodejs20-debian12` | ~60 MB | Sin shell, mínima superficie de ataque |
| **B (elegida)** | **`node:20-slim`** | ~80 MB | Incluye glibc y openssl nativos |

### Razón

Prisma Client genera binarios nativos que requieren `openssl` y `glibc` en
runtime. La imagen distroless de Node no incluye `openssl` y requiere copiar
las librerías compartidas manualmente, lo que añade complejidad sin beneficio
neto para un entorno de curso.

`node:20-slim` (Debian Bookworm slim) incluye estos prerequisitos y la
imagen final con solo prod deps queda por debajo de 300 MB. El contenedor
corre como UID 1001 (`nonroot`) creado explícitamente, manteniendo el
requerimiento de no-root.

### Trade-offs aceptados

- Superficie ligeramente mayor vs distroless. Mitigada con `apt-get` solo
  de `openssl` y eliminación de listas de paquetes en el mismo `RUN`.

---

## D-003 — Manejo de ambientes en AWS: prod en código, solo dev se aprovisiona

**Fecha:** 2026-05-27
**Estado:** Aceptado
**Owner:** Estuardo Sabán

### Contexto

El repositorio quedó estructurado desde E2 con dos ambientes Terraform:
`infra/envs/dev/` e `infra/envs/prod/`, cada uno con su propio `*.tfvars` y
diferencias de capacidad (multi-AZ, instance class, tamaño del node group).

Al planear el roadmap de D3/D4/D5 se evaluó si valía la pena aprovisionar
ambos ambientes en AWS o mantener solo uno. La rúbrica del curso (E1..E5,
Mid Course) **no exige** dos ambientes; lo que se evalúa es la cobertura de
componentes (Red, Asíncrono, Seguridad, etc.), no la promoción dev → prod.

### Opciones evaluadas

| Opción | Aprovisiona dev | Aprovisiona prod | Costo adicional/mes | Trabajo duplicado |
|---|---|---|---|---|
| A | ✅ | ❌ (borrar `envs/prod/`) | $0 | No |
| **B (elegida)** | **✅** | **❌ (mantener código, no aplicar)** | **$0** | **No** |
| C | ✅ | ✅ | ~$200+ | Sí |

### Decisión

**Opción B**: se mantiene `infra/envs/prod/` como código de referencia, pero
**solo `dev` se aprovisiona en AWS** durante el curso. La configuración de
`prod` queda como ejercicio documental de cómo se promovería el sistema a
producción real (multi-AZ, node group más grande, etc.).

### Razones

1. **La rúbrica no lo pide.** Los componentes del curso se evalúan sobre la
   arquitectura desplegada, no sobre tener dos aprovisionamientos paralelos.
2. **Costo prohibitivo para equipo de 2 personas y proyecto académico
   corto:** un EKS adicional ($73/mes), RDS multi-AZ ($60), NAT extra ($33),
   ALB ($22), VPC endpoints ($35) suman >$200 mensuales que no aportan al
   aprendizaje evaluado.
3. **Preserva el patrón:** mantener el código de `prod` permite demostrar
   en la defensa final que el repo está diseñado para multi-ambiente. En
   D5 se mostrará `terraform plan` contra `prod.tfvars` (sin apply) y un
   workflow gateado `tf-apply-prod.yml` con `required reviewers`, que
   evidencia el patrón de promoción sin ejecutarlo.
4. **Si se necesita segregación adicional para la demo**, se usarán
   **namespaces de Kubernetes** (`ticket-system-dev` y `ticket-system-stg`)
   dentro del mismo cluster. Es gratis y muestra segregación lógica.

### Trade-offs aceptados

- `envs/prod/` no será verificado end-to-end contra AWS hasta una fase
  posterior al curso. Riesgo: drift entre el código de prod y la realidad
  de AWS. Mitigación: `terraform validate` y `terraform test` siguen
  corriendo en CI para `prod`, garantizando que el código sigue siendo
  sintácticamente y semánticamente válido aunque no se aplique.
- El workflow `tf-apply-prod.yml` (BL-201, propuesto) queda como skeleton
  documental: existirá pero nunca se ejecutará durante el curso.

### Implicaciones para el backlog

- **BL-110 (migración a VPC dedicada):** aplica solo a `dev`. El runbook
  `docs/runbooks/migracion-vpc.md` ya está alineado con esta decisión.
- **CI/CD (`terraform-ci.yml`):** ya hace `plan` solo contra `dev.tfvars`.
  No requiere cambios.
- **Workflows futuros que toquen prod (BL-135, BL-201):** se mantienen como
  scaffolding documental con `workflow_dispatch` y `required reviewers`,
  pero nunca se ejecutan durante el ciclo del curso.
- **`infra/envs/prod/README.md`** se agrega con un banner que aclara el
  estado para evitar confusión futura.

---

## D-004 — Diseño de la capa de red (E3)

**Fecha:** 2026-05-31
**Estado:** Aceptado
**Owner:** Estuardo (BL-107, BL-108, BL-109, BL-110)

### Contexto

Entrega 3 del curso exige diseñar la capa de red sobre el cómputo
(EKS + Lambda) y los datos (RDS + S3) ya decididos en E2. El módulo
`infra/modules/network/` ya estaba implementado en el curso paralelo
de Automatización con IaC (PRs #6 y #7). D-004 documenta formalmente
las cuatro decisiones que ese módulo materializa y que E2 había
dejado como preguntas abiertas (ver `preguntas-abiertas.md`
Q-NET-1..4).

### Decisiones

| # | Tema | Elección |
|---|---|---|
| 1 | CIDR de la VPC | `10.20.0.0/16` |
| 2 | Número de AZs | 2 (`us-east-1a`, `us-east-1b`) |
| 3 | Conectividad saliente | Híbrido — 1 NAT Gateway + 5 VPC endpoints (S3 gateway + ecr.api + ecr.dkr + secretsmanager + logs + sqs) |
| 4 | Exposición de pods EKS | Pods en subnets privadas, ALB Ingress en subnets públicas |

### Razones (resumen)

1. **VPC dedicada (no default).** Permite segmentación pub/priv,
   tagging para el ALB controller, y placement controlado de RDS y
   Lambda. La default VPC del Delivery 2 era un placeholder.
2. **`10.20.0.0/16`** evita colisión con la default VPC y con los
   rangos comunes `10.0/10.1`. Deja headroom para más VPCs si se
   crece.
3. **2 AZs por costo proporcional.** RDS multi-AZ y EKS exigen ≥2.
   La tercera AZ duplicaría costo de subnets/endpoints/NAT sin
   mejora medible de disponibilidad para el volumen del sistema.
4. **Híbrido NAT + endpoints** es la combinación más barata que
   cubre tanto tráfico AWS frecuente (endpoints) como egress
   general (NAT). El S3 gateway endpoint absorbe el flujo más
   pesado (adjuntos) sin costo. Los 4 endpoints diferidos (`kms`,
   `sts`, `ssm`, `events`) se evaluarán en E5.
5. **Pods privados + ALB Ingress** da dos capas de defensa, TLS
   centralizado y aprovecha los tags que el módulo ya configura
   en las subnets.

### Trade-offs aceptados

- **NAT single-AZ no es HA.** Si `us-east-1a` cae, las subnets
  privadas pierden egress general (los endpoints siguen funcionando
  porque tienen ENI por AZ). Aceptable en ciclo académico; el
  módulo deja documentada la migración a per-AZ con `count = local.az_count`
  en `infra/modules/network/gateways.tf:1-15`.
- **5 endpoints fijos × 2 AZ ≈ $73/mes** aunque el sistema esté
  ocioso. Es el precio de no depender del NAT para el tráfico AWS
  crítico.
- **No hay VPC Flow Logs en E3.** Diferido a E5 — Seguridad /
  Observabilidad. Reduce trazabilidad de red en el intervalo.
- **Sin tercer tier de subnets para BD.** Con 2 tiers y SGs por
  capa (BL-113, en D4) la segmentación es suficiente. El offset
  `+10` deja headroom (`10.20.20.0/24`) si E5 exigiera aislar RDS
  en subnets propias.

### Referencias

- `docs/TicketSystem.md` §5 — diseño detallado (versión Entrega 3)
- `docs/trade-offs/06-network.md` — tablas de costo y alternativas
- `docs/runbooks/migracion-vpc.md` — runbook de migración default
  VPC → dedicada para `dev`
- `infra/modules/network/{variables,vpc,gateways,endpoints,main,outputs}.tf`
  — implementación
