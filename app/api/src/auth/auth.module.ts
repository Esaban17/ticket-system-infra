import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { CognitoService } from './cognito.service';

/**
 * Módulo de autenticación (FE-02 / EP-14). Expone el controller y el
 * CognitoService (SSO Hosted UI). UsersService llega del UsersModule global y
 * los guards (JwtAuthGuard/RolesGuard) ya son globales vía APP_GUARD en AppModule.
 */
@Module({
  controllers: [AuthController],
  providers: [CognitoService],
})
export class AuthModule {}
