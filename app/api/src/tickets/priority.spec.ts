import { Priority } from '@prisma/client';

import { calculatePriority } from './priority';

describe('calculatePriority', () => {
  // Tabla parametrizada de las 16 combinaciones (severity × impact, 1..4).
  const cases: Array<[number, number, Priority]> = [
    [1, 1, Priority.baja],
    [1, 2, Priority.baja],
    [1, 3, Priority.media],
    [1, 4, Priority.alta],
    [2, 1, Priority.baja],
    [2, 2, Priority.media],
    [2, 3, Priority.alta],
    [2, 4, Priority.alta],
    [3, 1, Priority.media],
    [3, 2, Priority.alta],
    [3, 3, Priority.alta],
    [3, 4, Priority.critica],
    [4, 1, Priority.alta],
    [4, 2, Priority.alta],
    [4, 3, Priority.critica],
    [4, 4, Priority.critica],
  ];

  it.each(cases)('severity=%i impact=%i → %s', (sev, imp, expected) => {
    expect(calculatePriority(sev, imp)).toBe(expected);
  });

  it('es pura (misma entrada, misma salida)', () => {
    expect(calculatePriority(3, 4)).toBe(calculatePriority(3, 4));
  });

  it('rechaza valores fuera de 1..4', () => {
    expect(() => calculatePriority(0, 2)).toThrow(RangeError);
    expect(() => calculatePriority(2, 5)).toThrow(RangeError);
    expect(() => calculatePriority(2.5, 2)).toThrow(RangeError);
  });
});
