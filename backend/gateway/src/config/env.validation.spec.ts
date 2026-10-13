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

// U4 (gateway) — Límites y variantes de la configuración
describe('validateEnv: límites', () => {
  it('U4-G14 API_KEY de 15 caracteres falla y de 16 pasa', () => {
    expect(() => validateEnv({ API_KEY: 'k'.repeat(15) })).toThrow(/API_KEY/);
    expect(validateEnv({ API_KEY: 'k'.repeat(16) }).API_KEY).toHaveLength(16);
  });

  it('U4-G15 el mensaje de error de API_KEY no incluye su valor', () => {
    try {
      validateEnv({ API_KEY: 'corta-secreta' });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain('corta-secreta');
    }
  });

  it.each(['development', 'production', 'test'])(
    'U4-G16 acepta NODE_ENV=%s',
    (env) => {
      expect(validateEnv({ API_KEY: KEY, NODE_ENV: env }).NODE_ENV).toBe(env);
    },
  );

  it.each(['0', '-1', '1.5', 'abc', ' ', 'NaN', 'Infinity'])(
    'U4-G17 rechaza PORT=%j',
    (valor) => {
      expect(() => validateEnv({ API_KEY: KEY, PORT: valor })).toThrow(/PORT/);
    },
  );

  it('U4-G18 cadena vacía o ausente cae al valor por defecto', () => {
    const cfg = validateEnv({ API_KEY: KEY, PORT: '', ML_TIMEOUT_MS: '' });
    expect(cfg.PORT).toBe(3000);
    expect(cfg.ML_TIMEOUT_MS).toBe(10_000);
  });

  it('U4-G19 parsea enteros válidos de PORT, ML_TIMEOUT_MS y throttling', () => {
    const cfg = validateEnv({
      API_KEY: KEY,
      PORT: '8080',
      ML_TIMEOUT_MS: '2500',
      THROTTLE_LIMIT: '5',
      THROTTLE_TTL_MS: '1000',
    });
    expect(cfg).toMatchObject({
      PORT: 8080,
      ML_TIMEOUT_MS: 2500,
      THROTTLE_LIMIT: 5,
      THROTTLE_TTL_MS: 1000,
    });
  });

  it.each(['THROTTLE_LIMIT', 'THROTTLE_TTL_MS', 'ML_TIMEOUT_MS'])(
    'U4-G20 rechaza %s no positivo',
    (nombre) => {
      expect(() => validateEnv({ API_KEY: KEY, [nombre]: '0' })).toThrow(
        new RegExp(nombre),
      );
    },
  );

  it.each([
    ['true', true],
    ['false', false],
    ['TRUE', false],
    ['1', false],
    ['', false],
  ])('U4-G21 TRUST_PROXY=%j → %s (solo "true" activa)', (valor, esperado) => {
    expect(validateEnv({ API_KEY: KEY, TRUST_PROXY: valor }).TRUST_PROXY).toBe(
      esperado,
    );
  });

  it('U4-G22 CORS ignora entradas vacías y espacios', () => {
    expect(
      validateEnv({ API_KEY: KEY, CORS_ORIGINS: ' , https://a.com ,, ' })
        .CORS_ORIGINS,
    ).toEqual(['https://a.com']);
    expect(
      validateEnv({ API_KEY: KEY, CORS_ORIGINS: '' }).CORS_ORIGINS,
    ).toEqual([]);
  });

  it('U4-G23 quita varias barras finales y conserva rutas internas', () => {
    expect(
      validateEnv({ API_KEY: KEY, ML_SERVICE_URL: 'http://ml:5000///' })
        .ML_SERVICE_URL,
    ).toBe('http://ml:5000');
    expect(
      validateEnv({ API_KEY: KEY, ML_SERVICE_URL: 'http://ml:5000/base/' })
        .ML_SERVICE_URL,
    ).toBe('http://ml:5000/base');
  });

  it('U4-G24 ML_SERVICE_URL ausente cae al valor por defecto', () => {
    expect(
      validateEnv({ API_KEY: KEY, ML_SERVICE_URL: undefined }).ML_SERVICE_URL,
    ).toBe('http://127.0.0.1:5000');
  });
});
