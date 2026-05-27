/**
 * Barrel de decoradores custom.
 * BL-006 (autenticación JWT) y módulos posteriores agregarán aquí:
 *   - @CurrentUser()   — extrae el usuario autenticado del request
 *   - @Roles(...)      — valida roles RBAC (requester | agent | supervisor | admin)
 *   - @Public()        — marca endpoints que no requieren JWT
 */
export * from './public.decorator';
