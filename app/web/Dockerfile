# ============================================================
# Ticket System Web — Dockerfile multi-stage
# ============================================================
# Stage 1: builder  — node:20-slim, instala deps y compila la SPA (Vite)
# Stage 2: runtime  — nginx-unprivileged:1.27-alpine, sirve el build estático
#
# VITE_API_URL="" (vacío) → llamadas relativas /v1/... → same-origin con el ALB
# que enruta /v1 al API y / al web. Sin CORS, sin mixed-content.
# Puerto expuesto: 8080 (nginx-unprivileged corre como no-root).
# ============================================================

# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copiar manifiestos primero para aprovechar el layer cache de npm ci
COPY package.json package-lock.json* ./

RUN npm ci --prefer-offline

# ARG/ENV VITE_API_URL bake la URL del API en el bundle en tiempo de build.
# Valor vacío ("") → apiUrl() produce /v1/... relativo → mismo origen que el ALB.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

# Copiar el resto del código fuente (node_modules excluido por .dockerignore)
COPY . .

# Genera el bundle en dist/ (tsc --noEmit && vite build)
RUN npm run build


# ── Stage 2: runtime ──────────────────────────────────────────────────────────
# nginxinc/nginx-unprivileged:
#   - usuario no-root (nginx, uid 101), listo para EKS sin privilegios
#   - escucha en el puerto 8080 por defecto
#   - imagen Alpine (<30 MB comprimida)
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# Sobreescribir el server block por defecto con uno que incluya:
#   - SPA fallback a index.html (React Router client-side routing)
#   - /healthz sin logs (para el ALB target group health check)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar el build de Vite al directorio que sirve nginx
COPY --from=builder /app/dist/ /usr/share/nginx/html/

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
