import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

import { UsersService } from '@/users/users.service';
import { buildSessionToken } from './session-token';

interface CognitoConfig {
  userPoolId: string;
  clientId: string;
  domain: string;
  redirectUri: string;
  logoutUri: string | null;
  region: string | null;
}

export interface PublicAuthConfig {
  provider: 'mock' | 'cognito';
  cognito: {
    domain: string;
    clientId: string;
    redirectUri: string;
    logoutUri: string | null;
    scope: string;
  } | null;
}

export interface SessionResult {
  token: string;
  user: { id: string; email: string; role: Role };
}

/** Verificador JWKS minimal (evita los overloads de tipos de la librería). */
type IdTokenVerifier = { verify(token: string): Promise<Record<string, unknown>> };

const OAUTH_SCOPE = 'openid email profile';

/**
 * Mapea los grupos de Cognito (claim `cognito:groups`) al rol de la app.
 * Prioridad administrador > agente > reportante (default). Función pura para
 * poder testearla sin red ni verificación JWKS.
 */
export function mapGroupsToRole(groups: unknown): Role {
  const list = Array.isArray(groups) ? groups.map((g) => String(g)) : [];
  if (list.includes('administrador')) return Role.administrador;
  if (list.includes('agente')) return Role.agente;
  return Role.reportante;
}

/**
 * Integración con Amazon Cognito (EP-14) para el flujo SSO Hosted UI
 * (authorization code). El SPA redirige al Hosted UI; al volver, el backend
 * intercambia el `code` por tokens, verifica el ID token contra el JWKS del
 * pool, mapea el grupo a rol, provisiona/sincroniza el usuario y emite el
 * token de sesión de la app (el resto de la API no cambia).
 */
@Injectable()
export class CognitoService {
  private readonly logger = new Logger(CognitoService.name);
  private verifier: IdTokenVerifier | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersService,
  ) {}

  get provider(): 'mock' | 'cognito' {
    return this.config.get<'mock' | 'cognito'>('auth.provider') ?? 'mock';
  }

  private get cognito(): CognitoConfig | null {
    return this.config.get<CognitoConfig | null>('auth.cognito') ?? null;
  }

  isEnabled(): boolean {
    return this.cognito !== null;
  }

  /** Config pública para que el SPA arranque el flujo (o cognito: null). */
  getPublicConfig(): PublicAuthConfig {
    const c = this.cognito;
    return {
      provider: this.provider,
      cognito: c
        ? {
            domain: c.domain,
            clientId: c.clientId,
            redirectUri: c.redirectUri,
            logoutUri: c.logoutUri,
            scope: OAUTH_SCOPE,
          }
        : null,
    };
  }

  /**
   * Intercambia el authorization code por el ID token, lo verifica vía JWKS,
   * mapea grupo→rol, provisiona/sincroniza el usuario y devuelve el token de
   * sesión de la app.
   */
  async exchangeCode(code: string, redirectUri: string): Promise<SessionResult> {
    const c = this.cognito;
    if (!c) {
      throw new ServiceUnavailableException('SSO (Cognito) no está configurado');
    }

    const idToken = await this.fetchIdToken(c, code, redirectUri);
    const claims = await this.verifyIdToken(c, idToken);

    const email = typeof claims.email === 'string' ? claims.email : null;
    if (!email) {
      throw new UnauthorizedException('El ID token de Cognito no incluye email');
    }

    const role = mapGroupsToRole(claims['cognito:groups']);
    const user = await this.users.upsertByEmail(email, role);

    return {
      token: buildSessionToken(user.id),
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  /** POST /oauth2/token (cliente público, sin secret). */
  private async fetchIdToken(c: CognitoConfig, code: string, redirectUri: string): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: c.clientId,
      code,
      redirect_uri: redirectUri,
    });

    const res = await fetch(`${c.domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.warn(`Cognito token endpoint ${res.status}: ${detail}`);
      throw new UnauthorizedException('No se pudo intercambiar el código con Cognito');
    }

    const json = (await res.json()) as { id_token?: string };
    if (!json.id_token) {
      throw new UnauthorizedException('Respuesta de Cognito sin id_token');
    }
    return json.id_token;
  }

  /** Verifica firma + iss/aud/exp del ID token contra el JWKS del pool. */
  private async verifyIdToken(c: CognitoConfig, idToken: string): Promise<Record<string, unknown>> {
    if (!this.verifier) {
      this.verifier = CognitoJwtVerifier.create({
        userPoolId: c.userPoolId,
        clientId: c.clientId,
        tokenUse: 'id',
      }) as unknown as IdTokenVerifier;
    }
    try {
      return await this.verifier.verify(idToken);
    } catch (err) {
      this.logger.warn(`Verificación JWKS falló: ${String(err)}`);
      throw new UnauthorizedException('ID token de Cognito inválido');
    }
  }
}
