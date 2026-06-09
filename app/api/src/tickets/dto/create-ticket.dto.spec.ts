import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CreateTicketDto } from './create-ticket.dto';

function errorsFor(obj: Record<string, unknown>): string[] {
  const dto = plainToInstance(CreateTicketDto, obj);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property);
}

const valid = {
  type: 'incidente',
  title: 'No arranca el servicio de pagos',
  description: 'El servicio de pagos devuelve 500 desde las 9am, afecta a todos los clientes.',
  severity: 4,
  impact: 4,
};

describe('CreateTicketDto', () => {
  it('acepta un payload válido', () => {
    expect(errorsFor(valid)).toEqual([]);
  });

  it('rechaza title < 5 chars', () => {
    expect(errorsFor({ ...valid, title: 'abc' })).toContain('title');
  });

  it('rechaza title que queda vacío tras trim', () => {
    expect(errorsFor({ ...valid, title: '     ' })).toContain('title');
  });

  it('rechaza strings disfrazados de vacío en description ("n/a")', () => {
    expect(errorsFor({ ...valid, description: 'n/a' })).toContain('description');
  });

  it('rechaza description > 5000', () => {
    expect(errorsFor({ ...valid, description: 'a'.repeat(5001) })).toContain('description');
  });

  it('rechaza type fuera de la lista', () => {
    expect(errorsFor({ ...valid, type: 'pregunta' })).toContain('type');
  });

  it('rechaza severity fuera de 1..4', () => {
    expect(errorsFor({ ...valid, severity: 5 })).toContain('severity');
    expect(errorsFor({ ...valid, impact: 0 })).toContain('impact');
  });

  it('rechaza attachments que no son UUID', () => {
    expect(errorsFor({ ...valid, attachments: ['no-uuid'] })).toContain('attachments');
  });
});
