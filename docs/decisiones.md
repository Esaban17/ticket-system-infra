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
