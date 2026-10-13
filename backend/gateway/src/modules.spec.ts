// U5 (gateway) — Los módulos compilan y resuelven sus dependencias
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation.js';
import { HealthController } from './health/health.controller.js';
import { HealthModule } from './health/health.module.js';
import { MlClientModule } from './ml-client/ml-client.module.js';
import { MlClientService } from './ml-client/ml-client.service.js';
import { PredictController } from './predict/predict.controller.js';
import { PredictModule } from './predict/predict.module.js';
import { PredictService } from './predict/predict.service.js';

const config = (env: Record<string, string> = {}) =>
  ConfigModule.forRoot({
    isGlobal: true,
    ignoreEnvFile: true,
    ignoreEnvVars: true,
    validate: () => validateEnv({ API_KEY: 'k'.repeat(24), ...env }),
  });
const throttler = ThrottlerModule.forRoot({
  throttlers: [{ ttl: 60_000, limit: 10 }],
});

describe('Módulos', () => {
  it('U5-G85 MlClientModule provee y exporta MlClientService con la config', async () => {
    const ref = await Test.createTestingModule({
      imports: [config({ ML_SERVICE_URL: 'http://ml:1234/' }), MlClientModule],
    }).compile();
    const svc = ref.get(MlClientService);
    expect(svc).toBeInstanceOf(MlClientService);
    expect((svc as unknown as { baseUrl: string }).baseUrl).toBe(
      'http://ml:1234',
    );
  });

  it('U5-G86 HealthModule registra HealthController con el cliente inyectado', async () => {
    const ref = await Test.createTestingModule({
      imports: [config(), HealthModule],
    }).compile();
    expect(ref.get(HealthController)).toBeInstanceOf(HealthController);
  });

  it('U5-G87 PredictModule registra controller y service con sus guards resolubles', async () => {
    const ref = await Test.createTestingModule({
      imports: [config(), throttler, PredictModule],
    }).compile();
    expect(ref.get(PredictController)).toBeInstanceOf(PredictController);
    expect(ref.get(PredictService)).toBeInstanceOf(PredictService);
  });

  it('U5-G88 los módulos comparten una sola instancia del cliente ML', async () => {
    const ref = await Test.createTestingModule({
      imports: [config(), throttler, HealthModule, PredictModule],
    }).compile();
    const desdeHealth = ref
      .select(HealthModule)
      .get(MlClientService, { strict: false });
    const desdePredict = ref
      .select(PredictModule)
      .get(MlClientService, { strict: false });
    expect(desdeHealth).toBe(desdePredict);
  });

  it('U5-G89 sin API_KEY la configuración impide compilar el módulo (no arranca)', async () => {
    await expect(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            ignoreEnvFile: true,
            ignoreEnvVars: true,
            validate: () => validateEnv({}),
          }),
        ],
      }).compile(),
    ).rejects.toThrow(/API_KEY/);
  });
});

describe('AppModule', () => {
  const guardado = { ...process.env };
  afterEach(() => {
    process.env = { ...guardado };
    vi.resetModules();
  });

  it('U5-G90 compila con el entorno válido y aplica THROTTLE_* a Throttler', async () => {
    Object.assign(process.env, {
      API_KEY: 'k'.repeat(24),
      NODE_ENV: 'test',
      THROTTLE_LIMIT: '7',
      THROTTLE_TTL_MS: '1234',
    });
    vi.resetModules();
    const { AppModule } = await import('./app.module.js');
    const ref = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    // Tras resetModules las clases son otras: se importan de nuevo
    const { HealthController: Health } =
      await import('./health/health.controller.js');
    const { PredictController: Predict } =
      await import('./predict/predict.controller.js');
    expect(ref.get(Health, { strict: false })).toBeInstanceOf(Health);
    expect(ref.get(Predict, { strict: false })).toBeInstanceOf(Predict);
    const opts = ref.get('THROTTLER:MODULE_OPTIONS' as never, {
      strict: false,
    }) as {
      throttlers: { ttl: number; limit: number }[];
    };
    expect(opts.throttlers[0]).toEqual({ ttl: 1234, limit: 7 });
  });
});
