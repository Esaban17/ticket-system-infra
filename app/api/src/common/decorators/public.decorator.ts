import { SetMetadata } from '@nestjs/common';

/**
 * Marca un endpoint como público (sin requerir JWT).
 * El guard de autenticación (BL-006) leerá esta metadata para omitir la validación.
 *
 * Uso:
 *   @Public()
 *   @Get('healthz')
 *   healthz() { ... }
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
