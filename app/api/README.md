# Ticket System — API

API REST del sistema de tickets. Stack: **Node 20 LTS + NestJS 10 + Prisma + PostgreSQL**.

## Arranque local

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno y completar los valores
cp .env.example .env
# Editar .env con DATABASE_URL, JWT_SECRET, etc.

# 3. Generar cliente Prisma
npm run prisma:generate

# 4. Aplicar migraciones (requiere Postgres corriendo)
npm run prisma:migrate:dev

# 5. Arrancar en modo desarrollo (hot-reload)
npm run start:dev
```

La API queda disponible en `http://localhost:8080`.

## Variables de entorno

Ver `.env.example` para la lista completa con descripciones.
Variables mínimas para arrancar:

| Variable | Descripción |
|---|---|
| `PORT` | Puerto HTTP (default `8080`) |
| `DATABASE_URL` | URL de conexión a PostgreSQL |
| `JWT_SECRET` | Secreto para firmar tokens (min 32 chars) |

## Comandos clave

| Comando | Descripción |
|---|---|
| `npm run start:dev` | Desarrollo con hot-reload |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm run start:prod` | Arrancar build de producción |
| `npm run lint` | ESLint con autofix |
| `npm run format` | Prettier |
| `npm test` | Unit tests (Jest) |
| `npm run test:e2e` | Tests end-to-end |
| `npm run prisma:generate` | Regenerar cliente Prisma |
| `npm run prisma:migrate:dev` | Crear y aplicar migración (dev) |
| `npm run prisma:migrate:deploy` | Aplicar migraciones en producción |

## Versionado de API

Todos los endpoints de **negocio** se montan bajo el prefijo `/v1/`:

```
POST   /v1/tickets
GET    /v1/tickets/:id
PATCH  /v1/tickets/:id/status
...
```

Los endpoints de salud quedan **fuera del prefijo** para que el ALB y los
probes de Kubernetes los alcancen sin configuración extra:

```
GET /healthz   — liveness probe (implementado por Luis André, BL-002)
GET /readyz    — readiness probe (implementado por Luis André, BL-002)
```

## Docker

```bash
# Build
docker build -t ticket-api:local .

# Ejecutar (config por env vars, sin .env en la imagen)
docker run --rm \
  -e DATABASE_URL="postgresql://user:pass@host:5432/tickets" \
  -e JWT_SECRET="cambia-esto-por-un-secreto-de-32-chars" \
  -p 8080:8080 \
  ticket-api:local
```

## Estructura de carpetas

```
src/
  config/          — Carga y validación de env vars (Zod)
  common/
    filters/       — HttpExceptionFilter (Problem Details RFC 9457)
    interceptors/  — LoggingInterceptor
    decorators/    — @Public(), @CurrentUser(), @Roles() (pendientes BL-006)
  modules/         — Módulos de negocio (tickets, users, auth, sla, ...)
main.ts            — Bootstrap, prefijo /v1, CORS, ValidationPipe
app.module.ts      — Módulo raíz
```
