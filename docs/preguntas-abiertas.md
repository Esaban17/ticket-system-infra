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
