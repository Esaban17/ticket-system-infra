import { test, expect } from '@playwright/test';
import { login, USUARIOS } from './helpers';

// TE2E-009/010 — Autenticación y RBAC en la interfaz
// Cubre: CU-01 (autenticación), restricciones de menú/ruta por rol.

test.describe('Autenticación y RBAC en UI', () => {
  test('E01 — login inválido muestra banner de error', async ({ page }) => {
    await page.goto('/login');

    await page.getByTestId('login-email').fill('noexiste@ticket-system.dev');
    await page.getByTestId('login-password').fill('password-incorrecto');
    await page.getByTestId('login-submit').click();

    // El banner repite el texto en título y detail; .first() evita strict mode.
    await expect(page.getByText('Credenciales inválidas').first()).toBeVisible();
    // La URL permanece en /login: no hubo redirección.
    await expect(page).toHaveURL(/\/login/);
  });

  test('E02 — login válido como reportante: menú restringido y logout', async ({
    page,
  }) => {
    await login(page, USUARIOS.reportante);

    // El email del usuario es visible en el topbar/sidebar.
    await expect(page.getByText(USUARIOS.reportante)).toBeVisible();
    // El reportante NO ve los ítems de navegación exclusivos de agente/admin.
    await expect(page.getByRole('link', { name: 'Reportes' })).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Escalados SLA' }),
    ).toHaveCount(0);

    // Logout cierra la sesión y redirige a /login.
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.waitForURL('**/login');

    // Acceso directo a ruta protegida sin sesión → redirige a /login.
    await page.goto('/tickets');
    await page.waitForURL('**/login');
  });

  test('E03 — login como administrador: acceso a Reportes y Escalados SLA', async ({
    page,
  }) => {
    await login(page, USUARIOS.admin);

    // El admin ve ambos ítems de navegación restringidos.
    await expect(
      page.getByRole('link', { name: 'Reportes' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Escalados SLA' }),
    ).toBeVisible();

    // Navegación directa a /reports y /sla no redirige.
    await page.goto('/reports');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).not.toHaveURL(/\/tickets/);

    await page.goto('/sla');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).not.toHaveURL(/\/tickets/);
  });
});
