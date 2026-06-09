import { Global, Module } from '@nestjs/common';

import { UsersService } from './users.service';

/**
 * Global: el guard de RBAC (EP-07) y otros módulos inyectan UsersService.
 */
@Global()
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
