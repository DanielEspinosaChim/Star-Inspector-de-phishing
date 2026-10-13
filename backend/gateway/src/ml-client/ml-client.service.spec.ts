import {
  BadRequestException,
  HttpException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MlClientService } from './ml-client.service.js';

const config = {
  get: (key: string) => (key === 'ML_SERVICE_URL' ? 'http://ml.test' : 50),
} as unknown as ConfigService<any, true>;

const PRED = {
  label: 'PHISHING',
  confidence: 0.99,
  probabilities: { ham: 0.01, phishing: 0.99 },
  model: 'bert-base-uncased-phishing',
  truncated: false,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('MlClientService', () => {
  const fetchMock = vi.fn();
  const service = new MlClientService(config);

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it('reenvía el email y el request id a Flask', async () => {
    fetchMock.mockResolvedValue(json(200, PRED));
    await expect(
      service.predict({ subject: 's', body: 'b' }, 'req-1'),
    ).resolves.toEqual(PRED);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ml.test/predict');
    expect(JSON.parse(init.body)).toEqual({ subject: 's', body: 'b' });
    expect(init.headers['x-request-id']).toBe('req-1');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('desempaqueta los resultados del batch', async () => {
    fetchMock.mockResolvedValue(json(200, { results: [PRED, PRED] }));
    await expect(
      service.predictBatch([{ body: 'a' }, { body: 'b' }]),
    ).resolves.toHaveLength(2);
  });

  it('timeout → 503 ML_SERVICE_UNAVAILABLE', async () => {
    fetchMock.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    await expect(service.predict({ body: 'b' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('conexión rechazada → 503', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const err = await service.predict({ body: 'b' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as ServiceUnavailableException).getResponse()).toEqual({
      error: {
        code: 'ML_SERVICE_UNAVAILABLE',
        message: 'El servicio de inferencia no está disponible',
      },
    });
  });

  it('500 de Flask → 503', async () => {
    fetchMock.mockResolvedValue(
      json(500, { error: { code: 'INTERNAL_ERROR', message: 'x' } }),
    );
    await expect(service.predict({ body: 'b' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('400 de Flask → 400 VALIDATION_ERROR', async () => {
    fetchMock.mockResolvedValue(
      json(400, {
        error: { code: 'VALIDATION_ERROR', message: 'body es requerido' },
      }),
    );
    await expect(service.predict({ body: 'b' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('health devuelve null si Flask está caído', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(service.health()).resolves.toBeNull();
  });
});

// Ramas adicionales: respuestas de error de Flask, health, privacidad en logs
describe('MlClientService: casos adicionales', () => {
  const fetchMock = vi.fn();
  const service = new MlClientService(config);
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  const SENTINELA = 'CONTENIDO_EMAIL_SENTINELA';

  beforeEach(() => {
    fetchMock.mockReset();
    warn.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterAll(() => vi.unstubAllGlobals());

  it('U5-G35 predict hace POST JSON a /predict sin x-request-id si no hay id', async () => {
    fetchMock.mockResolvedValue(json(200, PRED));
    await service.predict({ subject: 's', body: 'b' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ml.test/predict');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.headers).not.toHaveProperty('x-request-id');
  });

  it('U5-G36 batch envía { emails } a /predict/batch con el request id', async () => {
    fetchMock.mockResolvedValue(json(200, { results: [PRED] }));
    await service.predictBatch([{ subject: 's', body: 'b' }], 'rid');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ml.test/predict/batch');
    expect(JSON.parse(init.body)).toEqual({
      emails: [{ subject: 's', body: 'b' }],
    });
    expect(init.headers['x-request-id']).toBe('rid');
  });

  it('U5-G37 400 de Flask conserva el mensaje de Flask', async () => {
    fetchMock.mockResolvedValue(
      json(400, {
        error: { code: 'VALIDATION_ERROR', message: 'body requerido' },
      }),
    );
    const err = await service.predict({ body: 'b' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'body requerido' },
    });
  });

  it.each([
    ['sin JSON', () => new Response('<html>', { status: 400 })],
    ['JSON sin error', () => json(400, { otro: 1 })],
    ['JSON null', () => json(400, null)],
  ])('U5-G38 400 de Flask %s → mensaje genérico', async (_, mk) => {
    fetchMock.mockResolvedValue(mk());
    const err = await service.predict({ body: 'b' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Solicitud inválida' },
    });
  });

  it.each([401, 404, 413, 422, 429])(
    'U5-G39 %i de Flask → 500 INTERNAL_ERROR (no se reenvía)',
    async (status) => {
      fetchMock.mockResolvedValue(json(status, { error: { message: 'x' } }));
      const err = await service.predict({ body: 'b' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(500);
      expect((err as HttpException).getResponse()).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Error interno del servidor',
        },
      });
    },
  );

  it.each([500, 502, 503, 504])('U5-G40 %i de Flask → 503', async (status) => {
    fetchMock.mockResolvedValue(json(status, {}));
    await expect(service.predict({ body: 'b' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('U5-G41 batch propaga el 503 si Flask falla', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(service.predictBatch([{ body: 'b' }])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('U5-G42 los logs de fallo no contienen el contenido del email', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError(`fetch failed ${SENTINELA}`));
    await service
      .predict({ subject: SENTINELA, body: SENTINELA })
      .catch(() => {});
    fetchMock.mockResolvedValueOnce(json(500, { echo: SENTINELA }));
    await service
      .predict({ subject: SENTINELA, body: SENTINELA })
      .catch(() => {});
    fetchMock.mockResolvedValueOnce(json(404, { echo: SENTINELA }));
    await service
      .predict({ subject: SENTINELA, body: SENTINELA })
      .catch(() => {});
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).not.toContain(
      SENTINELA,
    );
  });

  it('U5-G43 el 503 no incluye el mensaje original del error de red', async () => {
    fetchMock.mockRejectedValue(
      new TypeError('connect ECONNREFUSED 127.0.0.1:5000'),
    );
    const err = (await service
      .predict({ body: 'b' })
      .catch((e: unknown) => e)) as ServiceUnavailableException;
    expect(JSON.stringify(err.getResponse())).not.toMatch(
      /ECONNREFUSED|127\.0\.0\.1/,
    );
  });

  it('U5-G44 health ok devuelve el JSON de Flask y usa GET /health con timeout', async () => {
    const h = { status: 'ok', device: 'cpu', model: 'm' };
    fetchMock.mockResolvedValue(json(200, h));
    await expect(service.health()).resolves.toEqual(h);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ml.test/health');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('U5-G45 health con respuesta no ok o JSON inválido → null', async () => {
    fetchMock.mockResolvedValueOnce(json(503, { status: 'loading' }));
    await expect(service.health()).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(new Response('no json', { status: 200 }));
    await expect(service.health()).resolves.toBeNull();
  });

  it('U5-G46 health nunca lanza (timeout)', async () => {
    fetchMock.mockRejectedValue(new DOMException('t', 'TimeoutError'));
    await expect(service.health()).resolves.toBeNull();
  });

  it('U5-G47 health limita su timeout a 3 s aunque ML_TIMEOUT_MS sea mayor', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    const largo = new MlClientService({
      get: (k: string) => (k === 'ML_SERVICE_URL' ? 'http://ml.test' : 60_000),
    } as unknown as ConfigService<any, true>);
    fetchMock.mockResolvedValue(json(200, { status: 'ok' }));
    await largo.health();
    expect(spy).toHaveBeenLastCalledWith(3_000);
    await largo.predict({ body: 'b' }).catch(() => {});
    expect(spy).toHaveBeenLastCalledWith(60_000);
    spy.mockRestore();
  });

  it('U5-G48 un timeout corto en config se respeta en health', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValue(json(200, { status: 'ok' }));
    await service.health(); // ML_TIMEOUT_MS = 50
    expect(spy).toHaveBeenLastCalledWith(50);
    spy.mockRestore();
  });
});
