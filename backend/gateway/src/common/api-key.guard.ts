import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { AppConfig } from '../config/env.validation.js';
import { apiError } from './api-error.js';

export const API_KEY_HEADER = 'x-api-key';

const digest = (value: string) => createHash('sha256').update(value).digest();

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(config: ConfigService<AppConfig, true>) {
    this.expected = digest(config.get('API_KEY', { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().headers[
      API_KEY_HEADER
    ];
    const provided = Array.isArray(header) ? header[0] : header;
    // Comparación en tiempo constante sobre hashes de igual longitud
    if (!provided || !timingSafeEqual(digest(provided), this.expected)) {
      throw new UnauthorizedException(
        apiError('UNAUTHORIZED', 'API key inválida o ausente'),
      );
    }
    return true;
  }
}
