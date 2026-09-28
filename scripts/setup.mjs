// Instala todo lo necesario para correr Estrella en local:
//   node scripts/setup.mjs            (o: pnpm bootstrap)
//   node scripts/setup.mjs --dev      (además instala pytest y ruff)
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FRONTEND,
  GATEWAY,
  ML,
  MODELO,
  PUERTOS,
  aviso,
  correr,
  encontrarPython,
  fallo,
  modeloPresente,
  negrita,
  ok,
  tienePnpm,
} from './comun.mjs'

const conDev = process.argv.includes('--dev')
let errores = 0

console.log(negrita('\nEstrella · instalación\n'))

// 1. Herramientas base
const [mayorNode] = process.versions.node.split('.').map(Number)
if (mayorNode < 24) aviso(`Node ${process.versions.node}: se recomienda Node 24 o superior.`)
else ok(`Node ${process.versions.node}`)

const pnpm = tienePnpm()
if (!pnpm) {
  fallo('No se encontró pnpm. Instálalo con:  corepack enable pnpm   (no uses npm)')
  process.exit(1)
}
ok(`pnpm ${pnpm}`)

const python = encontrarPython()
if (!python) {
  fallo('No se encontró Python 3.10–3.13. Instálalo desde https://www.python.org/downloads/')
  process.exit(1)
}
ok(`${python.version} (${python.cmd})`)

// 2. Dependencias
console.log(negrita('\n→ Servicio de inferencia (Python)'))
const req = conDev ? 'requirements-dev.txt' : 'requirements.txt'
if (!correr(python.cmd, ['-m', 'pip', 'install', '-r', req], ML)) {
  fallo('Falló pip install. Revisa el mensaje de arriba.')
  errores++
}

console.log(negrita('\n→ Gateway (NestJS)'))
if (!correr('pnpm', ['install', '--frozen-lockfile'], GATEWAY)) errores++

console.log(negrita('\n→ Frontend (React + Vite)'))
if (!correr('pnpm', ['install', '--frozen-lockfile'], FRONTEND)) errores++

// 3. Archivos de entorno (solo si no existen; nunca se sobrescriben)
console.log(negrita('\n→ Configuración local'))
const envGateway = join(GATEWAY, '.env')
if (!existsSync(envGateway)) {
  const clave = randomBytes(24).toString('hex')
  const contenido = readFileSync(join(GATEWAY, '.env.example'), 'utf8')
    .replace(/^NODE_ENV=.*$/m, 'NODE_ENV=development')
    .replace(/^API_KEY=.*$/m, `API_KEY=${clave}`)
    .replace(/^CORS_ORIGINS=.*$/m, `CORS_ORIGINS=http://localhost:${PUERTOS.frontend}`)
  writeFileSync(envGateway, contenido)
  ok('Creado backend/gateway/.env con una API key nueva')
} else {
  ok('backend/gateway/.env ya existe (no se tocó)')
}

const envFront = join(FRONTEND, '.env.local')
if (!existsSync(envFront)) {
  const clave = readFileSync(envGateway, 'utf8').match(/^API_KEY=(.*)$/m)?.[1] ?? ''
  writeFileSync(
    envFront,
    `GATEWAY_URL=http://localhost:${PUERTOS.gateway}\nGATEWAY_API_KEY=${clave}\n`,
  )
  ok('Creado frontend/.env.local con la misma API key')
} else {
  ok('frontend/.env.local ya existe (no se tocó)')
}

// 4. Modelo entrenado (no viene en el repositorio: pesa ~440 MB)
console.log(negrita('\n→ Modelo BERT'))
if (modeloPresente()) {
  ok('Modelo encontrado en models/bert_phishing/')
} else {
  aviso(`Falta el modelo en ${MODELO}`)
  aviso('Copia ahí la carpeta bert_phishing (config.json, model.safetensors, tokenizer*.json)')
  aviso('o genérala corriendo notebooks/04_bert_finetuning.ipynb.')
  errores++
}

console.log()
if (errores) {
  fallo(`Instalación terminada con ${errores} problema(s). Revisa los avisos de arriba.`)
  process.exit(1)
}
ok(negrita('Todo listo. Para levantar el proyecto:  pnpm dev   (o: node scripts/dev.mjs)\n'))
