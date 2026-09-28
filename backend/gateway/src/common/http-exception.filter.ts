import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApiErrorBody, ErrorCode, apiError } from './api-error.js';

const CODES: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
  503: 'ML_SERVICE_UNAVAILABLE',
};

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.code === 'string'
  );
}

/** Todas las respuestas de error con formato { error: { code, message } }, sin trazas. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ThrottlerException) {
      res
        .status(HttpStatus.TOO_MANY_REQUESTS)
        .json(
          apiError('RATE_LIMITED', 'Demasiadas solicitudes, intenta más tarde'),
        );
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (isApiErrorBody(body)) {
        res.status(status).json(body);
        return;
      }
      res
        .status(status)
        .json(
          apiError(
            CODES[status] ?? 'HTTP_ERROR',
            status >= 500 ? 'Error' : exception.message,
          ),
        );
      return;
    }

    // Solo el tipo: el mensaje podría incluir contenido del email
    const name = exception instanceof Error ? exception.name : typeof exception;
    this.logger.error(`error interno: ${name}`);
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(apiError('INTERNAL_ERROR', 'Error interno del servidor'));
  }
}
