/**
 * E2E contra el servicio Flask REAL (modelo BERT en CPU).
 * Requiere `python wsgi.py` corriendo en backend/ml-service; si no responde, se salta.
 */
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { API_KEY, createTestApp, setTestEnv } from './helpers.js';

setTestEnv();

const ML_URL = process.env.ML_SERVICE_URL ?? 'http://127.0.0.1:5000';
const mlArriba = await fetch(`${ML_URL}/health`, {
  signal: AbortSignal.timeout(2_000),
})
  .then((r) => r.ok)
  .catch(() => false);

// Ejemplos de la celda "Inferencia" del notebook 04 y su clase allí
const EJEMPLOS: [string, 'HAM' | 'PHISHING'][] = [
  [
    'Click here to verify your PayPal account immediately or it will be suspended. Login: http://paypal-verify.suspicious.com',
    'PHISHING',
  ],
  [
    "Hi team, please review the Q3 budget report attached and let me know your thoughts before Friday's meeting.",
    'HAM',
  ],
  [
    'Congratulations! You have been selected to receive a $500 Amazon gift card. Claim now before it expires!',
    'PHISHING',
  ],
  [
    'Can we reschedule the 3pm call to 4pm? I have a conflict with the client meeting.',
    'HAM',
  ],
];

describe.skipIf(!mlArriba)('Full stack: gateway + Flask real en CPU', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('health reporta el servicio ML en CPU', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(res.body).toEqual({ gateway: 'ok', mlService: 'ok', device: 'cpu' });
  });

  it.each(EJEMPLOS)(
    'clasifica igual que el notebook: %s',
    async (body, esperado) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/predict')
        .set('x-api-key', API_KEY)
        .send({ body })
        .expect(200);
      expect(res.body.label).toBe(esperado);
    },
  );

  it('batch con los 4 ejemplos mantiene el orden', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/predict/batch')
      .set('x-api-key', API_KEY)
      .send({ emails: EJEMPLOS.map(([body]) => ({ body })) })
      .expect(200);
    expect(res.body.results.map((r: { label: string }) => r.label)).toEqual(
      EJEMPLOS.map(([, l]) => l),
    );
  });

  // Benchmark dependiente del hardware: se corre con RUN_PERF=1 (criterio 12)
  it.skipIf(process.env.RUN_PERF !== '1')(
    'latencia p95 end-to-end en CPU < 300 ms',
    async () => {
      const tiempos: number[] = [];
      for (let i = 0; i < 50; i++) {
        const t0 = performance.now();
        await request(app.getHttpServer())
          .post('/api/v1/predict')
          .set('x-api-key', API_KEY)
          .send({ subject: 'Account notice', body: EJEMPLOS[0][0].repeat(5) })
          .expect(200);
        tiempos.push(performance.now() - t0);
      }
      tiempos.sort((a, b) => a - b);
      const p95 = tiempos[Math.ceil(tiempos.length * 0.95) - 1];
      console.info(
        `latencia e2e CPU p50=${tiempos[25].toFixed(0)}ms p95=${p95.toFixed(0)}ms`,
      );
      expect(p95).toBeLessThan(300);
    },
    60_000,
  );
});
