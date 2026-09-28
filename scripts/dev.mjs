// Levanta los tres servicios de Estrella con un solo comando:
//   node scripts/dev.mjs     (o: pnpm dev)
// Ctrl + C los detiene todos.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  FRONTEND,
  GATEWAY,
  ML,
  PUERTOS,
  WIN,
  azul,
  encontrarPython,
  linea,
  fallo,
  gris,
  modeloPresente,
  negrita,
  verde,
  amarillo,
} from './comun.mjs'

// Verificaciones previas
const python = encontrarPython()
const faltantes = []
if (!python) faltantes.push('Python 3.10–3.13')
if (!modeloPresente()) faltantes.push('el modelo en models/bert_phishing/')
if (!existsSync(join(GATEWAY, '.env'))) faltantes.push('backend/gateway/.env')
if (!existsSync(join(GATEWAY, 'node_modules'))) faltantes.push('dependencias del gateway')
if (!existsSync(join(FRONTEND, 'node_modules'))) faltantes.push('dependencias del frontend')
if (faltantes.length) {
  fallo(`Falta: ${faltantes.join(', ')}.`)
  fallo('Corre primero:  pnpm bootstrap   (o: node scripts/setup.mjs)')
  process.exit(1)
}

const servicios = [
  { nombre: 'modelo ', pintar: amarillo, cmd: python.cmd, args: ['wsgi.py'], cwd: ML },
  { nombre: 'gateway', pintar: azul, cmd: 'pnpm', args: ['start:dev'], cwd: GATEWAY },
  { nombre: 'web    ', pintar: verde, cmd: 'pnpm', args: ['dev'], cwd: FRONTEND },
]

const hijos = []
let cerrando = false

function detenerTodo(codigo = 0) {
  if (cerrando) return
  cerrando = true
  console.log(gris('\nDeteniendo servicios…'))
  for (const h of hijos) {
    if (h.exitCode !== null) continue
    // En Windows hay que matar el árbol de procesos (pnpm lanza procesos hijos)
    if (WIN) spawnSync('taskkill', ['/pid', String(h.pid), '/T', '/F'], { stdio: 'ignore' })
    else h.kill('SIGTERM')
  }
  setTimeout(() => process.exit(codigo), 300)
}

for (const s of servicios) {
  const hijo = spawn(linea(s.cmd, s.args), {
    cwd: s.cwd,
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1', PYTHONUNBUFFERED: '1' },
  })
  const prefijo = s.pintar(`[${s.nombre}]`)
  const volcar = (flujo) => (datos) => {
    for (const linea of datos.toString().split(/\r?\n/)) {
      if (linea.trim()) flujo.write(`${prefijo} ${linea}\n`)
    }
  }
  hijo.stdout.on('data', volcar(process.stdout))
  hijo.stderr.on('data', volcar(process.stderr))
  hijo.on('exit', (code) => {
    if (cerrando) return
    fallo(`${s.nombre.trim()} terminó (código ${code}). Deteniendo el resto.`)
    detenerTodo(code ?? 1)
  })
  hijos.push(hijo)
}

process.on('SIGINT', () => detenerTodo(0))
process.on('SIGTERM', () => detenerTodo(0))

console.log(
  negrita('\nEstrella levantándose (el modelo tarda unos segundos en cargar):\n') +
    `  ${verde('Web')}        http://localhost:${PUERTOS.frontend}\n` +
    `  ${azul('Swagger')}    http://localhost:${PUERTOS.gateway}/docs\n` +
    `  ${azul('API')}        http://localhost:${PUERTOS.gateway}/api/v1\n` +
    `  ${amarillo('Modelo')}     http://127.0.0.1:${PUERTOS.ml}  ${gris('(interno)')}\n` +
    gris('  Ctrl + C para detener todo\n'),
)
