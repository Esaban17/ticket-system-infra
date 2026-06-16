import { test, expect } from '@playwright/test';
import { crearIncidenteCritico, login, USUARIOS } from './helpers';

// N05-N07 — Persistencia de sesión, limpieza en logout y navegación de pestañas.
// Complementa E02 (logout) y E08 (historial) con casos de sesión y UI de tabs.

test.describe('Sesión y navegación de la interfaz', () => {
  test('N05 — la sesión persiste tras recargar la página y permite deep-links', async ({
    page,
  }) => {
    await login(page, USUARIOS.reportante);

    // Recargar la página: la sesión está en localStorage (clave ticket-session)
    // y el AuthProvider la restaura → sigue en /tickets, sin redirigir a /login.
    await page.reload();
    await page.waitForURL('**/tickets');
    await expect(page).not.toHaveURL(/\/login/);

    // Deep-link a una ruta protegida sin hacer login explícito: no redirige.
    await page.goto('/tickets/nuevo');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByTestId('create-submit')).toBeVisible();
  });

  test('N06 — logout elimina la sesión y el botón Atrás no la restaura', async ({
    page,
  }) => {
    await login(page, USUARIOS.reportante);

    // Cerrar sesión.
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.waitForURL('**/login');

    // El botón Atrás no debe restaurar la sesión. LoginPage usa
    // navigate(from, { replace:true }) → reemplaza /login en el historial con
    // /tickets, y el posterior logout reemplaza /tickets con /login de nuevo.
    // El historial queda en [/login] (sin entradas anteriores), así que
    // goBack() aterriza en about:blank (la página inicial vacía del navegador).
    // En ambos casos (about:blank o /login) la sesión NO se restauró.
    await page.goBack();
    await expect(page).not.toHaveURL(/\/tickets/);
  });

  test('N07 — las pestañas Detalle/Historial/Adjuntos del ticket funcionan correctamente', async ({
    page,
  }) => {
    // Crear un ticket como reportante y acceder a su detalle como agente.
    await login(page, USUARIOS.reportante);
    const ticketNumber = await crearIncidenteCritico(
      page,
      `E2E pestañas ${Date.now()}`,
    );

    await login(page, USUARIOS.agente);

    // Navegar al detalle a través de la cola.
    const fila = page.getByTestId(`ticket-row-${ticketNumber}`);
    await expect(fila).toBeVisible();
    await fila.getByRole('link').click();
    await expect(page.getByTestId('detail-header')).toBeVisible();

    // La tab inicial activa es "Detalle" (aria-selected="true").
    const tabDetalle = page.getByTestId('tab-detalle');
    const tabHistorial = page.getByTestId('tab-historial');
    const tabAdjuntos = page.getByTestId('tab-adjuntos');

    await expect(tabDetalle).toHaveAttribute('aria-selected', 'true');
    await expect(tabHistorial).toHaveAttribute('aria-selected', 'false');

    // Cambiar a Historial.
    await tabHistorial.click();
    await expect(tabHistorial).toHaveAttribute('aria-selected', 'true');
    await expect(tabDetalle).toHaveAttribute('aria-selected', 'false');
    // El historial debe tener al menos el evento de creación del ticket.
    await expect(page.getByTestId('event-item').first()).toBeVisible();

    // Cambiar a Adjuntos.
    await tabAdjuntos.click();
    await expect(tabAdjuntos).toHaveAttribute('aria-selected', 'true');
    await expect(tabHistorial).toHaveAttribute('aria-selected', 'false');
    // Los event-item del historial ya no son visibles (el contenido es condicional).
    await expect(page.getByTestId('event-item')).toHaveCount(0);
  });
});
