import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Observable, finalize } from 'rxjs';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Loguea metadatos de cada request. NUNCA el cuerpo (subject/body del email)
 * ni la API key.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const incoming = req.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof incoming === 'string' && /^[\w-]{1,64}$/.test(incoming)
        ? incoming
        : randomUUID();
    req.headers[REQUEST_ID_HEADER] = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const start = performance.now();
    return next.handle().pipe(
      finalize(() => {
        const ms = (performance.now() - start).toFixed(1);
        const bytes = req.headers['content-length'] ?? '0';
        this.logger.log(
          `req=${requestId} ${req.method} ${req.path} status=${res.statusCode} bytes=${bytes} latencia_ms=${ms}`,
        );
      }),
    );
  }
}
