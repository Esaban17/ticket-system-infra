import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '@prisma/client';

import { Public } from '@/common/decorators/public.decorator';
import { UsersService } from '@/users/users.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';

/**
 * Endpoints de autenticación (FE-02 / BL-027).
 *
 * MOCK hasta EP-14 (Cognito): el login solo valida que el usuario exista por
 * email — la contraseña NO se verifica — y emite un token con el mismo formato
 * que decodifica JwtAuthGuard (payload base64url sin firma real). La emisión y
 * verificación reales contra JWKS de Cognito llegan con EP-14.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly users: UsersService) {}

  // POST /v1/auth/login — público; 401 Problem Details si el email no existe.
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
  ): Promise<{ token: string; user: Pick<User, 'id' | 'email' | 'role'> }> {
    const user = await this.users.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return {
      token: this.buildMockToken(user.id),
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  // GET /v1/auth/me — usuario actual según el token (autenticado por el guard global).
  @Get('me')
  me(@CurrentUser() user: User): Pick<User, 'id' | 'email' | 'role'> {
    return { id: user.id, email: user.email, role: user.role };
  }

  /**
   * Construye el JWT mock que acepta JwtAuthGuard: header {alg:"none"} y
   * payload {sub, iat} en base64url, unidos por punto y con sufijo ".sig".
   */
  private buildMockToken(userId: string): string {
    const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url');
    const header = b64({ alg: 'none' });
    const payload = b64({ sub: userId, iat: Math.floor(Date.now() / 1000) });
    return `${header}.${payload}.sig`;
  }
}
