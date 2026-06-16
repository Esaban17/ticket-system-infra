import { test, expect } from '@playwright/test';
import { login, USUARIOS } from './helpers';

// TE2E-007 — Reportes de resolución y descarga de CSV (CU-07)
// TE2E-004 — Página de escalamiento SLA: interfaz y RBAC (CU-04, adaptado a UI)

test.describe('Reportes de resolución', () => {
  test('E10a — admin visualiza KPIs y descarga el CSV de tickets', async ({
    page,
  }) => {
    await login(page, USUARIOS.admin);
    await page.goto('/reports');

    // Los KPIs se muestran al cargar la página (datos de los últimos 30 días por defecto).
    const kpis = page.getByTestId('reports-kpis');
    await expect(kpis).toBeVisible();

    // Las 4 tarjetas de KPI deben ser visibles:
    // "Tickets resueltos", "Tiempo promedio de resolución", "% dentro de SLA", "Abiertos del período".
    await expect(kpis.getByText('Tickets resueltos')).toBeVisible();
    await expect(kpis.getByText('Tiempo promedio de resolución')).toBeVisible();
    await expect(kpis.getByText('% dentro de SLA')).toBeVisible();
    await expect(kpis.getByText('Abiertos del período')).toBeVisible();

    // Cambiar el filtro de fecha (rango más acotado) y aplicar; los KPIs se recalculan.
    await page.fill('#reports-from', '2026-01-01');
    await page.fill('#reports-to', '2026-12-31');
    await page.click('button[type="submit"]');
    // Los KPIs deben seguir visibles tras el recálculo.
    await expect(kpis).toBeVisible();

    // Descargar el CSV y verificar que el archivo se llama "tickets.csv".
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('reports-download-csv').click(),
    ]);
    expect(download.suggestedFilename()).toBe('tickets.csv');
  });
});

test.describe('Página de escalamiento SLA', () => {
  test('E10b — admin y agente acceden a /sla; reportante es redirigido', async ({
    page,
  }) => {
    // — Admin ve el panel de escalamiento SLA —
    await login(page, USUARIOS.admin);
    await page.goto('/sla');

    await expect(page.getByTestId('sla-banner')).toBeVisible();
    await expect(page.getByTestId('sla-table')).toBeVisible();
    // KPIs de niveles L1, L2, L3 presentes.
    await expect(page.getByTestId('sla-kpi-l1')).toBeVisible();
    await expect(page.getByTestId('sla-kpi-l2')).toBeVisible();
    await expect(page.getByTestId('sla-kpi-l3')).toBeVisible();

    // — Agente también puede acceder a /sla —
    await login(page, USUARIOS.agente);
    await page.goto('/sla');
    await expect(page.getByTestId('sla-banner')).toBeVisible();

    // — Reportante SIN acceso a /sla: RequireRole redirige a /tickets —
    await login(page, USUARIOS.reportante);
    await page.goto('/sla');
    // La ruta de un rol insuficiente redirige a /tickets (ver AuthContext.tsx:82).
    await page.waitForURL('**/tickets');
    await expect(page).toHaveURL(/\/tickets/);
  });
});
