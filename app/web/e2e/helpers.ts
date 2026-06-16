import { expect, type Page } from '@playwright/test';

// Stack local esperado:
//  - API en http://localhost:8080 (Postgres migrado + seeds aplicados)
//  - Frontend en http://localhost:5173 (gestionado por playwright.config.ts)

export const USUARIOS = {
  reportante: 'reportante@ticket-system.dev',
  agente: 'agente@ticket-system.dev',
  admin: 'admin@ticket-system.dev',
} as const;

export const PASSWORD = 'e2e-password';

/** Hace login con el email indicado y espera a aterrizar en /tickets. */
export async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.waitForURL('**/tickets');
}

/**
 * Crea un incidente con severidad 4 e impacto 4 (prioridad = Crítica).
 * Devuelve el número de ticket, p. ej. "TKT-0042".
 * Precondición: el usuario ya está autenticado.
 */
export async function crearIncidenteCritico(
  page: Page,
  titulo: string,
): Promise<string> {
  await page.goto('/tickets/nuevo');

  await page.getByTestId('create-type-incidente').click();
  await page.getByTestId('create-title').fill(titulo);
  await page
    .getByTestId('create-description')
    .fill(
      'Incidente generado por la suite E2E automática: el servicio responde 502 desde el último despliegue.',
    );
  // Los inputs de radio son sr-only; el click va al label contenedor con force.
  await page.getByTestId('create-severity-4').check({ force: true });
  await page.getByTestId('create-impact-4').check({ force: true });

  await page.getByTestId('create-submit').click();

  const success = page.getByTestId('create-success');
  await expect(success).toBeVisible();
  const texto = (await success.innerText()) ?? '';
  const match = /TKT-\d+/.exec(texto);
  expect(match).not.toBeNull();
  return match![0];
}

/**
 * Crea una solicitud de servicio (sin fecha deseada).
 * Devuelve el número de ticket, p. ej. "TKT-0043".
 * Precondición: el usuario ya está autenticado.
 */
export async function crearSolicitud(
  page: Page,
  titulo: string,
): Promise<string> {
  await page.goto('/tickets/nuevo');

  await page.getByTestId('create-type-solicitud').click();
  await page.getByTestId('create-title').fill(titulo);
  await page
    .getByTestId('create-description')
    .fill(
      'Solicitud generada por la suite E2E automática: acceso a herramienta interna requerido para el nuevo integrante.',
    );

  await page.getByTestId('create-submit').click();

  const success = page.getByTestId('create-success');
  await expect(success).toBeVisible();
  const texto = (await success.innerText()) ?? '';
  const match = /TKT-\d+/.exec(texto);
  expect(match).not.toBeNull();
  return match![0];
}
