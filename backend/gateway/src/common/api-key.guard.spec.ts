import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeyGuard } from './api-key.guard.js';

const KEY = 'clave-secreta-de-prueba-123456';

function ctx(headers: Record<string, string | string[]>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  const guard = new ApiKeyGuard({ get: () => KEY } as unknown as ConfigService<
    any,
    true
  >);

  it('acepta la key correcta', () => {
    expect(guard.canActivate(ctx({ 'x-api-key': KEY }))).toBe(true);
  });

  it.each([
    ['ausente', {}],
    ['vacía', { 'x-api-key': '' }],
    ['incorrecta', { 'x-api-key': 'otra-clave' }],
    ['prefijo', { 'x-api-key': KEY.slice(0, -1) }],
  ])('rechaza key %s', (_, headers) => {
    expect(() => guard.canActivate(ctx(headers))).toThrow(
      UnauthorizedException,
    );
  });
});
