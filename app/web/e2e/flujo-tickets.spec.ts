import { test, expect, type Page } from '@playwright/test';

// E2E de los 4 casos de uso núcleo contra el stack local real
// (sin mocks: API NestJS + Postgres con seeds).
// Los tests corren en serie porque comparten el ticket creado en el caso 2.

const USUARIOS = {
  reportante: 'reportante@ticket-system.dev',
  agente: 'agente@ticket-system.dev',
  admin: 'admin@ticket-system.dev',
};

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill('e2e-password');
  await page.getByTestId('login-submit').click();
  await page.waitForURL('**/tickets');
}

test.describe.serial('Flujo de tickets E2E', () => {
  let ticketNumber: string;

  test('CU autenticación: login inválido, login válido y RBAC en UI', async ({ page }) => {
    await page.goto('/login');

    // Credenciales inválidas → Problem Details 401 visible
    await page.getByTestId('login-email').fill('noexiste@ticket-system.dev');
    await page.getByTestId('login-password').fill('x');
    await page.getByTestId('login-submit').click();
    // El banner repite el texto en título y detail → first() evita strict mode
    await expect(page.getByText('Credenciales inválidas').first()).toBeVisible();

    // Login válido como reportante → cola, sin navegación de admin
    await login(page, USUARIOS.reportante);
    await expect(page.getByText(USUARIOS.reportante)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reportes' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Escalados SLA' })).toHaveCount(0);

    // Logout vuelve a /login y una ruta protegida redirige
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.waitForURL('**/login');
    await page.goto('/tickets');
    await page.waitForURL('**/login');
  });

  test('CU generación: el reportante crea un incidente crítico', async ({ page }) => {
    await login(page, USUARIOS.reportante);
    await page.goto('/tickets/nuevo');

    await page.getByTestId('create-type-incidente').click();
    await page.getByTestId('create-title').fill(`E2E caída del servicio ${Date.now()}`);
    await page
      .getByTestId('create-description')
      .fill('Incidente generado por la suite E2E: el servicio de pagos responde 502 desde el último despliegue.');
    // Los radios son sr-only; el click va al label contenedor
    await page.getByTestId('create-severity-4').check({ force: true });
    await page.getByTestId('create-impact-4').check({ force: true });

    // Prioridad calculada en vivo con la fórmula del backend (4+4 >= 7 → crítica)
    await expect(page.getByText('Crítica').first()).toBeVisible();

    await page.getByTestId('create-submit').click();
    const success = page.getByTestId('create-success');
    await expect(success).toBeVisible();
    const match = /TKT-\d+/.exec((await success.innerText()) ?? '');
    expect(match).not.toBeNull();
    ticketNumber = match![0];
  });

  test('CU asignación: el agente se asigna el ticket desde la cola', async ({ page }) => {
    await login(page, USUARIOS.agente);

    const fila = page.getByTestId(`ticket-row-${ticketNumber}`);
    await expect(fila).toBeVisible();
    await page.getByTestId(`assign-me-${ticketNumber}`).click();
    await expect(fila.getByText('Yo')).toBeVisible();
  });

  test('CU resolución: el agente resuelve con causa raíz y solución', async ({ page }) => {
    await login(page, USUARIOS.agente);

    await page.getByTestId(`ticket-row-${ticketNumber}`).getByRole('link').click();
    await expect(page.getByTestId('detail-header')).toBeVisible();

    await page.getByTestId('btn-start-work').click();
    await expect(page.getByTestId('resolve-rootcause')).toBeVisible();

    await page
      .getByTestId('resolve-rootcause')
      .fill('Timeout de 1s introducido en el cliente HTTP del gateway durante el despliegue.');
    await page
      .getByTestId('resolve-solution')
      .fill('Rollback a la versión anterior y ajuste del timeout a 10s con reintentos.');
    await page.getByTestId('btn-resolve').click();

    await expect(page.getByTestId('detail-status')).toContainText('Resuelto');

    // Trazabilidad (CU-05): el historial registra los 4 eventos del ciclo de vida
    await page.getByTestId('tab-historial').click();
    const eventos = page.getByTestId('event-item');
    await expect(eventos).toHaveCount(4);
    // Acotado a los items: los mismos textos existen en los checkboxes de filtro
    await expect(eventos.filter({ hasText: 'Ticket creado' })).toHaveCount(1);
    await expect(eventos.filter({ hasText: 'Asignación' })).toHaveCount(1);
    await expect(eventos.filter({ hasText: 'Cambio de estado' })).toHaveCount(1);
    await expect(eventos.filter({ hasText: 'Resolución' })).toHaveCount(1);
  });
});
