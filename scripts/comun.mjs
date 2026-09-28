// Utilidades compartidas por setup.mjs y dev.mjs (sin dependencias externas).
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
export const ML = join(RAIZ, 'backend', 'ml-service')
export const GATEWAY = join(RAIZ, 'backend', 'gateway')
export const FRONTEND = join(RAIZ, 'frontend')
export const MODELO = join(RAIZ, 'models', 'bert_phishing')

export const PUERTOS = { ml: 5000, gateway: 3000, frontend: 5173 }

export const WIN = process.platform === 'win32'

const color = (c) => (s) => (process.stdout.isTTY ? `\x1b[${c}m${s}\x1b[0m` : s)
export const verde = color('32')
export const rojo = color('31')
export const amarillo = color('33')
export const azul = color('36')
export const gris = color('90')
export const negrita = color('1')

export function ok(msg) {
  console.log(`${verde('✔')} ${msg}`)
}
export function aviso(msg) {
  console.log(`${amarillo('!')} ${msg}`)
}
export function fallo(msg) {
  console.error(`${rojo('✖')} ${msg}`)
}

/** Línea de comando para el shell (los argumentos son constantes del proyecto). */
export const linea = (cmd, args) => [cmd, ...args].join(' ')

/** Ejecuta un comando mostrando su salida; devuelve true si terminó bien. */
export function correr(cmd, args, cwd = RAIZ) {
  console.log(gris(`$ ${cmd} ${args.join(' ')}`))
  const r = spawnSync(linea(cmd, args), { cwd, stdio: 'inherit', shell: true })
  return r.status === 0
}

function version(cmd, args = ['--version']) {
  const r = spawnSync(linea(cmd, args), { encoding: 'utf8', shell: true })
  return r.status === 0 ? (r.stdout || r.stderr).trim() : null
}

/** Encuentra un Python 3.10–3.13 (torch 2.11 no tiene wheels para otras versiones). */
export function encontrarPython() {
  const candidatos = WIN ? ['python', 'py', 'python3'] : ['python3', 'python']
  for (const cmd of candidatos) {
    const v = version(cmd)
    const m = v?.match(/Python 3\.(\d+)/)
    if (m && Number(m[1]) >= 10 && Number(m[1]) <= 13) return { cmd, version: v }
  }
  return null
}

export function tienePnpm() {
  return version('pnpm')
}

export function modeloPresente() {
  return ['config.json', 'model.safetensors', 'tokenizer.json'].every((f) =>
    existsSync(join(MODELO, f)),
  )
}
