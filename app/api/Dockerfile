# ============================================================
# Ticket System API — Dockerfile multi-stage
# ============================================================
# Stage 1: builder   — node:20-slim, instala deps + compila TS
# Stage 2: runtime   — node:20-slim, solo artefactos productivos
#
# Imagen final objetivo: < 300 MB
# Usuario no-root: UID 1001 (nonroot)
# Puerto expuesto: 8080
# Config: 100% por variables de entorno — NO se copian archivos .env
# ============================================================

# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

# Instala openssl (requerido por Prisma para generar el cliente nativo)
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar manifiestos primero para aprovechar el layer cache de Docker
COPY package.json package-lock.json* ./
COPY prisma/ ./prisma/

# Instalar TODAS las deps (incluyendo devDeps para la compilación)
RUN npm ci --prefer-offline

# Generar el cliente Prisma antes de compilar
RUN npx prisma generate

# Copiar el código fuente y compilar
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src/ ./src/

RUN npm run build

# Eliminar devDependencies para el stage runtime
# npm ci --omit=dev reinstala solo las deps de producción limpiamente
RUN npm ci --omit=dev --prefer-offline


# ── Stage 2: runtime ──────────────────────────────────────────────────────────
# node:20-slim elegido sobre distroless porque:
#   1. Prisma client requiere openssl y glibc nativos — distroless/nodejs no los incluye.
#   2. node:20-slim (Debian Bookworm slim) cabe en < 300 MB con solo prod deps.
#   3. Permite instalar openssl en un solo apt-get sin cambiar la imagen base.
# Referencia: docs/decisiones.md, sección BL-004.
FROM node:20-slim AS runtime

# Instalar openssl para el runtime de Prisma
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Crear usuario no-root con UID 1001
RUN groupadd --gid 1001 nonroot && \
    useradd --uid 1001 --gid 1001 --no-create-home --shell /bin/false nonroot

# Copiar artefactos del stage builder
COPY --from=builder --chown=nonroot:nonroot /app/dist/          ./dist/
COPY --from=builder --chown=nonroot:nonroot /app/node_modules/  ./node_modules/
COPY --from=builder --chown=nonroot:nonroot /app/prisma/        ./prisma/
COPY --from=builder --chown=nonroot:nonroot /app/package.json   ./package.json

# Cambiar al usuario no-root
USER nonroot

# Exponer el puerto de la API
EXPOSE 8080

# Healthcheck embebido — el ALB también puede usar /healthz directamente,
# pero este healthcheck permite que `docker ps` muestre el estado del contenedor.
# Luis André implementará el endpoint /healthz en BL-002.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/healthz', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Punto de entrada
CMD ["dist/main.js"]
