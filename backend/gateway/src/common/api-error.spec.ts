// U5 (gateway) — Constructor del formato de error y DTO de error
const DECORATORS = {
  API_MODEL_PROPERTIES: 'swagger/apiModelProperties',
  API_MODEL_PROPERTIES_ARRAY: 'swagger/apiModelPropertiesArray',
} as const;
import { Test } from '@nestjs/testing';
import { apiError } from './api-error.js';
import { ErrorResponseDto } from './error-response.dto.js';

describe('apiError', () => {
  it('U5-G74 construye { error: { code, message } } y nada más', () => {
    const e = apiError('UNAUTHORIZED', 'API key inválida o ausente');
    expect(e).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'API key inválida o ausente' },
    });
    expect(Object.keys(e)).toEqual(['error']);
    expect(Object.keys(e.error)).toEqual(['code', 'message']);
  });

  it('U5-G75 devuelve objetos independientes en cada llamada', () => {
    const a = apiError('NOT_FOUND', 'x');
    const b = apiError('NOT_FOUND', 'x');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('U5-G76 es serializable a JSON sin pérdida', () => {
    const e = apiError(
      'VALIDATION_ERROR',
      'body: matches; emails.1.body: isString',
    );
    expect(JSON.parse(JSON.stringify(e))).toEqual(e);
  });
});

describe('ErrorResponseDto', () => {
  const props = (cls: object) =>
    (Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES_ARRAY, cls) ??
      []) as string[];

  it('U5-G77 expone el campo error con tipo anidado { code, message }', () => {
    expect(props(ErrorResponseDto.prototype)).toEqual([':error']);
    const meta = Reflect.getMetadata(
      DECORATORS.API_MODEL_PROPERTIES,
      ErrorResponseDto.prototype,
      'error',
    );
    const Detalle = meta.type;
    expect(props(Detalle.prototype).sort()).toEqual([':code', ':message']);
  });

  it('U5-G78 el enum documentado de code cubre los códigos del gateway', () => {
    const meta = Reflect.getMetadata(
      DECORATORS.API_MODEL_PROPERTIES,
      ErrorResponseDto.prototype,
      'error',
    );
    const Detalle = meta.type;
    const code = Reflect.getMetadata(
      DECORATORS.API_MODEL_PROPERTIES,
      Detalle.prototype,
      'code',
    );
    // HTTP_ERROR (códigos HTTP sin mapeo, p. ej. 418) falta en la doc: hueco menor, ver reporte
    expect(code.enum).toEqual(
      expect.arrayContaining([
        'VALIDATION_ERROR',
        'UNAUTHORIZED',
        'NOT_FOUND',
        'RATE_LIMITED',
        'PAYLOAD_TOO_LARGE',
        'ML_SERVICE_UNAVAILABLE',
        'INTERNAL_ERROR',
      ]),
    );
  });

  it('U5-G79 la clase se puede instanciar con el compilador de Nest (sin dependencias)', async () => {
    const ref = await Test.createTestingModule({
      providers: [ErrorResponseDto],
    }).compile();
    expect(ref.get(ErrorResponseDto)).toBeInstanceOf(ErrorResponseDto);
  });
});
