export type NodeEnv = 'development' | 'production' | 'test';

export interface AppConfig {
  NODE_ENV: NodeEnv;
  PORT: number;
  ML_SERVICE_URL: string;
  ML_TIMEOUT_MS: number;
  API_KEY: string;
  THROTTLE_LIMIT: number;
  THROTTLE_TTL_MS: number;
  CORS_ORIGINS: string[];
  TRUST_PROXY: boolean;
}

const MIN_API_KEY_LENGTH = 16;

function toInt(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} debe ser un entero positivo`);
  }
  return n;
}

/**
 * Valida las variables de entorno al arrancar. Si algo falta o es inválido,
 * el gateway no arranca (criterio 13: no hay API_KEY por defecto).
 */
export function validateEnv(
  raw: Record<string, string | undefined>,
): AppConfig {
  const nodeEnv = (raw.NODE_ENV ?? 'production') as NodeEnv;
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error('NODE_ENV debe ser development, production o test');
  }

  const apiKey = raw.API_KEY ?? '';
  if (apiKey.length < MIN_API_KEY_LENGTH) {
    throw new Error(
      `API_KEY es obligatoria y debe tener al menos ${MIN_API_KEY_LENGTH} caracteres`,
    );
  }

  const mlUrl = raw.ML_SERVICE_URL ?? 'http://127.0.0.1:5000';
  try {
    new URL(mlUrl);
  } catch {
    throw new Error('ML_SERVICE_URL no es una URL válida');
  }

  const cors = (raw.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    NODE_ENV: nodeEnv,
    PORT: toInt('PORT', raw.PORT, 3000),
    ML_SERVICE_URL: mlUrl.replace(/\/+$/, ''),
    ML_TIMEOUT_MS: toInt('ML_TIMEOUT_MS', raw.ML_TIMEOUT_MS, 10_000),
    API_KEY: apiKey,
    THROTTLE_LIMIT: toInt('THROTTLE_LIMIT', raw.THROTTLE_LIMIT, 60),
    THROTTLE_TTL_MS: toInt('THROTTLE_TTL_MS', raw.THROTTLE_TTL_MS, 60_000),
    CORS_ORIGINS: cors,
    TRUST_PROXY: (raw.TRUST_PROXY ?? 'false') === 'true',
  };
}
