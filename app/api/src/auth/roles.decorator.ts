import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * Declara los roles permitidos para un endpoint (RBAC, BL-027).
 * Uso: @RequireRole('agente', 'administrador')
 */
export const REQUIRED_ROLES_KEY = 'requiredRoles';
export const RequireRole = (...roles: Role[]) => SetMetadata(REQUIRED_ROLES_KEY, roles);
