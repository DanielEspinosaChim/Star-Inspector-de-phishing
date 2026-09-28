import { validateEnv } from './env.validation.js';

const KEY = 'k'.repeat(32);

describe('validateEnv', () => {
  it('aplica defaults seguros', () => {
    const cfg = validateEnv({ API_KEY: KEY });
    expect(cfg).toMatchObject({
      NODE_ENV: 'production',
      PORT: 3000,
      ML_SERVICE_URL: 'http://127.0.0.1:5000',
      ML_TIMEOUT_MS: 10_000,
      THROTTLE_LIMIT: 60,
      CORS_ORIGINS: [],
      TRUST_PROXY: false,
    });
  });

  it('no arranca sin API_KEY', () => {
    expect(() => validateEnv({})).toThrow(/API_KEY/);
  });

  it('no arranca con API_KEY corta', () => {
    expect(() => validateEnv({ API_KEY: 'corta' })).toThrow(/API_KEY/);
  });

  it('rechaza NODE_ENV desconocido', () => {
    expect(() => validateEnv({ API_KEY: KEY, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });

  it('rechaza URL inválida y enteros inválidos', () => {
    expect(() =>
      validateEnv({ API_KEY: KEY, ML_SERVICE_URL: 'no-url' }),
    ).toThrow();
    expect(() => validateEnv({ API_KEY: KEY, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('parsea CORS y quita la barra final de la URL', () => {
    const cfg = validateEnv({
      API_KEY: KEY,
      CORS_ORIGINS: 'https://a.com, https://b.com',
      ML_SERVICE_URL: 'http://ml:5000/',
    });
    expect(cfg.CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
    expect(cfg.ML_SERVICE_URL).toBe('http://ml:5000');
  });
});
