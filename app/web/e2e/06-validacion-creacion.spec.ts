import { test, expect } from '@playwright/test';
import { login, USUARIOS } from './helpers';

// N01-N04 — Validación del formulario, prioridad en vivo y UI condicional por tipo.
// Cubre escenarios del formulario de creación no probados en 02-creacion.spec.ts.

test.describe('Validación y comportamiento del formulario de creación', () => {
  test('N01 — submit vacío muestra errores de validación y no crea el ticket', async ({
    page,
  }) => {
    await login(page, USUARIOS.reportante);
    await page.goto('/tickets/nuevo');

    // Enviar el formulario sin rellenar ningún campo activa showValidation.
    await page.getByTestId('create-submit').click();

    // Los mensajes de error de título y descripción deben aparecer.
    await expect(
      page.getByText('El título debe tener entre 5 y 200 caracteres.'),
    ).toBeVisible();
    await expect(
      page.getByText('La descripción debe tener entre 20 y 5000 caracteres.'),
    ).toBeVisible();

    // El panel de éxito NO debe ser visible: no se creó ningún ticket.
    await expect(page.getByTestId('create-success')).toHaveCount(0);
  });

  test('N02 — la prioridad estimada cambia en vivo según severidad e impacto (decision table)', async ({
    page,
  }) => {
    await login(page, USUARIOS.reportante);
    await page.goto('/tickets/nuevo');

    // Estado inicial del form: sev=2, imp=2 → sum=4 → "Media".
    await expect(page.getByText('Media').first()).toBeVisible();

    // sev=1, imp=1 → sum=2 → "Baja".
    await page.getByTestId('create-severity-1').check({ force: true });
    await page.getByTestId('create-impact-1').check({ force: true });
    await expect(page.getByText('Baja').first()).toBeVisible();

    // sev=4, imp=4 → sum=8 → "Crítica".
    await page.getByTestId('create-severity-4').check({ force: true });
    await page.getByTestId('create-impact-4').check({ force: true });
    await expect(page.getByText('Crítica').first()).toBeVisible();

    // sev=1, imp=3 → sum=4 → "Media".
    await page.getByTestId('create-severity-1').check({ force: true });
    await page.getByTestId('create-impact-3').check({ force: true });
    await expect(page.getByText('Media').first()).toBeVisible();

    // sev=2, imp=3 → sum=5 → "Alta".
    await page.getByTestId('create-severity-2').check({ force: true });
    await page.getByTestId('create-impact-3').check({ force: true });
    await expect(page.getByText('Alta').first()).toBeVisible();
  });

  test('N03 — UI condicional por tipo: campo fecha y leyenda severidad/urgencia', async ({
    page,
  }) => {
    await login(page, USUARIOS.reportante);
    await page.goto('/tickets/nuevo');

    // Estado inicial: tipo Incidente → "Severidad *" visible, sin fecha deseada.
    await expect(page.getByText('Severidad *')).toBeVisible();
    await expect(page.getByTestId('create-desired-date')).toHaveCount(0);

    // Cambiar a Solicitud de servicio.
    await page.getByTestId('create-type-solicitud').click();

    // Aparece la fecha deseada y el legend cambia a "Urgencia *".
    await expect(page.getByTestId('create-desired-date')).toBeVisible();
    await expect(page.getByText('Urgencia *')).toBeVisible();
    await expect(page.getByText('Severidad *')).toHaveCount(0);

    // Volver a Incidente: la fecha desaparece y el legend vuelve a "Severidad *".
    await page.getByTestId('create-type-incidente').click();
    await expect(page.getByTestId('create-desired-date')).toHaveCount(0);
    await expect(page.getByText('Severidad *')).toBeVisible();
  });

  test('N04 — el botón Cancelar navega a /tickets sin crear un ticket', async ({
    page,
  }) => {
    await login(page, USUARIOS.reportante);
    await page.goto('/tickets/nuevo');

    // Rellenar algunos campos (no todos) para comprobar que no se envía.
    await page.getByTestId('create-title').fill('Ticket que no se creará');
    await page
      .getByTestId('create-description')
      .fill('Esta descripción no debería generar un ticket nuevo.');

    // Click en Cancelar → redirige a /tickets.
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await page.waitForURL('**/tickets');

    // No debe haber panel de éxito (no hay ticket creado).
    await expect(page.getByTestId('create-success')).toHaveCount(0);
  });
});
