import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { apiError } from '../common/api-error.js';
import type { AppConfig } from '../config/env.validation.js';
import type { PredictRequestDto } from '../predict/dto/predict-request.dto.js';
import type { MlPredictionDto } from '../predict/dto/predict-response.dto.js';

export interface MlHealth {
  status: string;
  device: string;
  model: string;
}

const unavailable = () =>
  new ServiceUnavailableException(
    apiError(
      'ML_SERVICE_UNAVAILABLE',
      'El servicio de inferencia no está disponible',
    ),
  );

/** Cliente HTTP del servicio Flask (fetch nativo con timeout). */
@Injectable()
export class MlClientService {
  private readonly logger = new Logger(MlClientService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService<AppConfig, true>) {
    this.baseUrl = config.get('ML_SERVICE_URL', { infer: true });
    this.timeoutMs = config.get('ML_TIMEOUT_MS', { infer: true });
  }

  predict(
    email: PredictRequestDto,
    requestId?: string,
  ): Promise<MlPredictionDto> {
    return this.post<MlPredictionDto>('/predict', email, requestId);
  }

  async predictBatch(
    emails: PredictRequestDto[],
    requestId?: string,
  ): Promise<MlPredictionDto[]> {
    const res = await this.post<{ results: MlPredictionDto[] }>(
      '/predict/batch',
      { emails },
      requestId,
    );
    return res.results;
  }

  async health(): Promise<MlHealth | null> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(Math.min(this.timeoutMs, 3_000)),
      });
      return res.ok ? ((await res.json()) as MlHealth) : null;
    } catch {
      return null;
    }
  }

  private async post<T>(
    path: string,
    payload: unknown,
    requestId?: string,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(requestId ? { 'x-request-id': requestId } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      // Timeout o conexión rechazada
      this.logger.warn(`servicio ML no responde: ${(err as Error).name}`);
      throw unavailable();
    }

    if (res.ok) return (await res.json()) as T;

    if (res.status === 400) {
      // Flask revalida; sus mensajes no incluyen el contenido del email
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      throw new BadRequestException(
        apiError(
          'VALIDATION_ERROR',
          body?.error?.message ?? 'Solicitud inválida',
        ),
      );
    }

    this.logger.warn(`servicio ML respondió ${res.status}`);
    if (res.status >= 500) throw unavailable();
    throw new HttpException(
      apiError('INTERNAL_ERROR', 'Error interno del servidor'),
      500,
    );
  }
}
