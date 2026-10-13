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

// U4 (gateway) — Casos límite de la API key
describe('ApiKeyGuard: casos límite', () => {
  const guard = new ApiKeyGuard({ get: () => KEY } as unknown as ConfigService<
    any,
    true
  >);

  it('U4-G05 usa el primer valor si el encabezado llega repetido', () => {
    expect(guard.canActivate(ctx({ 'x-api-key': [KEY, 'otra'] }))).toBe(true);
    expect(() =>
      guard.canActivate(ctx({ 'x-api-key': ['otra', KEY] })),
    ).toThrow(UnauthorizedException);
  });

  it('U4-G06 arreglo vacío se trata como ausente', () => {
    expect(() => guard.canActivate(ctx({ 'x-api-key': [] }))).toThrow(
      UnauthorizedException,
    );
  });

  it.each([
    ['con espacios alrededor', ` ${KEY} `],
    ['en mayúsculas', KEY.toUpperCase()],
    ['con sufijo', `${KEY}x`],
    ['muy larga (1 MB)', 'a'.repeat(1_000_000)],
    ['unicode', 'clavé-secreta-ñ-🎣-123456'],
  ])('U4-G07 rechaza key %s sin lanzar un error distinto', (_, value) => {
    // Con hashes de igual longitud timingSafeEqual nunca lanza RangeError
    expect(() => guard.canActivate(ctx({ 'x-api-key': value }))).toThrow(
      UnauthorizedException,
    );
  });

  it('U5-G18 el 401 tiene formato ApiError y no revela la key esperada', () => {
    try {
      guard.canActivate(ctx({ 'x-api-key': 'incorrecta' }));
      expect.unreachable();
    } catch (e) {
      const ex = e as UnauthorizedException;
      expect(ex.getStatus()).toBe(401);
      expect(ex.getResponse()).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'API key inválida o ausente' },
      });
      expect(JSON.stringify(ex.getResponse())).not.toContain(KEY);
    }
  });

  it('U4-G08 la ausencia y la key incorrecta dan exactamente el mismo error', () => {
    const resp = (h: Record<string, string>) => {
      try {
        guard.canActivate(ctx(h));
      } catch (e) {
        return (e as UnauthorizedException).getResponse();
      }
    };
    expect(resp({})).toEqual(resp({ 'x-api-key': 'mala' }));
  });

  it('U4-G09 compara con timingSafeEqual sobre digests (no con ===)', async () => {
    vi.resetModules();
    const spy = vi.fn((a: Buffer, b: Buffer) => a.equals(b));
    vi.doMock('node:crypto', async (orig) => ({
      ...(await orig<typeof import('node:crypto')>()),
      timingSafeEqual: spy,
    }));
    const { ApiKeyGuard: Guard } = await import('./api-key.guard.js');
    const g = new Guard({ get: () => KEY } as unknown as ConfigService<
      any,
      true
    >);
    g.canActivate(ctx({ 'x-api-key': KEY }));
    expect(spy).toHaveBeenCalledOnce();
    const [a, b] = spy.mock.calls[0];
    expect(a).toHaveLength(32); // sha256: longitud fija, sin filtrar la longitud real
    expect(b).toHaveLength(32);
    // Sin header no se llega a comparar
    expect(() => g.canActivate(ctx({}))).toThrow(UnauthorizedException);
    expect(spy).toHaveBeenCalledOnce();
    vi.doUnmock('node:crypto');
    vi.resetModules();
  });
});
