import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { apiError } from './common/api-error.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { LoggingInterceptor } from './common/logging.interceptor.js';
import type { AppConfig } from './config/env.validation.js';
import { setupSwagger } from './docs/swagger.js';

// 32 emails de hasta ~21k caracteres
const BODY_LIMIT = '1mb';

/** Solo nombres de campo y reglas incumplidas; nunca el valor recibido. */
function flatten(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((e) => {
    const path = parent ? `${parent}.${e.property}` : e.property;
    const own = Object.keys(e.constraints ?? {}).map(
      (rule) => `${path}: ${rule}`,
    );
    return [...own, ...flatten(e.children ?? [], path)];
  });
}

/** Configuración compartida por main.ts y los tests e2e. */
export function setupApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);

  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.setGlobalPrefix('api/v1');
  app.disable('x-powered-by');
  if (config.get('TRUST_PROXY', { infer: true })) app.set('trust proxy', 1);

  const origins = config.get('CORS_ORIGINS', { infer: true });
  if (origins.length > 0) app.enableCors({ origin: origins });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException(
          apiError(
            'VALIDATION_ERROR',
            flatten(errors).join('; ') || 'Solicitud inválida',
          ),
        ),
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  if (config.get('NODE_ENV', { infer: true }) === 'development') {
    setupSwagger(app);
  }
}
