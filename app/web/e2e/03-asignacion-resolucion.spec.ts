import { test, expect, type Page } from '@playwright/test';
import { crearIncidenteCritico, login, USUARIOS } from './helpers';

// TE2E-002 — Asignación (CU-02)
// TE2E-003 — Resolución  (CU-03)
// TE2E-005 — Historial   (CU-05)
//
// Cada test es autocontenido: crea su propio ticket para evitar dependencias seriales.

/** Crea un incidente crítico como reportante y devuelve el número de ticket. */
async function setupTicket(page: Page): Promise<string> {
  await login(page, USUARIOS.reportante);
  return crearIncidenteCritico(page, `E2E incidente ${Date.now()}`);
}

test.describe('Asignación, resolución y trazabilidad', () => {
  test('E06 — el agente se autoasigna un ticket desde la cola', async ({
    page,
  }) => {
    const ticketNumber = await setupTicket(page);

    // Re-login como agente.
    await login(page, USUARIOS.agente);

    // La fila del ticket recién creado debe estar visible en la cola.
    const fila = page.getByTestId(`ticket-row-${ticketNumber}`);
    await expect(fila).toBeVisible();

    // Click en "Asignarme" para que el agente se asigne el ticket.
    await page.getByTestId(`assign-me-${ticketNumber}`).click();

    // Después de la asignación, la fila muestra "Yo" como asignado.
    await expect(fila.getByText('Yo')).toBeVisible();
  });

  test('E07 — el agente resuelve el ticket con causa raíz y solución', async ({
    page,
  }) => {
    const ticketNumber = await setupTicket(page);

    await login(page, USUARIOS.agente);

    // Autoasignación antes de resolver (requerido por el flujo de estados).
    await page.getByTestId(`assign-me-${ticketNumber}`).click();

    // Navegar al detalle del ticket.
    await page.getByTestId(`ticket-row-${ticketNumber}`).getByRole('link').click();
    await expect(page.getByTestId('detail-header')).toBeVisible();

    // Iniciar trabajo (ABIERTO → EN_PROGRESO + formulario de resolución visible).
    await page.getByTestId('btn-start-work').click();
    await expect(page.getByTestId('resolve-rootcause')).toBeVisible();

    // Completar los campos de resolución.
    await page
      .getByTestId('resolve-rootcause')
      .fill(
        'Timeout de 1 s introducido en el cliente HTTP del gateway durante el despliegue.',
      );
    await page
      .getByTestId('resolve-solution')
      .fill(
        'Rollback a la versión anterior y ajuste del timeout a 10 s con reintentos exponenciales.',
      );

    await page.getByTestId('btn-resolve').click();

    // El estado del detalle refleja la resolución.
    await expect(page.getByTestId('detail-status')).toContainText('Resuelto');
  });

  test('E08 — el historial registra los 4 eventos del ciclo de vida del ticket (CU-05)', async ({
    page,
  }) => {
    const ticketNumber = await setupTicket(page);

    await login(page, USUARIOS.agente);

    // Asignar y resolver para generar todos los eventos.
    await page.getByTestId(`assign-me-${ticketNumber}`).click();
    await page.getByTestId(`ticket-row-${ticketNumber}`).getByRole('link').click();
    await page.getByTestId('btn-start-work').click();
    await page
      .getByTestId('resolve-rootcause')
      .fill('Causa raíz identificada por la suite E2E.');
    await page
      .getByTestId('resolve-solution')
      .fill('Solución aplicada y validada por la suite E2E.');
    await page.getByTestId('btn-resolve').click();
    await expect(page.getByTestId('detail-status')).toContainText('Resuelto');

    // Abrir la pestaña de historial.
    await page.getByTestId('tab-historial').click();
    const eventos = page.getByTestId('event-item');

    // Deben existir exactamente 4 eventos en el ciclo de vida.
    await expect(eventos).toHaveCount(4);

    // Cada tipo de evento debe estar presente una vez (acotado a los items).
    await expect(eventos.filter({ hasText: 'Ticket creado' })).toHaveCount(1);
    await expect(eventos.filter({ hasText: 'Asignación' })).toHaveCount(1);
    await expect(eventos.filter({ hasText: 'Cambio de estado' })).toHaveCount(1);
    await expect(eventos.filter({ hasText: 'Resolución' })).toHaveCount(1);
  });
});
