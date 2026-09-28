import {
  BadRequestException,
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
