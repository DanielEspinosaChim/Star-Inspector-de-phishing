import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { API_KEY, FakeMlClient, createTestApp, setTestEnv } from './helpers.js';

setTestEnv();

describe('API /api/v1 (e2e, servicio ML simulado)', () => {
  let app: NestExpressApplication;
  const ml = new FakeMlClient();

  beforeAll(async () => {
    app = await createTestApp(ml);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    ml.down = false;
    ml.calls = 0;
  });

  const post = (path: string, body: object, key: string | null = API_KEY) => {
    const req = request(app.getHttpServer()).post(`/api/v1${path}`);
    if (key !== null) req.set('x-api-key', key);
    return req.send(body);
  };

  describe('POST /predict', () => {
    it('200 con el contrato completo', async () => {
      const res = await post('/predict', {
        subject: 'Aviso',
        body: 'phishing aquí',
      }).expect(200);
      expect(res.body).toMatchObject({
        label: 'PHISHING',
        model: 'bert-base-uncased-phishing',
        truncated: false,
      });
      expect(res.body.confidence).toBeGreaterThanOrEqual(0);
      expect(res.body.confidence).toBeLessThanOrEqual(1);
      expect(
        res.body.probabilities.ham + res.body.probabilities.phishing,
      ).toBeCloseTo(1, 4);
      expect(typeof res.body.latencyMs).toBe('number');
      expect(res.headers['x-request-id']).toBeTruthy();
    });

    it.each([
      ['body ausente', {}],
      ['body vacío', { body: '' }],
      ['body > 20000', { body: 'x'.repeat(20_001) }],
      ['subject > 1000', { body: 'ok', subject: 's'.repeat(1_001) }],
      ['campo extra', { body: 'ok', admin: true }],
    ])('400 si %s, sin llamar a Flask', async (_, body) => {
      const res = await post('/predict', body).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(ml.calls).toBe(0);
    });

    it('400 con JSON malformado', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/predict')
        .set('x-api-key', API_KEY)
        .set('content-type', 'application/json')
        .send('{"body": ')
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('401 sin API key o con una incorrecta', async () => {
      const sin = await post('/predict', { body: 'hola' }, null).expect(401);
      expect(sin.body.error.code).toBe('UNAUTHORIZED');
      await post('/predict', { body: 'hola' }, 'incorrecta').expect(401);
      expect(ml.calls).toBe(0);
    });

    it('503 si el servicio ML está caído, sin stack trace', async () => {
      ml.down = true;
      const res = await post('/predict', { body: 'hola' }).expect(503);
      expect(res.body).toEqual({
        error: {
          code: 'ML_SERVICE_UNAVAILABLE',
          message: 'El servicio de inferencia no está disponible',
        },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/at |\.ts|node_modules/);
    });
  });

  describe('POST /predict/batch', () => {
    it('200 y mantiene el orden', async () => {
      const res = await post('/predict/batch', {
        emails: [{ body: 'phish' }, { body: 'hola' }, { body: 'PHISH' }],
      }).expect(200);
      expect(res.body.results.map((r: { label: string }) => r.label)).toEqual([
        'PHISHING',
        'HAM',
        'PHISHING',
      ]);
    });

    it('400 con 0 o 33 emails', async () => {
      await post('/predict/batch', { emails: [] }).expect(400);
      await post('/predict/batch', {
        emails: Array.from({ length: 33 }, () => ({ body: 'x' })),
      }).expect(400);
      expect(ml.calls).toBe(0);
    });

    it('401 sin API key', async () => {
      await post('/predict/batch', { emails: [{ body: 'x' }] }, null).expect(
        401,
      );
    });
  });

  describe('GET /health', () => {
    it('200 sin API key, con ML arriba', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);
      expect(res.body).toEqual({
        gateway: 'ok',
        mlService: 'ok',
        device: 'cpu',
      });
    });

    it('reporta mlService down sin caerse', async () => {
      ml.down = true;
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);
      expect(res.body).toEqual({
        gateway: 'ok',
        mlService: 'down',
        device: null,
      });
    });
  });

  it('Swagger disponible en /docs en development', async () => {
    await request(app.getHttpServer()).get('/docs').expect(200);
  });

  it('404 con formato uniforme', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/nada')
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
