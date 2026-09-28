import { ServiceUnavailableException } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { apiError } from '../src/common/api-error.js';
import type { PredictRequestDto } from '../src/predict/dto/predict-request.dto.js';
import type { MlPredictionDto } from '../src/predict/dto/predict-response.dto.js';

export const API_KEY = 'e2e-api-key-0123456789abcdef';

/** Debe llamarse ANTES de importar AppModule: ConfigModule lee el entorno al importarse. */
export function setTestEnv(overrides: Record<string, string> = {}): void {
  Object.assign(process.env, {
    NODE_ENV: 'development',
    API_KEY,
    ML_SERVICE_URL: 'http://127.0.0.1:5000',
    THROTTLE_LIMIT: '1000',
    THROTTLE_TTL_MS: '60000',
    ...overrides,
  });
}

/** Servicio ML falso: PHISHING si el body contiene "phish". */
export class FakeMlClient {
  down = false;
  calls = 0;

  private predictOne(email: PredictRequestDto): MlPredictionDto {
    const p = email.body.toLowerCase().includes('phish') ? 0.9 : 0.2;
    return {
      label: p > 0.5 ? 'PHISHING' : 'HAM',
      confidence: Math.max(p, 1 - p),
      probabilities: { ham: 1 - p, phishing: p },
      model: 'bert-base-uncased-phishing',
      truncated: false,
    };
  }

  private check(): void {
    this.calls++;
    if (this.down) {
      throw new ServiceUnavailableException(
        apiError(
          'ML_SERVICE_UNAVAILABLE',
          'El servicio de inferencia no está disponible',
        ),
      );
    }
  }

  predict(email: PredictRequestDto): Promise<MlPredictionDto> {
    this.check();
    return Promise.resolve(this.predictOne(email));
  }

  predictBatch(emails: PredictRequestDto[]): Promise<MlPredictionDto[]> {
    this.check();
    return Promise.resolve(emails.map((e) => this.predictOne(e)));
  }

  health() {
    return Promise.resolve(
      this.down
        ? null
        : { status: 'ok', device: 'cpu', model: 'bert-base-uncased-phishing' },
    );
  }
}

export async function createTestApp(
  fakeMl?: FakeMlClient,
): Promise<NestExpressApplication> {
  const { AppModule } = await import('../src/app.module.js');
  const { MlClientService } =
    await import('../src/ml-client/ml-client.service.js');
  const { setupApp } = await import('../src/setup-app.js');

  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (fakeMl)
    builder = builder.overrideProvider(MlClientService).useValue(fakeMl);
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  setupApp(app);
  await app.init();
  return app;
}
