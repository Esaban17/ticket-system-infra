import { apiClient } from './client';
import type { LoginRequest, LoginResponse, User } from './types';

/**
 * POST /v1/auth/login (endpoint público — llega con el PR FE-02 / BL-027).
 * Mock: valida que el usuario exista por email; password no se verifica aún.
 */
export function login(email: string, password: string): Promise<LoginResponse> {
  const body: LoginRequest = { email, password };
  return apiClient.post<LoginResponse>('/auth/login', { body, skipAuth: true });
}

/** GET /v1/auth/me — usuario actual según el token. */
export function me(): Promise<User> {
  return apiClient.get<User>('/auth/me');
}
