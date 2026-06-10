/** URL base del API (sin slash final). Configurable vía VITE_API_URL. */
export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080';

/** Prefijo global de versión del API. */
export const API_PREFIX = '/v1';

/** Clave de localStorage donde se persiste la sesión {token, user}. */
export const SESSION_STORAGE_KEY = 'ticket-session';
