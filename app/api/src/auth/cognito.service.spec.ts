import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';

import { CognitoService, mapGroupsToRole } from './cognito.service';
import { UsersService } from '@/users/users.service';

const COGNITO_CFG = {
  userPoolId: 'us-east-1_abc',
  clientId: 'client123',
  domain: 'https://ticket-system-dev.auth.us-east-1.amazoncognito.com',
  redirectUri: 'http://localhost:5173/auth/callback',
  logoutUri: 'http://localhost:5173/login',
  region: 'us-east-1',
};

function makeService(values: Record<string, unknown>) {
  const config = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  const users = { upsertByEmail: jest.fn() } as unknown as UsersService;
  return new CognitoService(config, users);
}

describe('mapGroupsToRole', () => {
  it('administrador tiene prioridad', () => {
    expect(mapGroupsToRole(['agente', 'administrador'])).toBe(Role.administrador);
  });
  it('agente cuando no hay administrador', () => {
    expect(mapGroupsToRole(['agente'])).toBe(Role.agente);
  });
  it('reportante por defecto (sin grupos o desconocidos)', () => {
    expect(mapGroupsToRole([])).toBe(Role.reportante);
    expect(mapGroupsToRole(['otro'])).toBe(Role.reportante);
    expect(mapGroupsToRole(undefined)).toBe(Role.reportante);
    expect(mapGroupsToRole('no-array')).toBe(Role.reportante);
  });
});

describe('CognitoService.getPublicConfig', () => {
  it('expone el bloque cognito cuando está configurado', () => {
    const svc = makeService({ 'auth.provider': 'mock', 'auth.cognito': COGNITO_CFG });
    const cfg = svc.getPublicConfig();
    expect(cfg.provider).toBe('mock');
    expect(cfg.cognito).toEqual({
      domain: COGNITO_CFG.domain,
      clientId: COGNITO_CFG.clientId,
      redirectUri: COGNITO_CFG.redirectUri,
      logoutUri: COGNITO_CFG.logoutUri,
      scope: 'openid email profile',
    });
  });

  it('cognito: null cuando no está configurado', () => {
    const svc = makeService({ 'auth.provider': 'mock', 'auth.cognito': null });
    expect(svc.getPublicConfig().cognito).toBeNull();
    expect(svc.isEnabled()).toBe(false);
  });

  it('provider refleja AUTH_PROVIDER', () => {
    const svc = makeService({ 'auth.provider': 'cognito', 'auth.cognito': COGNITO_CFG });
    expect(svc.provider).toBe('cognito');
    expect(svc.isEnabled()).toBe(true);
  });
});
