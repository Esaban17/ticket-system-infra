import { SetMetadata } from '@nestjs/common';
// Importar desde el barrel (index.ts) para ejercitar ese módulo también
import { IS_PUBLIC_KEY, Public } from './index';

// SetMetadata devuelve un decorador; queremos verificar que se llama correctamente.
jest.mock('@nestjs/common', () => ({
  ...jest.requireActual('@nestjs/common'),
  SetMetadata: jest.fn().mockReturnValue(() => undefined),
}));

describe('public.decorator', () => {
  describe('IS_PUBLIC_KEY', () => {
    it('tiene el valor exacto "isPublic"', () => {
      expect(IS_PUBLIC_KEY).toBe('isPublic');
    });
  });

  describe('@Public()', () => {
    it('llama a SetMetadata con IS_PUBLIC_KEY y true', () => {
      Public();
      expect(SetMetadata).toHaveBeenCalledWith(IS_PUBLIC_KEY, true);
    });

    it('llama a SetMetadata con el valor booleano true (no truthy)', () => {
      (SetMetadata as jest.Mock).mockClear();
      Public();
      const [, value] = (SetMetadata as jest.Mock).mock.calls[0];
      expect(value).toBe(true);
      expect(typeof value).toBe('boolean');
    });

    it('retorna el resultado de SetMetadata (el decorador)', () => {
      const mockDecorator = jest.fn();
      (SetMetadata as jest.Mock).mockReturnValueOnce(mockDecorator);
      const result = Public();
      expect(result).toBe(mockDecorator);
    });
  });
});
