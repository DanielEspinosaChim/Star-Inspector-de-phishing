import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { API_KEY, FakeMlClient, createTestApp, setTestEnv } from './helpers.js';

// Límite bajo para probar el rate limit; modo producción
setTestEnv({ NODE_ENV: 'production', THROTTLE_LIMIT: '3' });

describe('Configuración de producción (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp(new FakeMlClient());
  });
  afterAll(async () => {
    await app.close();
  });

  it('Swagger no se expone en production', async () => {
    await request(app.getHttpServer()).get('/docs').expect(404);
  });

  it('429 RATE_LIMITED al superar el límite por IP', async () => {
    const send = () =>
      request(app.getHttpServer())
        .post('/api/v1/predict')
        .set('x-api-key', API_KEY)
        .send({ body: 'hola' });

    for (let i = 0; i < 3; i++) await send().expect(200);
    const res = await send().expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('health no está sujeto al rate limit', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    }
  });
});
