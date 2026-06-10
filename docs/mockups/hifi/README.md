# Mockups Hi-Fi — Sistema de Tickets e Incidentes (Entrega #4)

Versión de alta fidelidad de los [8 mockups low-fi de E1](../README.md), generada con el **MCP de Stitch** (Google) partiendo de los wireframes originales. Sirvieron como referencia visual para la implementación real del frontend (`app/web`, PRs #41–#48).

- **Proyecto Stitch:** `Ticket System — Frontend Hi-Fi (E4) v2` — `projectId: 9105126066909741175` (design system "SRE/Ops Precision": Inter, acento indigo-600, paleta slate, severidad crítica=rojo / alta=naranja / media=ámbar / baja=gris).
- Cada pantalla incluye el thumbnail PNG y el HTML+Tailwind exportado por Stitch.
- El look final implementado en `app/web` puede diferir en detalles: el contrato del API manda sobre el mockup (p. ej., sin filtro por categoría, asignación solo "Asignarme" — ver desviaciones documentadas en los PRs).

| # | Pantalla | Caso de uso | Archivos |
|---|---|---|---|
| 1 | Login | RBAC transversal | `01_login.{png,html}` |
| 2 | Cola de tickets | CU-02, CU-06 | `02_cola.{png,html}` |
| 3 | Crear incidente | CU-01 | `03_crear_incidente.{png,html}` |
| 4 | Crear solicitud | CU-08 | `04_crear_solicitud.{png,html}` |
| 5 | Detalle + resolución | CU-03 | `05_detalle_resolucion.{png,html}` |
| 6 | Historial | CU-05 | `06_historial.{png,html}` |
| 7 | Escalados SLA | CU-04 | `07_escalamiento.{png,html}` |
| 8 | Reportes | CU-07 | `08_reportes.{png,html}` |
