export type Label = 'HAM' | 'PHISHING'

export interface Prediction {
  label: Label
  confidence: number
  probabilities: { ham: number; phishing: number }
  model: string
  truncated: boolean
  latencyMs: number
}

export interface Health {
  gateway: 'ok'
  mlService: 'ok' | 'down'
  device: string | null
}

export class ApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/v1${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new ApiError('NETWORK', 'No se pudo conectar con el gateway')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? `Error ${res.status}`)
  }
  if (body === null) {
    throw new ApiError('INVALID_RESPONSE', 'El gateway devolvió una respuesta no válida')
  }
  return body as T
}

export const getHealth = () => request<Health>('/health')

export const predict = (subject: string, body: string) =>
  request<Prediction>('/predict', {
    method: 'POST',
    body: JSON.stringify({ subject, body }),
  })
