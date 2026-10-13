import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getHealth, predict } from './api'

// Respuesta simulada; si body es string se envía tal cual (puede no ser JSON válido)
function respuesta(status: number, body: unknown) {
  const texto = typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(texto, { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => vi.unstubAllGlobals())

describe('ApiError', () => {
  it('conserva code y message y es un Error', () => {
    const e = new ApiError('X', 'mensaje')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(ApiError)
    expect(e.code).toBe('X')
    expect(e.message).toBe('mensaje')
  })
})

describe('getHealth', () => {
  it('hace GET a /api/v1/health y devuelve el JSON', async () => {
    const datos = { gateway: 'ok', mlService: 'ok', device: 'cpu' }
    const f = vi.fn().mockResolvedValue(respuesta(200, datos))
    vi.stubGlobal('fetch', f)
    await expect(getHealth()).resolves.toEqual(datos)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/health')
    expect(init.method).toBeUndefined()
    expect(init.headers['content-type']).toBe('application/json')
  })

  it('red caída: ApiError NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(getHealth()).rejects.toMatchObject({ code: 'NETWORK' })
  })
})

describe('predict', () => {
  const pred = {
    label: 'PHISHING',
    confidence: 0.98,
    probabilities: { ham: 0.02, phishing: 0.98 },
    model: 'bert',
    truncated: false,
    latencyMs: 12.4,
  }

  it('hace POST a /api/v1/predict con subject y body en JSON', async () => {
    const f = vi.fn().mockResolvedValue(respuesta(200, pred))
    vi.stubGlobal('fetch', f)
    await expect(predict('asunto', 'cuerpo')).resolves.toEqual(pred)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/v1/predict')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ subject: 'asunto', body: 'cuerpo' })
    expect(init.headers['content-type']).toBe('application/json')
  })

  it('serializa caracteres especiales sin pérdida', async () => {
    const f = vi.fn().mockResolvedValue(respuesta(200, pred))
    vi.stubGlobal('fetch', f)
    await predict('a "b"', 'línea1\nlínea2 \\ ñ')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ subject: 'a "b"', body: 'línea1\nlínea2 \\ ñ' })
  })

  it('red caída: lanza ApiError NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const err = await predict('a', 'b').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('NETWORK')
    expect(err.message).toMatch(/gateway/)
  })

  it('error HTTP con JSON {error:{code,message}}: propaga code y message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respuesta(401, { error: { code: 'UNAUTHORIZED', message: 'API key inválida' } })),
    )
    const err = await predict('a', 'b').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('UNAUTHORIZED')
    expect(err.message).toBe('API key inválida')
  })

  it('error HTTP con JSON sin campo error: HTTP_ERROR y "Error <status>"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(500, { otro: 1 })))
    const err = await predict('a', 'b').catch((e) => e)
    expect(err.code).toBe('HTTP_ERROR')
    expect(err.message).toBe('Error 500')
  })

  it('error HTTP con cuerpo no JSON (HTML): HTTP_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(502, '<html>Bad Gateway</html>')))
    const err = await predict('a', 'b').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('HTTP_ERROR')
    expect(err.message).toBe('Error 502')
  })

  it('error HTTP con cuerpo vacío: HTTP_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))
    const err = await predict('a', 'b').catch((e) => e)
    expect(err.code).toBe('HTTP_ERROR')
    expect(err.message).toBe('Error 503')
  })

  it('error HTTP con JSON null: HTTP_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(400, 'null')))
    const err = await predict('a', 'b').catch((e) => e)
    expect(err.code).toBe('HTTP_ERROR')
    expect(err.message).toBe('Error 400')
  })

  it('éxito con cuerpo no JSON lanza ApiError INVALID_RESPONSE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, 'no-json')))
    const err = await predict('a', 'b').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('INVALID_RESPONSE')
  })
})
