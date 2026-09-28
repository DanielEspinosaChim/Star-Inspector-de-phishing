import { ConsoleLogger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { API_KEY, FakeMlClient, createTestApp, setTestEnv } from './helpers.js';

setTestEnv();

const MARCADOR = 'MARCADOR_UNICO_7f3a9';

describe('Logging seguro (e2e)', () => {
  let app: NestExpressApplication;
  const ml = new FakeMlClient();
  const salida: string[] = [];

  beforeAll(async () => {
    app = await createTestApp(ml);
    // El módulo de testing silencia los logs; aquí queremos el logger real
    app.useLogger(new ConsoleLogger());
    const capture = (chunk: unknown) => {
      salida.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stdout, 'write').mockImplementation(capture);
    vi.spyOn(process.stderr, 'write').mockImplementation(capture);
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) =>
      capture(a.join(' ')),
    );
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) =>
      capture(a.join(' ')),
    );
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('ningún log contiene el email ni la API key', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/v1/predict')
      .set('x-api-key', API_KEY)
      .send({ subject: MARCADOR, body: `hola ${MARCADOR}` })
      .expect(200);
    await request(server)
      .post('/api/v1/predict/batch')
      .set('x-api-key', API_KEY)
      .send({ emails: [{ body: MARCADOR }] })
      .expect(200);
    await request(server)
      .post('/api/v1/predict')
      .set('x-api-key', API_KEY)
      .send({ body: 'x'.repeat(20_001) + MARCADOR })
      .expect(400);
    ml.down = true;
    await request(server)
      .post('/api/v1/predict')
      .set('x-api-key', API_KEY)
      .send({ body: MARCADOR })
      .expect(503);

    const logs = salida.join('\n');
    expect(logs).toContain('POST /api/v1/predict');
    expect(logs).not.toContain(MARCADOR);
    expect(logs).not.toContain(API_KEY);
  });

  it('los errores de validación no reflejan el valor recibido', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/predict')
      .set('x-api-key', API_KEY)
      .send({ body: 'ok', subject: MARCADOR.repeat(100) })
      .expect(400);
    expect(JSON.stringify(res.body)).not.toContain(MARCADOR);
  });
});
