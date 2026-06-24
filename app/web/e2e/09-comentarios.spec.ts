import { test, expect } from '@playwright/test';
import { crearIncidenteCritico, login, USUARIOS } from './helpers';

// TE2E-009 — Comentarios de ticket (EP-13 / BL-120, CU-05)
//
// El reportante crea un ticket propio, abre el detalle, va a la pestaña
// Comentarios, escribe y envía un comentario, y verifica que aparece en la lista.
// Cada test es autocontenido (crea su propio ticket).

test.describe('Comentarios de ticket', () => {
  test('E09 — el reportante agrega un comentario en su propio ticket', async ({
    page,
  }) => {
    await login(page, USUARIOS.reportante);
    const ticketNumber = await crearIncidenteCritico(
      page,
      `E2E comentarios ${Date.now()}`,
    );

    // Navegar al detalle del ticket recién creado desde la cola.
    await page.goto('/tickets');
    await page
      .getByTestId(`ticket-row-${ticketNumber}`)
      .getByRole('link')
      .click();
    await expect(page.getByTestId('detail-header')).toBeVisible();

    // Abrir la pestaña de comentarios.
    await page.getByTestId('tab-comentarios').click();

    // Escribir y enviar un comentario.
    const texto = `Comentario E2E ${Date.now()}: revisando el incidente reportado.`;
    await page.getByTestId('comment-input').fill(texto);
    await page.getByTestId('comment-submit').click();

    // El comentario debe aparecer en la lista (textarea limpio + item con autor).
    await expect(page.getByTestId('comment-input')).toHaveValue('');
    const items = page.getByTestId('comment-item');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText(texto);
    await expect(items.first()).toContainText(USUARIOS.reportante);
  });

  test('E10 — el comentario queda registrado en el historial', async ({
    page,
  }) => {
    await login(page, USUARIOS.reportante);
    const ticketNumber = await crearIncidenteCritico(
      page,
      `E2E comentario historial ${Date.now()}`,
    );

    await page.goto('/tickets');
    await page
      .getByTestId(`ticket-row-${ticketNumber}`)
      .getByRole('link')
      .click();
    await expect(page.getByTestId('detail-header')).toBeVisible();

    // Agregar el comentario.
    await page.getByTestId('tab-comentarios').click();
    const texto = `Seguimiento E2E ${Date.now()}.`;
    await page.getByTestId('comment-input').fill(texto);
    await page.getByTestId('comment-submit').click();
    await expect(page.getByTestId('comment-item')).toHaveCount(1);

    // El historial debe reflejar el evento de tipo Comentario.
    await page.getByTestId('tab-historial').click();
    const eventos = page.getByTestId('event-item');
    await expect(eventos.filter({ hasText: 'Comentario' })).toHaveCount(1);
  });
});
