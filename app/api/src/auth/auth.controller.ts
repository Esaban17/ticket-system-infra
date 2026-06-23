import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '@prisma/client';

import { Public } from '@/common/decorators/public.decorator';
import { UsersService } from '@/users/users.service';
import { CognitoService, PublicAuthConfig, SessionResult } from './cognito.service';
import { CurrentUser } from './current-user.decorator';
import { CognitoExchangeDto } from './dto/cognito-exchange.dto';
import { LoginDto } from './dto/login.dto';
import { buildSessionToken } from './session-token';

/**
 * Endpoints de autenticación (FE-02 / EP-14).
 *
 * Dos proveedores conviven, controlados por AUTH_PROVIDER:
 *   - mock (default): el login valida que el email exista (la contraseña NO se
 *     verifica) y emite el token de sesión de la app. Fallback de desarrollo.
 *   - cognito: el SPA usa el Hosted UI (code flow); el backend intercambia el
 *     code, verifica el ID token (JWKS) y emite el mismo token de sesión. Con
 *     AUTH_PROVIDER=cognito el login por contraseña queda deshabilitado.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly cognito: CognitoService,
  ) {}

  // GET /v1/auth/config — público; el SPA decide qué mostrar (form mock y/o SSO).
  @Public()
  @Get('config')
  config(): PublicAuthConfig {
    return this.cognito.getPublicConfig();
  }

  // POST /v1/auth/login — login mock (deshabilitado si AUTH_PROVIDER=cognito).
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
  ): Promise<{ token: string; user: Pick<User, 'id' | 'email' | 'role'> }> {
    if (this.cognito.provider === 'cognito') {
      throw new ForbiddenException('Login por contraseña deshabilitado; usa SSO corporativo');
    }
    const user = await this.users.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return {
      token: buildSessionToken(user.id),
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  // POST /v1/auth/cognito/exchange — público; canjea el code del Hosted UI por
  // el token de sesión de la app (verifica el ID token vía JWKS).
  @Public()
  @Post('cognito/exchange')
  @HttpCode(HttpStatus.OK)
  exchange(@Body() dto: CognitoExchangeDto): Promise<SessionResult> {
    return this.cognito.exchangeCode(dto.code, dto.redirectUri);
  }

  // GET /v1/auth/me — usuario actual según el token (autenticado por el guard global).
  @Get('me')
  me(@CurrentUser() user: User): Pick<User, 'id' | 'email' | 'role'> {
    return { id: user.id, email: user.email, role: user.role };
  }
}
