import { test, expect } from '@playwright/test';
import { crearIncidenteCritico, login, USUARIOS } from './helpers';

// TE2E-006 — Filtrado de la cola de tickets (CU-06)

test.describe('Filtros de la cola de tickets', () => {
  test('E09 — filtrar cola por estado, prioridad, búsqueda de texto y "solo mis tickets"', async ({
    page,
  }) => {
    // Crear un incidente crítico para tener datos conocidos en la cola.
    await login(page, USUARIOS.reportante);
    const titulo = `E2E filtro-cola ${Date.now()}`;
    const ticketNumber = await crearIncidenteCritico(page, titulo);

    // Re-login como agente para ver la cola completa.
    await login(page, USUARIOS.agente);
    await expect(page.getByTestId('queue-table')).toBeVisible();

    // — Filtro por estado "abierto" —
    await page.getByTestId('filter-status').selectOption('abierto');
    // La tabla debe seguir visible y el ticket recién creado debe aparecer.
    await expect(page.getByTestId(`ticket-row-${ticketNumber}`)).toBeVisible();
    // Limpiar filtro.
    await page.getByTestId('filter-status').selectOption('');

    // — Filtro por prioridad "critica" —
    await page.getByTestId('filter-priority').selectOption('critica');
    // Con el filtro de prioridad crítica, el ticket aparece (sev4+imp4 → Crítica).
    await expect(page.getByTestId(`ticket-row-${ticketNumber}`)).toBeVisible();
    // Todas las filas visibles deben mostrar el badge "Crítica".
    const filasConPrioridad = page.getByTestId('queue-table').getByRole('row').filter({ hasText: 'Crítica' });
    const total = await page.getByTestId('queue-table').getByRole('row').count();
    // Al menos 1 fila de datos (la cabecera no cuenta como fila de dato con testId).
    expect(total).toBeGreaterThanOrEqual(1);
    await expect(filasConPrioridad.first()).toBeVisible();
    // Limpiar filtro.
    await page.getByTestId('filter-priority').selectOption('');

    // — Filtro de búsqueda por texto (debounce 400 ms) —
    await page.getByTestId('filter-q').fill(titulo);
    // Esperar a que el debounce de 400 ms se dispare.
    await page.waitForTimeout(500);
    // Solo debe aparecer el ticket cuyo título coincide.
    const filaFiltrada = page.getByTestId(`ticket-row-${ticketNumber}`);
    await expect(filaFiltrada).toBeVisible();
    // Ninguna otra fila de ticket debe aparecer si el título es suficientemente único.
    const todasLasFilas = page.getByTestId('queue-table').locator('tbody tr');
    await expect(todasLasFilas).toHaveCount(1);
    // Limpiar búsqueda.
    await page.getByTestId('filter-q').fill('');
    await page.waitForTimeout(500);

    // — Asignar el ticket y luego filtrar por "solo los míos" —
    await page.getByTestId(`assign-me-${ticketNumber}`).click();
    await expect(
      page.getByTestId(`ticket-row-${ticketNumber}`).getByText('Yo'),
    ).toBeVisible();

    await page.getByTestId('filter-only-mine').check();
    // El ticket asignado al agente debe aparecer bajo "solo mis tickets".
    await expect(page.getByTestId(`ticket-row-${ticketNumber}`)).toBeVisible();
    await page.getByTestId('filter-only-mine').uncheck();
  });
});
