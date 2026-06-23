import { apiClient } from './client';
import type { AuthConfig, LoginRequest, LoginResponse, User } from './types';

/**
 * POST /v1/auth/login (endpoint público — llega con el PR FE-02 / BL-027).
 * Mock: valida que el usuario exista por email; password no se verifica aún.
 */
export function login(email: string, password: string): Promise<LoginResponse> {
  const body: LoginRequest = { email, password };
  return apiClient.post<LoginResponse>('/auth/login', { body, skipAuth: true });
}

/** GET /v1/auth/config — proveedor de auth + config del SSO Cognito (público). */
export function getAuthConfig(): Promise<AuthConfig> {
  return apiClient.get<AuthConfig>('/auth/config', { skipAuth: true });
}

/**
 * POST /v1/auth/cognito/exchange — canjea el authorization code del Hosted UI
 * por el token de sesión de la app (el backend verifica el ID token vía JWKS).
 */
export function exchangeCognitoCode(
  code: string,
  redirectUri: string,
): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>('/auth/cognito/exchange', {
    body: { code, redirectUri },
    skipAuth: true,
  });
}

/** GET /v1/auth/me — usuario actual según el token. */
export function me(): Promise<User> {
  return apiClient.get<User>('/auth/me');
}
