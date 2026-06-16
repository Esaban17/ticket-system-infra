import { test, expect } from '@playwright/test';
import { login, USUARIOS } from './helpers';

// TE2E-001 — Incidente crítico (CU-01)
// TE2E-008 — Solicitud de servicio en cola con badge de Tipo (CU-08)

test.describe('Creación de tickets', () => {
  test('E04 — reportante crea un incidente crítico', async ({ page }) => {
    await login(page, USUARIOS.reportante);
    await page.goto('/tickets/nuevo');

    // Seleccionar tipo Incidente (ya es el default pero lo hacemos explícito).
    await page.getByTestId('create-type-incidente').click();
    await page
      .getByTestId('create-title')
      .fill(`E2E caída del servicio ${Date.now()}`);
    await page
      .getByTestId('create-description')
      .fill(
        'Incidente generado por la suite E2E: el servicio de pagos responde 502 desde el último despliegue.',
      );

    // Severidad 4 e impacto 4 → prioridad calculada en vivo = Crítica.
    await page.getByTestId('create-severity-4').check({ force: true });
    await page.getByTestId('create-impact-4').check({ force: true });

    // La prioridad estimada aparece en el formulario antes de enviar.
    await expect(page.getByText('Crítica').first()).toBeVisible();

    await page.getByTestId('create-submit').click();

    // Panel de éxito visible con el número de ticket asignado.
    const success = page.getByTestId('create-success');
    await expect(success).toBeVisible();
    const texto = (await success.innerText()) ?? '';
    expect(/TKT-\d+/.test(texto)).toBe(true);
  });

  test('E05 — reportante crea solicitud de servicio; la cola muestra badge "Solicitud"', async ({
    page,
  }) => {
    await login(page, USUARIOS.reportante);
    await page.goto('/tickets/nuevo');

    // Cambiar al tipo Solicitud de servicio.
    await page.getByTestId('create-type-solicitud').click();
    await page
      .getByTestId('create-title')
      .fill(`E2E solicitud de acceso ${Date.now()}`);
    await page
      .getByTestId('create-description')
      .fill(
        'Solicitud generada por la suite E2E: acceso a Grafana para nuevo integrante del equipo.',
      );

    // Fecha deseada (campo opcional que aparece solo para solicitudes).
    await page.getByTestId('create-desired-date').fill('2026-08-01');

    await page.getByTestId('create-submit').click();

    // Panel de éxito con número de ticket.
    const success = page.getByTestId('create-success');
    await expect(success).toBeVisible();
    const texto = (await success.innerText()) ?? '';
    const match = /TKT-\d+/.exec(texto);
    expect(match).not.toBeNull();
    const ticketNumber = match![0];

    // Ir a la cola y verificar que la fila muestra el badge de tipo "Solicitud".
    await page.goto('/tickets');
    const fila = page.getByTestId(`ticket-row-${ticketNumber}`);
    await expect(fila).toBeVisible();
    // El badge TypeBadge renderiza el texto "Solicitud" dentro de la fila.
    await expect(fila.getByText('Solicitud')).toBeVisible();
  });
});
