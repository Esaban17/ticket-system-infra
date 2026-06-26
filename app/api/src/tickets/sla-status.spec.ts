import { computeSlaFields } from './sla-status';

const now = new Date('2026-06-25T12:00:00Z');
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe('computeSlaFields', () => {
  it('null cuando no hay slaDueAt (sin SLA)', () => {
    expect(computeSlaFields(null, now)).toEqual({ slaStatus: null, slaOffByDays: null });
  });

  it('a_tiempo cuando la fecha límite está en el futuro', () => {
    const r = computeSlaFields(days(3), now);
    expect(r.slaStatus).toBe('a_tiempo');
    expect(r.slaOffByDays).toBe(-3); // faltan 3 días
  });

  it('vencido cuando la fecha límite ya pasó', () => {
    const r = computeSlaFields(days(-2), now);
    expect(r.slaStatus).toBe('vencido');
    expect(r.slaOffByDays).toBe(2); // vencido por 2 días
  });

  it('vence hoy → a_tiempo y 0 días si faltan horas', () => {
    const r = computeSlaFields(new Date(now.getTime() + 5 * 3_600_000), now); // +5h
    expect(r.slaStatus).toBe('a_tiempo');
    expect(r.slaOffByDays).toBe(-1); // floor(-5h en días) = -1
  });

  it('justo en la fecha límite → a_tiempo (aún no pasa)', () => {
    const r = computeSlaFields(new Date(now), now);
    expect(r.slaStatus).toBe('a_tiempo');
    expect(r.slaOffByDays).toBe(0);
  });

  it('vencido por horas (medio día) → 0 días', () => {
    const r = computeSlaFields(new Date(now.getTime() - 6 * 3_600_000), now); // -6h
    expect(r.slaStatus).toBe('vencido');
    expect(r.slaOffByDays).toBe(0);
  });
});
