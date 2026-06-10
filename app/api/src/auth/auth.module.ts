import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';

/**
 * Módulo de autenticación (FE-02). Solo expone el controller: UsersService
 * llega del UsersModule global y los guards (JwtAuthGuard/RolesGuard) ya son
 * globales vía APP_GUARD en AppModule.
 */
@Module({
  controllers: [AuthController],
})
export class AuthModule {}
