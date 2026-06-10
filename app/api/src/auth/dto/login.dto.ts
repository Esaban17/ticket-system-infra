import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

/** POST /v1/auth/login (FE-02). */
export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'email debe ser un correo válido' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'password no puede estar vacío' })
  password!: string;
}
