// U5 (gateway) — Formato uniforme de errores { error: { code, message } }
import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { apiError } from './api-error.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

function run(exception: unknown) {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return {
    status: res.status.mock.calls[0][0],
    body: res.json.mock.calls[0][0],
  };
}

describe('HttpExceptionFilter', () => {
  it('U5-G06 respeta un cuerpo que ya tiene formato ApiError', () => {
    const body = apiError('VALIDATION_ERROR', 'body: matches');
    expect(run(new BadRequestException(body))).toEqual({ status: 400, body });
  });

  it.each([
    ['U5-G07', new UnauthorizedException(), 401, 'UNAUTHORIZED'],
    ['U5-G08', new NotFoundException(), 404, 'NOT_FOUND'],
    ['U5-G09', new PayloadTooLargeException(), 413, 'PAYLOAD_TOO_LARGE'],
    [
      'U5-G10',
      new ServiceUnavailableException(),
      503,
      'ML_SERVICE_UNAVAILABLE',
    ],
    ['U5-G11', new HttpException('raro', 418), 418, 'HTTP_ERROR'],
  ])('%s mapea %s a su código', (_, exc, status, code) => {
    const out = run(exc);
    expect(out.status).toBe(status);
    expect(out.body.error.code).toBe(code);
    expect(typeof out.body.error.message).toBe('string');
  });

  it('U5-G12 rate limit → 429 RATE_LIMITED', () => {
    expect(run(new ThrottlerException())).toEqual({
      status: 429,
      body: apiError(
        'RATE_LIMITED',
        'Demasiadas solicitudes, intenta más tarde',
      ),
    });
  });

  it('U5-G13 5xx sin formato no expone el mensaje original', () => {
    const out = run(new HttpException('detalle /ruta/interna', 502));
    expect(out.body.error.message).toBe('Error');
  });

  it('U5-G14 error no HTTP → 500 sin traza ni mensaje interno', () => {
    const out = run(new Error('texto del email SECRETO'));
    expect(out).toEqual({
      status: 500,
      body: apiError('INTERNAL_ERROR', 'Error interno del servidor'),
    });
    expect(JSON.stringify(out.body)).not.toContain('SECRETO');
  });
});

// Ramas adicionales del filtro y no filtrado de información sensible
describe('HttpExceptionFilter: ramas adicionales', () => {
  const error = vi
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => {});
  afterEach(() => error.mockClear());

  it('U5-G19 BadRequest sin formato usa mensaje fijo (no repite el original)', () => {
    const out = run(new BadRequestException('mensaje corto'));
    expect(out).toEqual({
      status: 400,
      body: apiError('VALIDATION_ERROR', 'Solicitud inválida'),
    });
  });

  it('U5-G20 un 5xx con ApiError propio se respeta tal cual', () => {
    const body = apiError('ML_SERVICE_UNAVAILABLE', 'no disponible');
    expect(run(new ServiceUnavailableException(body))).toEqual({
      status: 503,
      body,
    });
  });

  it.each([
    ['error sin string', { error: { code: 42 } }],
    ['error null', { error: null }],
    ['sin clave error', { message: 'x' }],
  ])('U5-G21 cuerpo %s no se considera ApiError', (_, cuerpo) => {
    const out = run(new HttpException(cuerpo, 400));
    expect(out.body.error.code).toBe('VALIDATION_ERROR');
    expect(typeof out.body.error.message).toBe('string');
  });

  it('U5-G22 5xx sin formato (500, 502, 504) → mensaje genérico', () => {
    for (const status of [500, 502, 504]) {
      const out = run(new HttpException('ruta C:\\interna\\x.ts', status));
      expect(out.status).toBe(status);
      expect(out.body.error.message).toBe('Error');
      expect(JSON.stringify(out.body)).not.toContain('interna');
    }
  });

  it('U5-G23 el cuerpo de error solo tiene error.code y error.message', () => {
    const casos = [
      new Error('boom'),
      new HttpException('x', 400),
      new ThrottlerException(),
    ];
    for (const c of casos) {
      const { body } = run(c);
      expect(Object.keys(body)).toEqual(['error']);
      expect(Object.keys(body.error).sort()).toEqual(['code', 'message']);
      expect(JSON.stringify(body)).not.toMatch(/stack|\.ts:\d+/);
    }
  });

  it('U5-G24 un throw no-Error → 500 y se loguea solo el tipo', () => {
    expect(run('SECRETO_DEL_EMAIL').status).toBe(500);
    expect(error.mock.calls[0][0]).toBe('error interno: string');
    run({ body: 'SECRETO_DEL_EMAIL' });
    expect(error.mock.calls[1][0]).toBe('error interno: object');
    run(undefined);
    expect(error.mock.calls[2][0]).toBe('error interno: undefined');
  });

  it('U5-G25 el log del error interno solo trae el nombre, no mensaje ni traza', () => {
    class MiError extends Error {
      override name = 'MiError';
    }
    run(new MiError('contenido SECRETO_DEL_EMAIL'));
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]).toEqual(['error interno: MiError']);
  });

  it('U5-G26 los errores HTTP controlados no se loguean como error', () => {
    run(new UnauthorizedException());
    run(new ThrottlerException());
    expect(error).not.toHaveBeenCalled();
  });
});
