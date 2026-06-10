# Sistema de Tickets — Frontend (app/web)

SPA en Vite + React 18 + TypeScript estricto + Tailwind CSS, en español.

## Requisitos

- Node.js >= 20
- API corriendo en `http://localhost:8080` (ver `app/api`)

## Cómo correr

```bash
cd app/web
npm ci
cp .env.example .env   # opcional, los defaults ya apuntan a localhost
npm run dev            # http://localhost:5173
```

## Scripts

| Script            | Descripción                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Servidor de desarrollo (puerto 5173) |
| `npm run build`   | `tsc --noEmit` + build de producción |
| `npm run lint`    | ESLint                               |
| `npm run preview` | Sirve el build de producción         |

## Variables de entorno

| Variable       | Default                 | Descripción            |
| -------------- | ----------------------- | ---------------------- |
| `VITE_API_URL` | `http://localhost:8080` | URL base del API (v1)  |

## Estructura

- `src/api/` — cliente HTTP tipado (Problem Details → `ApiError`, Bearer token, Idempotency-Key, cursor pagination).
- `src/auth/` — `AuthProvider`, `useAuth()`, guards `RequireAuth` / `RequireRole`. Sesión en localStorage (`ticket-session`).
- `src/components/layout/` — app shell (sidebar con navegación por rol + topbar).
- `src/components/ui/` — Badge (prioridad/severidad/estado), Button, Card, Table densa, Spinner, EmptyState, ErrorBanner.
- `src/pages/<feature>/` — una carpeta por feature (login, queue, create, detail, sla, reports).

## Tests E2E (Playwright)

La suite (`e2e/flujo-tickets.spec.ts`) cubre los 4 casos de uso núcleo contra el stack local real: autenticación (+RBAC), creación de incidente, asignación y resolución con historial.

```bash
# Prerrequisitos: API en :8080 con Postgres migrado y seeds (ver app/api/README.md)
npx playwright install chromium   # primera vez
npm run test:e2e
```

El dev server de Vite se levanta automáticamente si no está corriendo (puerto 5173).
