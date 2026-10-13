// U4/U5 (gateway) — Configuración global: pipes, límites, filtros y CORS
import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { validateEnv } from './config/env.validation.js';
import {
  PredictBatchRequestDto,
  PredictRequestDto,
} from './predict/dto/predict-request.dto.js';
import { setupApp } from './setup-app.js';

const SENTINELA = 'SENTINELA_EMAIL_777';

/** Controller mínimo: devuelve lo que el pipe global dejó pasar. */
@Controller('t')
class TestController {
  @Post('one')
  one(@Body() dto: PredictRequestDto) {
    return { esInstancia: dto instanceof PredictRequestDto, dto };
  }

  @Post('batch')
  batch(@Body() dto: PredictBatchRequestDto) {
    return {
      n: dto.emails.length,
      primero: dto.emails[0] instanceof PredictRequestDto,
    };
  }

  @Get('boom')
  boom(): never {
    throw new Error(`falla interna con ${SENTINELA} en C:\\src\\secreto.ts`);
  }
}

@Module({ controllers: [TestController] })
class TestModule {}

async function crearApp(env: Record<string, string> = {}) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        validate: () =>
          validateEnv({ API_KEY: 'k'.repeat(24), NODE_ENV: 'test', ...env }),
      }),
      TestModule,
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  setupApp(app);
  await app.init();
  return app;
}

describe('setupApp', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await crearApp();
  });
  afterAll(() => app.close());

  it('U4-G25 aplica el prefijo global api/v1', async () => {
    await http().post('/api/v1/t/one').send({ body: 'hola' }).expect(201);
    await http().post('/t/one').send({ body: 'hola' }).expect(404);
  });

  it('U4-G26 transform: el body llega como instancia del DTO (también anidado)', async () => {
    const r = await http().post('/api/v1/t/one').send({ body: 'hola' });
    expect(r.body.esInstancia).toBe(true);
    const b = await http()
      .post('/api/v1/t/batch')
      .send({ emails: [{ body: 'a' }, { body: 'b' }] });
    expect(b.body).toEqual({ n: 2, primero: true });
  });

  it('U4-G27 forbidNonWhitelisted: un campo extra → 400 VALIDATION_ERROR', async () => {
    const r = await http()
      .post('/api/v1/t/one')
      .send({ body: 'hola', admin: true });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(r.body.error.message).toContain('admin');
  });

  it('U4-G28 body ausente/vacío/no string/muy largo → 400 con regla y campo', async () => {
    for (const payload of [
      {},
      { body: '' },
      { body: '   ' },
      { body: 42 },
      { body: 'x'.repeat(20_001) },
      { body: 'ok', subject: 's'.repeat(1_001) },
    ]) {
      const r = await http().post('/api/v1/t/one').send(payload);
      expect(r.status).toBe(400);
      expect(Object.keys(r.body)).toEqual(['error']);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
      expect(r.body.error.message).toMatch(/body|subject/);
    }
  });

  it('U4-G29 el 400 nombra el email inválido del lote (emails.1.body)', async () => {
    const r = await http()
      .post('/api/v1/t/batch')
      .send({ emails: [{ body: 'ok' }, { body: '' }] });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toContain('emails.1.body');
  });

  it('U4-G30 lote vacío o de 33 → 400', async () => {
    await http().post('/api/v1/t/batch').send({ emails: [] }).expect(400);
    const treintaytres = Array.from({ length: 33 }, () => ({ body: 'a' }));
    await http()
      .post('/api/v1/t/batch')
      .send({ emails: treintaytres })
      .expect(400);
    const treintaydos = treintaytres.slice(0, 32);
    await http()
      .post('/api/v1/t/batch')
      .send({ emails: treintaydos })
      .expect(201);
  });

  it('U5-G63 el mensaje de validación nunca repite el valor recibido', async () => {
    const r = await http()
      .post('/api/v1/t/one')
      .send({ body: 'ok', subject: SENTINELA.repeat(100), [SENTINELA]: 1 });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toContain(SENTINELA.repeat(2));
    // Del campo desconocido solo se nombra la clave, nunca su valor
    expect(r.body.error.message).not.toMatch(/: 1(;|$)/);
  });

  it('U4-G31 body de ~900 KB pasa el parser (lo rechaza la validación, no el límite)', async () => {
    const r = await http()
      .post('/api/v1/t/one')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ body: 'x'.repeat(900_000) }));
    expect(r.status).toBe(400); // MaxLength(20000), no 413
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  // BUG REAL (reportado, no corregido): el PayloadTooLargeError de body-parser no es
  // un HttpException, así que el filtro lo convierte en 500 INTERNAL_ERROR. El contrato
  // (y la doc de Swagger) dicen 413 PAYLOAD_TOO_LARGE. `it.fails` pasa mientras el bug
  // exista y se pondrá en rojo cuando se corrija: entonces cambiar a `it`.
  it('U4-G32 body > 1 MB → 413 PAYLOAD_TOO_LARGE', async () => {
    const grande = await http()
      .post('/api/v1/t/one')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ body: 'x'.repeat(1_100_000) }));
    expect(grande.status).toBe(413);
    expect(grande.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('U4-G39 body > 1 MB nunca devuelve traza ni contenido (hoy responde 500 genérico)', async () => {
    const grande = await http()
      .post('/api/v1/t/one')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ body: SENTINELA.repeat(100_000) }));
    expect([413, 500]).toContain(grande.status);
    expect(Object.keys(grande.body)).toEqual(['error']);
    expect(grande.text).not.toMatch(/SENTINELA|stack|node_modules|\.js:\d+/);
  });

  it('U4-G40 JSON malformado → 400 con formato de error y sin traza', async () => {
    const r = await http()
      .post('/api/v1/t/one')
      .set('content-type', 'application/json')
      .send('{"body": ');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(r.body)).not.toMatch(/stack|node_modules|\.js:\d+/);
  });

  // BUG menor (reportado, no corregido): el mensaje de JSON.parse incluye los primeros
  // caracteres del cuerpo recibido ("Unexpected token 'S', "SENTINELA_"... is not valid
  // JSON"). Solo viaja de vuelta al mismo cliente y no se loguea, pero contradice
  // "el mensaje nunca incluye el texto del email".
  it('U4-G41 JSON malformado no repite fragmentos del cuerpo recibido', async () => {
    const r = await http()
      .post('/api/v1/t/one')
      .set('content-type', 'application/json')
      .send('SENTINELA_EMAIL no es json');
    expect(r.status).toBe(400);
    expect(r.text).not.toContain('SENTINELA');
  });

  it('U5-G64 ruta inexistente → 404 NOT_FOUND con formato uniforme', async () => {
    const r = await http().get('/api/v1/no-existe');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
    expect(Object.keys(r.body.error).sort()).toEqual(['code', 'message']);
  });

  it('U5-G65 excepción no controlada → 500 genérico sin mensaje, traza ni rutas', async () => {
    const r = await http().get('/api/v1/t/boom');
    expect(r.status).toBe(500);
    expect(r.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' },
    });
    const crudo = r.text;
    expect(crudo).not.toContain(SENTINELA);
    expect(crudo).not.toMatch(/secreto\.ts|stack|C:\\/);
  });

  it('U4-G33 no anuncia x-powered-by y devuelve x-request-id', async () => {
    const r = await http().post('/api/v1/t/one').send({ body: 'hola' });
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['x-request-id']).toBeTruthy();
    const eco = await http()
      .post('/api/v1/t/one')
      .set('x-request-id', 'mi-id-1')
      .send({ body: 'hola' });
    expect(eco.headers['x-request-id']).toBe('mi-id-1');
  });

  it('U4-G34 sin CORS_ORIGINS no se emiten cabeceras CORS', async () => {
    const r = await http()
      .post('/api/v1/t/one')
      .set('origin', 'https://otro.com')
      .send({ body: 'hola' });
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('U4-G35 en producción/test no se publica Swagger', async () => {
    await http().get('/docs').expect(404);
  });
});

describe('setupApp: configuración por entorno', () => {
  it('U4-G36 CORS_ORIGINS permite solo los orígenes listados', async () => {
    const app = await crearApp({ CORS_ORIGINS: 'https://a.com' });
    const ok = await request(app.getHttpServer())
      .post('/api/v1/t/one')
      .set('origin', 'https://a.com')
      .send({ body: 'x' });
    expect(ok.headers['access-control-allow-origin']).toBe('https://a.com');
    const no = await request(app.getHttpServer())
      .post('/api/v1/t/one')
      .set('origin', 'https://mala.com')
      .send({ body: 'x' });
    expect(no.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });

  it('U4-G37 TRUST_PROXY=true activa trust proxy; por defecto no', async () => {
    const con = await crearApp({ TRUST_PROXY: 'true' });
    const sin = await crearApp();
    expect(con.getHttpAdapter().getInstance().get('trust proxy')).toBe(1);
    expect(sin.getHttpAdapter().getInstance().get('trust proxy')).toBeFalsy();
    await con.close();
    await sin.close();
  });

  it('U4-G38 NODE_ENV=development publica Swagger en /docs', async () => {
    const app = await crearApp({ NODE_ENV: 'development' });
    const r = await request(app.getHttpServer()).get('/docs');
    expect(r.status).toBe(200);
    expect(r.text).toContain('swagger');
    await app.close();
  });
});
