import { API_PREFIX, API_URL, SESSION_STORAGE_KEY } from './config';
import type { ProblemDetails, User } from './types';

/** Error tipado del API basado en Problem Details (RFC 9457). */
export class ApiError extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly detail: string;
  readonly requestId: string | undefined;
  readonly problem: ProblemDetails | undefined;

  constructor(status: number, problem?: ProblemDetails) {
    super(problem?.detail ?? `Error HTTP ${status}`);
    this.name = 'ApiError';
    this.status = problem?.status ?? status;
    this.type = problem?.type ?? 'about:blank';
    this.title = problem?.title ?? 'Error';
    this.detail = problem?.detail ?? `Error HTTP ${status}`;
    this.requestId = problem?.request_id;
    this.problem = problem;
  }
}

interface StoredSession {
  token: string;
  user: User;
}

/** Lee la sesión persistida en localStorage (o null). */
export function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.token !== 'string' || !parsed.user) return null;
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

/** Elimina la sesión persistida (ej. ante un 401). */
export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // localStorage no disponible — nada que limpiar
  }
}

export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

/** Construye un query string omitiendo valores null/undefined/''. */
export function buildQueryString(params?: QueryParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** URL absoluta de un path del API (con prefijo /v1) + query params. */
export function apiUrl(path: string, params?: QueryParams): string {
  return `${API_URL}${API_PREFIX}${path}${buildQueryString(params)}`;
}

interface RequestOptions {
  params?: QueryParams;
  body?: unknown;
  headers?: Record<string, string>;
  /** Saltar el header Authorization (ej. login). */
  skipAuth?: boolean;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { ...options.headers };

  if (!options.skipAuth) {
    const session = readSession();
    if (session) headers['Authorization'] = `Bearer ${session.token}`;
  }

  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(apiUrl(path, options.params), {
    method,
    headers,
    ...(body !== undefined ? { body } : {}),
  });

  if (!response.ok) {
    let problem: ProblemDetails | undefined;
    try {
      problem = (await response.json()) as ProblemDetails;
    } catch {
      problem = undefined;
    }
    // Sesión inválida/expirada: limpiar y volver al login (excepto en el propio login).
    if (response.status === 401 && !options.skipAuth) {
      clearSession();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    throw new ApiError(response.status, problem);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const apiClient = {
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>('GET', path, options);
  },
  post<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>('POST', path, options);
  },
  patch<T>(path: string, options?: RequestOptions): Promise<T> {
    return request<T>('PATCH', path, options);
  },
};
