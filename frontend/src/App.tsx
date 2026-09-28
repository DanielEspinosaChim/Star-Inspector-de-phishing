import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ApiError, getHealth, predict, type Health, type Prediction } from './api'
import './App.css'

// El modelo lee subject + body limpios hasta 1000 caracteres (~128 tokens de BERT)
const VENTANA = 1000

const MUESTRAS = [
  {
    id: 'paypal',
    subject: 'Your account has been limited',
    body: 'Click here to verify your PayPal account immediately or it will be suspended. Login: http://paypal-verify.suspicious.com',
  },
  {
    id: 'budget',
    subject: 'Q3 budget review',
    body: "Hi team, please review the Q3 budget report attached and let me know your thoughts before Friday's meeting.",
  },
  {
    id: 'giftcard',
    subject: 'Congratulations!',
    body: 'Congratulations! You have been selected to receive a $500 Amazon gift card. Claim now before it expires!',
  },
  {
    id: 'call',
    subject: 'Re: call today',
    body: 'Can we reschedule the 3pm call to 4pm? I have a conflict with the client meeting.',
  },
]

const fmt = (n: number) => n.toFixed(3)
const pct = (n: number) => `${(n * 100).toFixed(1)} %`

type Informe = { numero: number; prediccion: Prediction; asunto: string }

export default function App() {
  const [subject, setSubject] = useState(MUESTRAS[0].subject)
  const [body, setBody] = useState(MUESTRAS[0].body)
  const [informe, setInforme] = useState<Informe | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [health, setHealth] = useState<Health | null>(null)
  const contador = useRef(0)
  const arrancado = useRef(false)

  const inspeccionar = useCallback(async (asunto: string, cuerpo: string) => {
    if (!cuerpo.trim()) return
    setCargando(true)
    setError(null)
    try {
      const prediccion = await predict(asunto, cuerpo)
      contador.current += 1
      setInforme({ numero: contador.current, prediccion, asunto })
    } catch (err) {
      setError(err instanceof ApiError ? mensajeError(err) : 'Ocurrió un error inesperado.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    const revisar = () => getHealth().then(setHealth).catch(() => setHealth(null))
    void revisar()
    const id = setInterval(revisar, 10_000)
    // Abre con una inspección real de la primera muestra (una sola vez)
    if (!arrancado.current) {
      arrancado.current = true
      void inspeccionar(MUESTRAS[0].subject, MUESTRAS[0].body)
    }
    return () => clearInterval(id)
  }, [inspeccionar])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void inspeccionar(subject, body)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void inspeccionar(subject, body)
  }

  function cargarMuestra(m: (typeof MUESTRAS)[number]) {
    setSubject(m.subject)
    setBody(m.body)
    void inspeccionar(m.subject, m.body)
  }

  const largo = subject.length + 1 + body.length
  const leido = Math.min(largo, VENTANA)
  const enLinea = health?.mlService === 'ok'

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">Star</span>
          <span className="brand-role">Inspector de phishing</span>
        </div>
        <span className={`status ${enLinea ? 'is-on' : 'is-off'}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          {health === null
            ? 'Sin conexión con el gateway'
            : enLinea
              ? `BERT-base · ${health.device?.toUpperCase()} · en línea`
              : 'Servicio de inferencia detenido'}
        </span>
      </header>

      <main className="desk">
        <form className="message" onSubmit={onSubmit}>
          <div className="message-band" aria-hidden="true" />
          <p className="eyebrow">Mensaje a inspeccionar</p>

          <div className="field-row">
            <label htmlFor="subject" className="hdr">
              Subject:
            </label>
            <input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={1000}
              placeholder="(sin asunto)"
              autoComplete="off"
            />
          </div>

          <label htmlFor="body" className="visually-hidden">
            Cuerpo del mensaje
          </label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={20000}
            rows={9}
            placeholder="Pega aquí el cuerpo del email."
            required
          />

          <div className="window">
            <div className="window-head">
              <span>Ventana del modelo</span>
              <span className="mono">
                {leido.toLocaleString('es-MX')} / {VENTANA.toLocaleString('es-MX')} car.
              </span>
            </div>
            <div className="window-track">
              <div className="window-fill" style={{ width: `${(leido / VENTANA) * 100}%` }} />
            </div>
            <p className="window-note">
              {largo > VENTANA
                ? `El modelo solo lee los primeros ${VENTANA} caracteres; el resto no influye en el resultado.`
                : 'BERT lee hasta 1000 caracteres o 128 tokens, lo que ocurra primero.'}
            </p>
          </div>

          <div className="message-actions">
            <span className="hint">Ctrl + Enter</span>
            <button type="submit" className="primary" disabled={cargando || !body.trim()}>
              {cargando ? 'Inspeccionando…' : 'Inspeccionar'}
            </button>
          </div>
        </form>

        <section className="report" aria-live="polite">
          <div className="report-head">
            <p className="eyebrow">Informe de inspección</p>
            {informe && <span className="mono folio">N.º {String(informe.numero).padStart(3, '0')}</span>}
          </div>

          {error && <p className="report-error">{error}</p>}

          {!informe && !error && <p className="report-empty">{cargando ? 'Inspeccionando…' : 'Sin inspecciones todavía.'}</p>}

          {informe && <Resultado informe={informe} atenuado={cargando} />}
        </section>
      </main>

      <section className="samples">
        <div className="samples-head">
          <h2>Muestras de prueba</h2>
          <p>Los cuatro emails con los que se validó el modelo en el notebook 04. Haz clic para inspeccionar uno.</p>
        </div>
        <ul>
          {MUESTRAS.map((m) => (
            <li key={m.id}>
              <button type="button" className="sample" onClick={() => cargarMuestra(m)} disabled={cargando}>
                <span className="sample-subject">{m.subject}</span>
                <span className="sample-snippet">{m.body}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer className="colophon">
        <span>Modelo: bert-base-uncased afinado con 131,339 emails (5 corpus públicos)</span>
        <span className="mono">F1 test 0.9945 · ROC-AUC 0.9996</span>
      </footer>
    </div>
  )
}

function Resultado({ informe, atenuado }: { informe: Informe; atenuado: boolean }) {
  const p = informe.prediccion
  const phishing = p.label === 'PHISHING'
  const tono = phishing ? 'alert' : 'clear'

  return (
    <div className={`result tone-${tono} ${atenuado ? 'is-dim' : ''}`}>
      <div className="stamp-wrap">
        <div className="stamp" key={informe.numero}>
          <span className="stamp-word">{phishing ? 'Phishing' : 'Legítimo'}</span>
          <span className="stamp-sub">{phishing ? 'No abrir enlaces' : 'Sin señales de fraude'}</span>
        </div>
      </div>

      <figure className="scale">
        <figcaption>
          <span>Probabilidad de phishing</span>
          <span className="mono scale-value">{fmt(p.probabilities.phishing)}</span>
        </figcaption>
        <div className="scale-track">
          <div className="scale-threshold" style={{ left: '50%' }}>
            <span>umbral 0.5</span>
          </div>
          <div className="scale-marker" style={{ left: `${p.probabilities.phishing * 100}%` }} />
        </div>
        <div className="scale-ticks mono" aria-hidden="true">
          <span>0</span>
          <span>0.25</span>
          <span>0.5</span>
          <span>0.75</span>
          <span>1</span>
        </div>
      </figure>

      <dl className="facts">
        <div>
          <dt>Confianza</dt>
          <dd className="mono">{pct(p.confidence)}</dd>
        </div>
        <div>
          <dt>P(legítimo)</dt>
          <dd className="mono">{fmt(p.probabilities.ham)}</dd>
        </div>
        <div>
          <dt>Latencia</dt>
          <dd className="mono">{Math.round(p.latencyMs)} ms</dd>
        </div>
        <div>
          <dt>Texto recortado</dt>
          <dd className="mono">{p.truncated ? 'sí' : 'no'}</dd>
        </div>
      </dl>
    </div>
  )
}

function mensajeError(err: ApiError): string {
  switch (err.code) {
    case 'NETWORK':
      return 'No hay conexión con el gateway. Revisa que esté corriendo en el puerto 3000.'
    case 'ML_SERVICE_UNAVAILABLE':
      return 'El servicio de inferencia no responde. Arráncalo con python wsgi.py en backend/ml-service.'
    case 'UNAUTHORIZED':
      return 'La API key no es válida. Revisa GATEWAY_API_KEY en frontend/.env.local.'
    case 'RATE_LIMITED':
      return 'Demasiadas inspecciones seguidas. Espera un minuto y vuelve a intentar.'
    default:
      return err.message
  }
}
