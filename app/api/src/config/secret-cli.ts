/**
 * secret-cli — wrapper de línea de comandos (Delivery 5 — Deliverable B).
 *
 * Uso:  node dist/config/secret-cli.js <cmd> [args...]
 *
 * Carga las credenciales de BD desde Secrets Manager (loadSecretIntoEnv),
 * componiendo process.env.DATABASE_URL, y luego ejecuta el comando recibido
 * heredando ese entorno. Lo usa el Job de seed para que `prisma migrate deploy`
 * y `node dist/seed.js` reciban DATABASE_URL sin que la contraseña viva en un
 * ConfigMap ni en un Secret de Kubernetes.
 *
 * Ejemplo (Job de seed):
 *   node dist/config/secret-cli.js sh -c "prisma migrate deploy && node dist/seed.js"
 */

import { spawn } from 'node:child_process';

import { loadSecretIntoEnv } from './secret-loader';

async function run(): Promise<void> {
  await loadSecretIntoEnv();

  const [, , cmd, ...args] = process.argv;
  if (!cmd) {
    console.error('secret-cli: falta el comando a ejecutar.');
    process.exit(2);
  }

  const child = spawn(cmd, args, { stdio: 'inherit', env: process.env });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on('error', (err) => {
    console.error('secret-cli: error al ejecutar el comando:', err);
    process.exit(1);
  });
}

run().catch((err: unknown) => {
  console.error('secret-cli: fallo al cargar el secret:', err);
  process.exit(1);
});
