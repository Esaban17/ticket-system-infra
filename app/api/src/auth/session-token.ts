/**
 * Token de sesión de la APP (no de Cognito). Tras autenticar — sea por el login
 * mock o por el flujo SSO de Cognito (verificando su ID token vía JWKS) — la app
 * emite SU PROPIO token de sesión con el `sub` = id del usuario en la BD. El
 * JwtAuthGuard solo decodifica ese `sub` para resolver al usuario, así que la
 * verificación de identidad ocurre en el login y el resto de la API no cambia.
 *
 * Formato compatible con JwtAuthGuard: header {alg:"none"} y payload {sub, iat}
 * en base64url, unidos por punto y con sufijo ".sig".
 */
export function buildSessionToken(userId: string): string {
  const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg: 'none' });
  const payload = b64({ sub: userId, iat: Math.floor(Date.now() / 1000) });
  return `${header}.${payload}.sig`;
}
