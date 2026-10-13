// U5 (gateway) — Documento OpenAPI generado por setupSwagger
import { ConfigModule } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { MlClientService } from '../ml-client/ml-client.service.js';
import { HealthModule } from '../health/health.module.js';
import { PredictModule } from '../predict/predict.module.js';
import { validateEnv } from '../config/env.validation.js';
import { setupApp } from '../setup-app.js';

type Doc = {
  info: { title: string; version: string; description: string };
  tags: { name: string }[];
  paths: Record<string, Record<string, any>>;
  components: {
    securitySchemes: Record<string, any>;
    schemas: Record<string, any>;
  };
};

describe('Swagger (setupSwagger)', () => {
  let app: NestExpressApplication;
  let doc: Doc;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          validate: () =>
            validateEnv({ API_KEY: 'k'.repeat(24), NODE_ENV: 'development' }),
        }),
        ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
        HealthModule,
        PredictModule,
      ],
    })
      .overrideProvider(MlClientService)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    setupApp(app);
    await app.init();
    const r = await request(app.getHttpServer()).get('/docs-json');
    expect(r.status).toBe(200);
    doc = r.body as Doc;
  });
  afterAll(() => app.close());

  it('U5-G66 /docs sirve la interfaz y /docs-json el documento', async () => {
    const html = await request(app.getHttpServer()).get('/docs');
    expect(html.status).toBe(200);
    expect(html.headers['content-type']).toMatch(/html/);
    expect(doc.info.title).toContain('Estrella');
    expect(doc.info.version).toBe('1.0');
  });

  it('U5-G67 documenta los tres endpoints con su prefijo api/v1', () => {
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/api/v1/health',
      '/api/v1/predict',
      '/api/v1/predict/batch',
    ]);
    expect(doc.paths['/api/v1/health']).toHaveProperty('get');
    expect(doc.paths['/api/v1/predict']).toHaveProperty('post');
    expect(doc.paths['/api/v1/predict/batch']).toHaveProperty('post');
  });

  it('U5-G68 define el esquema de API key en x-api-key y solo lo exige en /predict*', () => {
    expect(doc.components.securitySchemes['x-api-key']).toMatchObject({
      type: 'apiKey',
      in: 'header',
      name: 'x-api-key',
    });
    expect(doc.paths['/api/v1/predict'].post.security).toEqual([
      { 'x-api-key': [] },
    ]);
    expect(doc.paths['/api/v1/predict/batch'].post.security).toEqual([
      { 'x-api-key': [] },
    ]);
    expect(doc.paths['/api/v1/health'].get.security).toBeUndefined();
  });

  it('U5-G69 los endpoints de predicción documentan 200/400/401/413/429/503', () => {
    for (const p of ['/api/v1/predict', '/api/v1/predict/batch']) {
      const codes = Object.keys(doc.paths[p].post.responses);
      expect(codes).toEqual(
        expect.arrayContaining(['200', '400', '401', '413', '429', '503']),
      );
      expect(
        doc.paths[p].post.responses['401'].content['application/json'].schema
          .$ref,
      ).toContain('ErrorResponseDto');
    }
  });

  it('U5-G70 documenta x-request-id como opcional y los tags en español', () => {
    const headers = doc.paths['/api/v1/predict'].post.parameters.filter(
      (p: any) => p.in === 'header',
    );
    expect(headers).toEqual([
      expect.objectContaining({ name: 'x-request-id', required: false }),
    ]);
    expect(doc.tags.map((t) => t.name).sort()).toEqual([
      'Estado',
      'Predicción',
    ]);
  });

  it('U5-G71 incluye los DTOs de petición y respuesta', () => {
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining([
        'PredictRequestDto',
        'PredictBatchRequestDto',
        'PredictResponseDto',
        'PredictBatchResponseDto',
        'ErrorResponseDto',
        'HealthResponseDto',
      ]),
    );
    const req = doc.components.schemas.PredictRequestDto;
    expect(req.required).toEqual(['body']);
    expect(req.properties.body.maxLength).toBe(20_000);
    expect(req.properties.subject.maxLength).toBe(1_000);
    expect(
      doc.components.schemas.PredictBatchRequestDto.properties.emails,
    ).toMatchObject({
      minItems: 1,
      maxItems: 32,
    });
  });

  it('U5-G72 la descripción documenta el formato de errores y la privacidad', () => {
    expect(doc.info.description).toContain('"error": { "code"');
    expect(doc.info.description).toMatch(
      /nunca escribe su contenido en los logs/,
    );
  });

  it('U5-G73 los ejemplos del documento no contienen ninguna API key real', () => {
    expect(JSON.stringify(doc)).not.toContain('k'.repeat(24));
  });
});
