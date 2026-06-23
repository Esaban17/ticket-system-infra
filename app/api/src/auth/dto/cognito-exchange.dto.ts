import { IsString, MinLength } from 'class-validator';

/** Body de POST /v1/auth/cognito/exchange — el authorization code del Hosted UI. */
export class CognitoExchangeDto {
  @IsString()
  @MinLength(1, { message: 'code es requerido' })
  code!: string;

  // Debe coincidir EXACTO con el redirect_uri usado en el authorize (Cognito lo valida).
  @IsString()
  @MinLength(1, { message: 'redirectUri es requerido' })
  redirectUri!: string;
}
