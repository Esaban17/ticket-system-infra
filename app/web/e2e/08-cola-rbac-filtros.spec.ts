import { test, expect } from '@playwright/test';
import { crearIncidenteCritico, login, USUARIOS } from './helpers';

// N08-N10 — RBAC en la cola, filtro por severidad y estado vacío con limpiar filtros.
// Complementa E09 (filtros de estado/prioridad/texto/solo-míos) con los casos
// de permisos de asignación y el filtro de severidad que quedó sin cobertura.

test.describe('RBAC, filtro por severidad y estado vacío en la cola', () => {
  test('N08 — el reportante no ve la columna de acciones; el agente sí', async ({
    page,
  }) => {
    // — Reportante: sin permiso de asignación —
    await login(page, USUARIOS.reportante);
    await page.goto('/tickets');
    await expect(page.getByTestId('queue-table')).toBeVisible();

    // El reportante (canAssign = false) no ve el botón "Asignarme" en ninguna fila.
    const botonesAsignar = page
      .getByTestId('queue-table')
      .getByRole('button', { name: 'Asignarme' });
    await expect(botonesAsignar).toHaveCount(0);

    // — Agente: con permiso de asignación —
    // Crear un ticket primero para asegurar que haya al menos una fila en la cola.
    await crearIncidenteCritico(page, `E2E rbac ${Date.now()}`);

    await login(page, USUARIOS.agente);
    await page.goto('/tickets');
    await expect(page.getByTestId('queue-table')).toBeVisible();

    // El agente (canAssign = true) debe ver al menos un botón "Asignarme".
    const botonesAgente = page
      .getByTestId('queue-table')
      .getByRole('button', { name: 'Asignarme' });
    const count = await botonesAgente.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('N09 — filtrar cola por severidad muestra y oculta filas correctamente', async ({
    page,
  }) => {
    // Crear un incidente crítico (severidad 4, impacto 4) como reportante.
    await login(page, USUARIOS.reportante);
    const ticketNumber = await crearIncidenteCritico(
      page,
      `E2E filtro-sev ${Date.now()}`,
    );

    // Acceder a la cola como agente para ver todos los tickets.
    await login(page, USUARIOS.agente);
    await expect(page.getByTestId('queue-table')).toBeVisible();

    // — Filtrar por severidad 4: el ticket recién creado debe aparecer —
    await page.getByTestId('filter-severity').selectOption('4');
    const fila = page.getByTestId(`ticket-row-${ticketNumber}`);
    await expect(fila).toBeVisible();

    // — Filtrar por severidad 1: el ticket de sev4 NO debe aparecer —
    await page.getByTestId('filter-severity').selectOption('1');
    await expect(page.getByTestId(`ticket-row-${ticketNumber}`)).toHaveCount(0);

    // Limpiar filtro al finalizar.
    await page.getByTestId('filter-severity').selectOption('');
  });

  test('N10 — filtro sin coincidencias muestra estado vacío y "Limpiar filtros" restaura la tabla', async ({
    page,
  }) => {
    await login(page, USUARIOS.agente);
    await page.goto('/tickets');
    await expect(page.getByTestId('queue-table')).toBeVisible();

    // Escribir un texto que no coincida con ningún ticket (suficientemente único).
    const textoImposible = 'xzxzxz-no-existe-jamas-e2e-99999';
    await page.getByTestId('filter-q').fill(textoImposible);

    // Esperar el debounce de 400 ms + margen.
    await page.waitForTimeout(500);

    // queue-table no se renderiza cuando tickets.length === 0.
    await expect(page.getByTestId('queue-table')).toHaveCount(0);
    await expect(
      page.getByText('Ningún ticket coincide con los filtros aplicados'),
    ).toBeVisible();

    // "Limpiar filtros" aparece cuando hasActiveFilters === true.
    const btnLimpiar = page.getByRole('button', { name: 'Limpiar filtros' });
    await expect(btnLimpiar).toBeVisible();
    await btnLimpiar.click();

    // Tras limpiar, la tabla vuelve a ser visible.
    await page.waitForTimeout(200);
    await expect(page.getByTestId('queue-table')).toBeVisible();
  });
});
