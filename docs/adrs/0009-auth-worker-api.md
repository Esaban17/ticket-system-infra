# ADR 0009 — Identidad del worker hacia la API (worker → API)

**Fecha:** 2026-06-09
**Estado:** Aceptado
**Owners:** Estuardo (BL-130, infra) · Estuardo (BL-040, lado API)
**Cierra:** Q9
**Items relacionados:** BL-130, BL-040, BL-131 (provisioning de claves), BL-041 (middleware)

---

## Contexto

El sistema de tickets tiene workers asíncronos (Lambda, disparados por SQS /
EventBridge Scheduler) que necesitan **escribir de vuelta en el dominio**:
marcar SLA vencido, registrar resultados de escalamiento, anotar el envío de
notificaciones, etc. La política de arquitectura del proyecto (Q-NET-4, D-004)
mantiene la **API como única puerta de escritura** sobre RDS — los pods de la
API viven en subnets privadas detrás del ALB Ingress y son el único componente
con credenciales de BD.

Eso obliga a responder Q9: **¿cómo prueba un worker su identidad ante la API**
cuando la llama, de forma que la API distinga un request legítimo de worker de
un request humano (que llega con JWT de Cognito vía el ALB) y de un request
anónimo?

Restricciones del entorno real ya decidido:

- No hay **API Gateway** delante de la API. El borde es **ALB Ingress** (Q-NET-4).
  El ALB no valida firmas AWS ni JWT por sí mismo; pasa el request al pod.
- El worker es **Lambda** con su propio execution role IAM.
- Ya existe **Secrets Manager** con interface endpoint en la VPC (Q-NET-3), y el
  patrón **IRSA** para que los pods de la API lean secrets se materializa en E5.
- La API es **NestJS 10**; el guard de JWT humano (BL-006/BL-007) ya está
  contemplado y existe el decorador `@Public()` para excepciones.

---

## Opciones consideradas

### Opción A — IAM SigV4 (requests firmados con credenciales AWS)

El worker firma cada request HTTP con su credencial IAM (Signature Version 4,
el mismo mecanismo que usa el SDK de AWS). La API tendría que **validar la
firma**: recalcular el canonical request, resolver la identidad del caller y
verificar que el principal IAM esté autorizado.

| Aspecto | Evaluación |
|---|---|
| Rotación de credenciales | Gratis — el execution role del Lambda usa credenciales STS temporales que AWS rota solas. **Es su mayor ventaja.** |
| Soporte nativo en el borde | **Nulo sin API Gateway.** SigV4 es nativo cuando AWS valida por ti (API Gateway con `AWS_IAM` authorizer); en ALB+EKS hay que **implementar el verificador a mano** o anteponer API Gateway. |
| Costo / topología | Anteponer API Gateway solo para esto añade un componente, latencia y costo, y rompe la simetría "todo el tráfico entra por el ALB". |
| Complejidad en la API | Alta: reimplementar/portar verificación SigV4 en Node, o apoyarse en `sts:GetCallerIdentity`. Frágil y poco idiomático en NestJS. |
| Acoplamiento a AWS | Total: la API queda atada a IAM/STS para auth interna; difícil de testear fuera de AWS. |

### Opción B — Service JWT asimétrico (RS256), elegida

El worker firma un **JWT corto** con una **clave privada RSA** guardada en
Secrets Manager; la API lo verifica con la **clave pública** correspondiente.
La firma es asimétrica (**RS256**): quien verifica nunca posee el secreto de
firma, solo la clave pública.

| Aspecto | Evaluación |
|---|---|
| Soporte en el borde | El JWT viaja como `Authorization: Bearer <token>` igual que el JWT humano; el ALB no necesita configuración especial. **Encaja con la topología existente.** |
| Verificación en la API | Idiomática en NestJS: un guard que carga la clave pública, verifica firma + claims (`iss`, `aud`, `exp`). No requiere SDK de AWS en el path de verificación. |
| Asimetría | La API **solo lee la clave pública**; nunca puede falsificar tokens de worker. Separa el rol de firmante (worker) del de verificador (API) por IAM (BL-131). |
| Rotación | **Manual**, cada 90 días, vía runbook (BL-131). Es el trade-off principal frente a SigV4. |
| Acoplamiento a AWS | Bajo. El estándar JWT/JWKS es testeable en local con un par de claves de prueba; AWS solo provee el almacén de secrets. |

### Opción C — El worker escribe directo en la BD (bypass de la API)

El Lambda se conecta a RDS y escribe sin pasar por la API.

Descartada de entrada: **viola la política de "API como única puerta de
escritura"**, duplica la lógica de dominio (validación de estados, columna
`version` de optimistic locking — Q8), obliga a dar credenciales de BD y
acceso de red a RDS al Lambda, y borra cualquier capa de autorización,
auditoría y reglas de negocio. No se evalúa más allá de mencionarla.

---

## Criterios de decisión

1. **Coherencia con la topología ya mergeada.** El borde es ALB Ingress, no API
   Gateway. La solución no debe exigir un componente nuevo solo para auth interna.
2. **API como única puerta de escritura.** Toda escritura cruza la lógica de
   dominio de la API (estados, RBAC, optimistic locking de Q8).
3. **Mínimo privilegio y separación de roles.** Quien verifica no debe poder
   falsificar. El worker firma; la API solo verifica.
4. **Idiomático y testeable.** Encaja con guards de NestJS y se puede probar
   fuera de AWS con un par de claves de test.
5. **Costo proporcional.** Sin componentes extra; reusa Secrets Manager e IRSA
   que ya están en el roadmap.

---

## Decisión

**Opción B — Service JWT firmado con RS256.**

- El **worker (Lambda)** firma, en cada invocación, un JWT con vida corta usando
  una **clave privada RSA-2048** que lee de Secrets Manager
  (`ticket-system/${env}/worker-jwt-private`). Su execution role IAM **solo**
  puede leer ese secreto (BL-131).
- La **API (NestJS)** verifica el token en un **guard/middleware dedicado**,
  separado del guard de JWT humano, aplicado a los endpoints internos
  (`/internal/v1/*`). Carga la **clave pública** desde Secrets Manager
  (`ticket-system/${env}/worker-jwt-public`) vía IRSA; su rol **no** puede leer
  la clave privada (BL-131).
- La verificación exige: firma RS256 válida + `iss=ticket-system-worker` +
  `aud=ticket-system-api` + `exp` corto (≤ 5 min) + `jti` para trazabilidad.
- Rotación **manual cada 90 días**, documentada en
  `docs/runbooks/rotar-worker-jwt.md` (BL-131). Durante la ventana de rotación
  la API acepta **dos claves públicas** (la vigente y la nueva) para permitir
  solapamiento sin downtime.

Se acepta explícitamente el trade-off de **rotación manual** (que SigV4 daría
gratis) a cambio de no introducir API Gateway ni un verificador SigV4 casero,
y de mantener la simetría de que todo el tráfico entra por el ALB.

---

## Claims del service JWT

```jsonc
// Header
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "worker-jwt-2026-06"   // identifica la clave; habilita rotación con solape
}

// Payload (claims)
{
  "iss": "ticket-system-worker", // emisor: el worker. La API lo exige.
  "aud": "ticket-system-api",    // audiencia: esta API. La API lo exige.
  "sub": "sla-escalation-worker",// qué worker concreto (para logs/auditoría)
  "actor_type": "worker",        // distingue request de worker vs humano en logs (BL-041)
  "iat": 1749470400,             // emitido (epoch s)
  "exp": 1749470700,             // expira: iat + 300 s (5 min máx). Token efímero por request.
  "jti": "b1f2...e9"             // id único del token, para trazabilidad / anti-replay
}
```

Notas:

- **`exp` corto (≤ 5 min):** el token se firma por invocación, no se cachea. Si
  se filtra de un log, su ventana de abuso es mínima. Compensa que no haya
  revocación activa.
- **`iss`/`aud` fijos y verificados:** un JWT humano de Cognito (otro `iss`/`aud`)
  es rechazado por el guard de worker, y viceversa. Esto separa los dos planos
  de identidad.
- **`actor_type=worker`:** lo consume el logging de la API (BL-041) para marcar
  el request como originado por un worker, no por una persona.
- **`kid`:** durante la rotación de 90 días, el header apunta a la clave con la
  que se firmó; la API selecciona la clave pública correcta del set vigente.

---

## Implicaciones en la API (lado BL-040)

La verificación vive en un **guard de NestJS** (`ServiceTokenGuard`),
**independiente** del guard de JWT humano:

- Se aplica solo a los controladores/rutas internas `/internal/v1/*`.
- Un **JWT humano** que llegue a `/internal/...` se rechaza con **403** (su
  `iss`/`aud` no son los del worker).
- Un request **sin token o con firma/claims inválidos** se rechaza con **401**.
- La clave pública se **cachea en memoria** tras leerla de Secrets Manager (con
  refresh ante `kid` desconocido), para no pegarle a Secrets Manager por request.

### Pseudo-código del verificador (NestJS guard)

```typescript
// src/auth/service-token.guard.ts (BL-041)
// Verifica el service JWT del worker. NO sustituye al guard de JWT humano:
// es un guard aparte montado solo sobre /internal/v1/*.

@Injectable()
export class ServiceTokenGuard implements CanActivate {
  // El provider de claves lee la(s) clave(s) pública(s) desde
  // Secrets Manager (vía IRSA) y las cachea por `kid`. Durante la rotación
  // de 90 días puede contener 2 claves (vigente + nueva).
  constructor(private readonly keys: WorkerPublicKeyProvider) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();

    // 1. Extraer el Bearer token. Sin token => 401.
    const token = extractBearer(req.headers['authorization']);
    if (!token) throw new UnauthorizedException('falta service token');

    // 2. Seleccionar la clave pública por `kid` del header (habilita rotación).
    const { kid } = decodeHeader(token);
    const publicKey = await this.keys.getByKid(kid); // refresca desde Secrets si kid no está
    if (!publicKey) throw new UnauthorizedException('kid desconocido');

    // 3. Verificar firma RS256 + claims obligatorios en un solo paso.
    let claims;
    try {
      claims = verifyJwt(token, publicKey, {
        algorithms: ['RS256'],            // jamás aceptar 'none' ni HS*
        issuer: 'ticket-system-worker',   // iss exacto
        audience: 'ticket-system-api',    // aud exacto
        maxAge: '5m',                     // refuerza exp corto
        clockTolerance: 30,               // 30 s de skew
      });
    } catch {
      throw new UnauthorizedException('service token inválido o expirado'); // 401
    }

    // 4. Defensa en profundidad: este endpoint es SOLO para workers.
    //    Un JWT humano (otro iss/aud) ya falló en el paso 3; si algo con
    //    actor_type != 'worker' llegara hasta aquí, se rechaza con 403.
    if (claims.actor_type !== 'worker') {
      throw new ForbiddenException('endpoint reservado a workers'); // 403
    }

    // 5. Adjuntar la identidad del worker al request para logging/auditoría.
    //    El logger marca el request con actor_type=worker (BL-041).
    req.actor = { type: 'worker', sub: claims.sub, jti: claims.jti };
    return true;
  }
}
```

Puntos no negociables del verificador:

1. **Fijar `algorithms: ['RS256']`.** Nunca dejar que el header `alg` decida el
   algoritmo: bloquea el ataque `alg: none` y la confusión RS256→HS256 (usar la
   clave pública como secreto HMAC).
2. **Verificar `iss` y `aud` explícitamente**, no solo la firma. La firma prueba
   "lo firmó quien tiene la privada"; `iss`/`aud` prueban "es para esta API".
3. **`exp` corto + `clockTolerance` mínimo.** El token es por-request.
4. **Clave pública cacheada**, refrescada por `kid` desconocido — soporta la
   rotación con solape sin reiniciar el pod.

---

## Consecuencias

✅ **Positivas**

- La API sigue siendo la **única puerta de escritura**; el worker no toca RDS.
- **Cero componentes nuevos:** no hay API Gateway ni verificador SigV4 casero.
  El token entra por el ALB como cualquier `Authorization: Bearer`.
- **Separación de roles por IAM** (BL-131): el worker firma (lee la privada), la
  API verifica (lee la pública). Ninguno puede asumir el rol del otro.
- **Testeable fuera de AWS:** un par de claves de test reproduce todo el flujo.
- **Logs distinguen worker de humano** (`actor_type=worker`), habilitando
  auditoría (BL-041).
- Cierra **Q9** con una decisión coherente con D-004 y Q-NET-4.

⚠️ **Negativas / trade-offs aceptados**

- **Rotación manual cada 90 días** (SigV4 la daría gratis con STS). Mitigado con
  runbook + tags `rotation=manual`/`expiry=<fecha>` en los secrets (BL-131) y
  set de **dos claves públicas** durante la ventana de rotación.
- **Sin revocación activa de un token ya emitido.** Mitigado por `exp ≤ 5 min`:
  la ventana de abuso de un token filtrado es mínima.
- **La API depende de Secrets Manager para arrancar el guard** (leer la pública).
  Mitigado con cache en memoria + el interface endpoint de Secrets Manager ya en
  la VPC (Q-NET-3); un fallo transitorio no tumba requests ya verificados.
- **Responsabilidad de no romper la verificación:** fijar `algorithms` y validar
  `iss`/`aud` es obligatorio; un guard mal escrito reintroduciría `alg:none`.
  Cubierto por los tests de los 3 casos de BL-041 (worker válido / JWT humano 403
  / sin auth 401).

---

## Referencias

- `docs/preguntas-abiertas.md` — Q9 (cerrada por este ADR).
- `docs/backlog.md` — EP-17, BL-130 (RFC infra), BL-040 (lado API), BL-131
  (provisioning de claves), BL-041 (middleware de verificación).
- `docs/decisiones.md` — D-004 (red: ALB Ingress como borde, sin API Gateway).
- Q-NET-3 (Secrets Manager con interface endpoint), Q-NET-4 (exposición de pods
  vía ALB) en `docs/preguntas-abiertas.md`.
- Q8 (optimistic locking con columna `version`) — razón por la que la escritura
  debe cruzar la lógica de la API y no ir directa a RDS.
- Implementación pendiente: `docs/runbooks/rotar-worker-jwt.md` (BL-131) y guard
  `ServiceTokenGuard` en `app/api` (BL-041).
