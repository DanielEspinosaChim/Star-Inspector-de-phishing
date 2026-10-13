// U4/U5 (gateway) — Request id y logs sin contenido del email
import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import {
  LoggingInterceptor,
  REQUEST_ID_HEADER,
} from './logging.interceptor.js';

const MARCADOR = 'MARCADOR_EMAIL_42';

function ctx(headers: Record<string, string>) {
  const req = {
    method: 'POST',
    path: '/api/v1/predict',
    headers: { ...headers },
    body: { subject: MARCADOR, body: MARCADOR },
  };
  const res = { statusCode: 200, setHeader: vi.fn() };
  const context = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { req, res, context };
}

const next: CallHandler = { handle: () => of({ ok: true }) };

describe('LoggingInterceptor', () => {
  const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  afterEach(() => log.mockClear());

  it('U4-G01 conserva un x-request-id válido y lo devuelve', async () => {
    const { req, res, context } = ctx({ [REQUEST_ID_HEADER]: 'prueba-001' });
    await lastValueFrom(new LoggingInterceptor().intercept(context, next));
    expect(req.headers[REQUEST_ID_HEADER]).toBe('prueba-001');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'prueba-001');
  });

  it.each([
    ['ausente', undefined],
    ['con espacios', 'a b'],
    ['más de 64', 'x'.repeat(65)],
    ['inyección', '<script>'],
  ])('U4-G02 reemplaza un request id %s por un UUID', async (_, value) => {
    const { req, context } = ctx(value ? { [REQUEST_ID_HEADER]: value } : {});
    await lastValueFrom(new LoggingInterceptor().intercept(context, next));
    expect(req.headers[REQUEST_ID_HEADER]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('U5-G15 el log trae metadatos y nunca el cuerpo del email', async () => {
    const { context } = ctx({ [REQUEST_ID_HEADER]: 'r1' });
    await lastValueFrom(new LoggingInterceptor().intercept(context, next));
    const linea = String(log.mock.calls[0][0]);
    expect(linea).toMatch(
      /req=r1 POST \/api\/v1\/predict status=200 .*latencia_ms=/,
    );
    expect(linea).not.toContain(MARCADOR);
  });
});

// Casos adicionales de request id y de contenido del log
describe('LoggingInterceptor: casos adicionales', () => {
  const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  afterEach(() => log.mockClear());

  const run = (headers: Record<string, unknown>, handler = next) => {
    const c = ctx({});
    c.req.headers = { ...headers } as Record<string, string>;
    return {
      ...c,
      out: lastValueFrom(
        new LoggingInterceptor().intercept(c.context, handler),
      ),
    };
  };

  it.each(['a', 'x'.repeat(64), 'a-b_C-9', '0123456789'])(
    'U4-G10 acepta el request id válido "%s"',
    async (id) => {
      const { req, out } = run({ [REQUEST_ID_HEADER]: id });
      await out;
      expect(req.headers[REQUEST_ID_HEADER]).toBe(id);
    },
  );

  it.each([
    ['vacío', ''],
    ['con salto de línea final', 'abc\n'],
    ['con salto de línea (inyección de log)', 'a\nreq=falso'],
    ['con punto', 'a.b'],
    ['unicode', 'ñandú'],
    ['arreglo', ['uno', 'dos']],
  ])('U4-G11 reemplaza el request id %s', async (_, value) => {
    const { req, res, out } = run({ [REQUEST_ID_HEADER]: value });
    await out;
    const id = req.headers[REQUEST_ID_HEADER] as string;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, id);
  });

  it('U4-G12 genera un id distinto en cada request', async () => {
    const a = run({});
    const b = run({});
    await Promise.all([a.out, b.out]);
    expect(a.req.headers[REQUEST_ID_HEADER]).not.toBe(
      b.req.headers[REQUEST_ID_HEADER],
    );
  });

  it('U5-G27 loguea bytes del content-length (o 0) y el status final', async () => {
    const c1 = ctx({ [REQUEST_ID_HEADER]: 'r', 'content-length': '123' });
    const crea: CallHandler = {
      handle: () => {
        c1.res.statusCode = 201; // el status se lee al terminar, no al empezar
        return of(null);
      },
    };
    await lastValueFrom(new LoggingInterceptor().intercept(c1.context, crea));
    expect(String(log.mock.calls[0][0])).toMatch(/status=201 bytes=123 /);
    const c2 = run({ [REQUEST_ID_HEADER]: 'r' });
    await c2.out;
    expect(String(log.mock.calls[1][0])).toMatch(/bytes=0 /);
  });

  it('U5-G28 loguea también cuando el handler falla (finalize)', async () => {
    const falla: CallHandler = {
      handle: () => throwError(() => new Error('x')),
    };
    const { out } = run({ [REQUEST_ID_HEADER]: 'r' }, falla);
    await expect(out).rejects.toThrow('x');
    expect(log).toHaveBeenCalledOnce();
  });

  it('U5-G29 no loguea la API key ni otros encabezados ni el cuerpo', async () => {
    const { out } = run({
      [REQUEST_ID_HEADER]: 'r',
      'x-api-key': 'API_KEY_SECRETA_42',
      authorization: 'Bearer TOKEN_42',
    });
    await out;
    const salida = log.mock.calls.map((c) => String(c[0])).join('\n');
    for (const secreto of ['API_KEY_SECRETA_42', 'TOKEN_42', MARCADOR]) {
      expect(salida).not.toContain(secreto);
    }
  });

  it('U5-G30 el interceptor no altera la respuesta', async () => {
    const { out } = run({}, { handle: () => of({ a: 1 }) });
    await expect(out).resolves.toEqual({ a: 1 });
  });

  it('U4-G13 no loguea hasta que el observable termina', () => {
    const c = ctx({});
    new LoggingInterceptor().intercept(c.context, next); // sin suscribirse
    expect(log).not.toHaveBeenCalled();
  });
});
