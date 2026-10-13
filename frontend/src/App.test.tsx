import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// Datos sintéticos
const PHISH = {
  label: 'PHISHING',
  confidence: 0.987,
  probabilities: { ham: 0.013, phishing: 0.987 },
  model: 'bert',
  truncated: false,
  latencyMs: 42.6,
}
const HAM = {
  label: 'HAM',
  confidence: 0.91,
  probabilities: { ham: 0.91, phishing: 0.09 },
  model: 'bert',
  truncated: true,
  latencyMs: 10.2,
}
const SALUD_OK = { gateway: 'ok', mlService: 'ok', device: 'cpu' }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>

// Instala un fetch simulado enrutado por URL
function mockFetch(opts: { predict?: Handler; health?: Handler } = {}) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/health')) return (opts.health ?? (() => json(200, SALUD_OK)))(url, init)
    return (opts.predict ?? (() => json(200, PHISH)))(url, init)
  })
  vi.stubGlobal('fetch', f)
  return f
}
const llamadasPredict = (f: ReturnType<typeof mockFetch>) =>
  f.mock.calls.filter(([u]) => String(u).endsWith('/predict'))
const cuerpoEnviado = (c: [string, RequestInit?]) => JSON.parse(c[1]!.body as string)

const asuntoBox = () => screen.getByRole('textbox', { name: /subject/i })
const cuerpoBox = () => screen.getByRole('textbox', { name: 'Cuerpo del mensaje' })

afterEach(() => vi.unstubAllGlobals())

describe('App: arranque', () => {
  it('renderiza la estructura y accesibilidad básica por roles', async () => {
    mockFetch()
    render(<App />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(asuntoBox()).toBeInTheDocument()
    expect(cuerpoBox()).toBeRequired()
    expect(screen.getByRole('heading', { name: 'Muestras de prueba' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    await screen.findByText('Phishing')
  })

  it('precarga la primera muestra y lanza una inspección automática única', async () => {
    const f = mockFetch()
    render(<App />)
    expect(asuntoBox()).toHaveValue('Your account has been limited')
    expect(await screen.findByText('Phishing')).toBeInTheDocument()
    expect(screen.getByText('N.º 001')).toBeInTheDocument()
    expect(llamadasPredict(f)).toHaveLength(1)
  })

  it('estado de carga: texto pendiente y botón deshabilitado hasta resolver', async () => {
    let resolver!: (r: Response) => void
    mockFetch({ predict: () => new Promise<Response>((r) => (resolver = r)) })
    render(<App />)
    expect(await screen.findByText('Inspeccionando…', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inspeccionando…' })).toBeDisabled()
    await act(async () => resolver(json(200, PHISH)))
    expect(await screen.findByText('Phishing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inspeccionar' })).toBeEnabled()
  })

  it('bajo StrictMode la inspección inicial ocurre una sola vez', async () => {
    const f = mockFetch()
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    await screen.findByText('Phishing')
    expect(llamadasPredict(f)).toHaveLength(1)
  })
})

describe('App: resultado', () => {
  it('PHISHING: sello, probabilidad, confianza, latencia y recorte', async () => {
    mockFetch()
    render(<App />)
    expect(await screen.findByText('No abrir enlaces')).toBeInTheDocument()
    expect(screen.getByText('0.987')).toBeInTheDocument()
    expect(screen.getByText('98.7 %')).toBeInTheDocument()
    expect(screen.getByText('0.013')).toBeInTheDocument()
    expect(screen.getByText('43 ms')).toBeInTheDocument()
    expect(screen.getByText('Texto recortado').nextElementSibling).toHaveTextContent('no')
  })

  it('HAM: sello legítimo y texto recortado "sí"', async () => {
    mockFetch({ predict: () => json(200, HAM) })
    render(<App />)
    expect(await screen.findByText('Legítimo')).toBeInTheDocument()
    expect(screen.getByText('Sin señales de fraude')).toBeInTheDocument()
    expect(screen.getByText('Texto recortado').nextElementSibling).toHaveTextContent('sí')
    expect(screen.getByText('91.0 %')).toBeInTheDocument()
  })

  it('la región del informe es aria-live polite', async () => {
    mockFetch()
    const { container } = render(<App />)
    await screen.findByText('Phishing')
    expect(container.querySelector('section.report')).toHaveAttribute('aria-live', 'polite')
  })
})

describe('App: errores', () => {
  const casos: [string, string, RegExp][] = [
    ['ML_SERVICE_UNAVAILABLE', 'x', /servicio de inferencia no responde/],
    ['UNAUTHORIZED', 'x', /API key no es válida/],
    ['RATE_LIMITED', 'x', /Demasiadas inspecciones/],
    ['VALIDATION_ERROR', 'Cuerpo demasiado largo', /Cuerpo demasiado largo/],
  ]
  it.each(casos)('código %s muestra el mensaje adecuado', async (code, message, esperado) => {
    mockFetch({ predict: () => json(500, { error: { code, message } }) })
    render(<App />)
    expect(await screen.findByText(esperado)).toBeInTheDocument()
    expect(screen.queryByText('Sin inspecciones todavía.')).not.toBeInTheDocument()
  })

  it('red caída muestra el mensaje NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')))
    render(<App />)
    expect(await screen.findByText(/No hay conexión con el gateway/)).toBeInTheDocument()
  })

  it('error HTTP sin JSON muestra "Error <status>"', async () => {
    mockFetch({ predict: () => new Response('<html></html>', { status: 502 }) })
    render(<App />)
    expect(await screen.findByText('Error 502')).toBeInTheDocument()
  })

  it('el error previo se limpia tras una inspección exitosa', async () => {
    let n = 0
    mockFetch({
      predict: () => (n++ === 0 ? json(401, { error: { code: 'UNAUTHORIZED', message: 'm' } }) : json(200, PHISH)),
    })
    render(<App />)
    await screen.findByText(/API key no es válida/)
    await userEvent.click(screen.getByRole('button', { name: 'Inspeccionar' }))
    expect(await screen.findByText('Phishing')).toBeInTheDocument()
    expect(screen.queryByText(/API key no es válida/)).not.toBeInTheDocument()
  })

  it('si falla tras un resultado, conserva el informe anterior junto al error', async () => {
    let n = 0
    mockFetch({
      predict: () => (n++ === 0 ? json(200, PHISH) : json(429, { error: { code: 'RATE_LIMITED', message: 'm' } })),
    })
    render(<App />)
    await screen.findByText('N.º 001')
    await userEvent.click(screen.getByRole('button', { name: 'Inspeccionar' }))
    expect(await screen.findByText(/Demasiadas inspecciones/)).toBeInTheDocument()
    expect(screen.getByText('N.º 001')).toBeInTheDocument()
  })
})

describe('App: formulario', () => {
  it('enviar usa subject/body editados y numera el informe', async () => {
    const f = mockFetch()
    render(<App />)
    await screen.findByText('N.º 001')
    await userEvent.clear(asuntoBox())
    await userEvent.type(asuntoBox(), 'Hola')
    await userEvent.clear(cuerpoBox())
    await userEvent.type(cuerpoBox(), 'Texto de prueba')
    await userEvent.click(screen.getByRole('button', { name: 'Inspeccionar' }))
    expect(await screen.findByText('N.º 002')).toBeInTheDocument()
    expect(cuerpoEnviado(llamadasPredict(f).at(-1)!)).toEqual({ subject: 'Hola', body: 'Texto de prueba' })
  })

  it('Ctrl+Enter envía desde el asunto y desde el cuerpo', async () => {
    const f = mockFetch()
    render(<App />)
    await screen.findByText('N.º 001')
    await userEvent.click(asuntoBox())
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    await screen.findByText('N.º 002')
    await userEvent.click(cuerpoBox())
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    await screen.findByText('N.º 003')
    expect(llamadasPredict(f)).toHaveLength(3)
  })

  it('Enter simple en el cuerpo no dispara inspección', async () => {
    const f = mockFetch()
    render(<App />)
    await screen.findByText('N.º 001')
    await userEvent.click(cuerpoBox())
    await userEvent.keyboard('{Enter}')
    expect(llamadasPredict(f)).toHaveLength(1)
  })

  it('cuerpo vacío o en blanco: botón deshabilitado y no se llama a predict', async () => {
    const f = mockFetch()
    render(<App />)
    await screen.findByText('N.º 001')
    await userEvent.clear(cuerpoBox())
    expect(screen.getByRole('button', { name: 'Inspeccionar' })).toBeDisabled()
    await userEvent.type(cuerpoBox(), '   ')
    expect(screen.getByRole('button', { name: 'Inspeccionar' })).toBeDisabled()
    // Ctrl+Enter con cuerpo en blanco tampoco inspecciona
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    expect(llamadasPredict(f)).toHaveLength(1)
  })

  it('contador de ventana: normal y excedido', async () => {
    mockFetch()
    render(<App />)
    await screen.findByText('N.º 001')
    expect(screen.getByText(/BERT lee hasta 1000 caracteres/)).toBeInTheDocument()
    await userEvent.clear(cuerpoBox())
    await userEvent.click(cuerpoBox())
    await userEvent.paste('a'.repeat(1200))
    expect(screen.getByText(/solo lee los primeros 1000 caracteres/)).toBeInTheDocument()
    expect(screen.getByText(/1[.,]000 \/ 1[.,]000 car\./)).toBeInTheDocument()
  })

  it('límites maxLength de asunto y cuerpo', async () => {
    mockFetch()
    render(<App />)
    expect(asuntoBox()).toHaveAttribute('maxlength', '1000')
    expect(cuerpoBox()).toHaveAttribute('maxlength', '20000')
    await screen.findByText('Phishing')
  })
})

describe('App: muestras', () => {
  it('muestra 4 muestras y al hacer clic carga e inspecciona', async () => {
    const f = mockFetch()
    render(<App />)
    await screen.findByText('N.º 001')
    const lista = screen.getByRole('list')
    expect(within(lista).getAllByRole('button')).toHaveLength(4)
    await userEvent.click(within(lista).getByRole('button', { name: /Q3 budget review/ }))
    expect(asuntoBox()).toHaveValue('Q3 budget review')
    expect(cuerpoBox()).toHaveValue(
      "Hi team, please review the Q3 budget report attached and let me know your thoughts before Friday's meeting.",
    )
    await screen.findByText('N.º 002')
    expect(cuerpoEnviado(llamadasPredict(f).at(-1)!).subject).toBe('Q3 budget review')
  })

  it('las muestras se deshabilitan mientras carga', async () => {
    let resolver!: (r: Response) => void
    mockFetch({ predict: () => new Promise<Response>((r) => (resolver = r)) })
    render(<App />)
    const lista = screen.getByRole('list')
    await waitFor(() => expect(within(lista).getAllByRole('button')[0]).toBeDisabled())
    await act(async () => resolver(json(200, HAM)))
    await waitFor(() => expect(within(lista).getAllByRole('button')[0]).toBeEnabled())
  })
})

describe('App: health', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('en línea: muestra dispositivo en mayúsculas', async () => {
    mockFetch()
    render(<App />)
    expect(await screen.findByText(/BERT-base · CPU · en línea/)).toBeInTheDocument()
  })

  it('servicio ML caído: "Servicio de inferencia detenido"', async () => {
    mockFetch({ health: () => json(200, { gateway: 'ok', mlService: 'down', device: null }) })
    render(<App />)
    expect(await screen.findByText('Servicio de inferencia detenido')).toBeInTheDocument()
  })

  it('gateway caído: "Sin conexión con el gateway"', async () => {
    mockFetch({ health: () => json(500, {}) })
    render(<App />)
    expect(await screen.findByText('Sin conexión con el gateway')).toBeInTheDocument()
  })

  it('sondea cada 10 s y refleja el cambio de estado', async () => {
    let caido = false
    const f = mockFetch({
      health: () => json(200, caido ? { gateway: 'ok', mlService: 'down', device: null } : SALUD_OK),
    })
    render(<App />)
    await screen.findByText(/en línea/)
    caido = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(await screen.findByText('Servicio de inferencia detenido')).toBeInTheDocument()
    expect(f.mock.calls.filter(([u]) => String(u).endsWith('/health')).length).toBeGreaterThanOrEqual(2)
  })

  it('al desmontar se detiene el sondeo', async () => {
    const f = mockFetch()
    const { unmount } = render(<App />)
    await screen.findByText(/en línea/)
    unmount()
    const antes = f.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(f.mock.calls.length).toBe(antes)
  })
})
