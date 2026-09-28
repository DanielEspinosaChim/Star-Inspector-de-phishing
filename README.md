# Estrella

Detección de phishing en emails con un modelo BERT afinado con 131,339 emails
(F1 en test 0.9945). Tiene tres piezas:

| Pieza | Carpeta | Puerto | Qué hace |
|---|---|---|---|
| Web | `frontend/` | **5173** | Pantalla para pegar un email y ver el veredicto |
| API (gateway) | `backend/gateway/` | **3000** | API pública con API key y documentación Swagger |
| Servicio de inferencia | `backend/ml-service/` | 5000 (solo local) | Carga el modelo BERT y predice, en CPU |

## Requisitos

- **Node.js 24** o superior
- **pnpm** (no uses npm). Si no lo tienes: `corepack enable pnpm`
- **Python 3.10 a 3.13**
- **El modelo entrenado** en `models/bert_phishing/` (`config.json`, `model.safetensors`,
  `tokenizer.json`, `tokenizer_config.json`). No viene en el repositorio porque pesa
  unos 440 MB: cópialo ahí o genéralo con `notebooks/04_bert_finetuning.ipynb`.

## Instalar (una sola vez)

```bash
pnpm bootstrap
```

Instala las dependencias de Python y de las dos apps de Node, y crea los archivos de
configuración local (`backend/gateway/.env` con una API key nueva y
`frontend/.env.local`). Si esos archivos ya existen, no los toca.

Si prefieres no usar pnpm en la raíz: `node scripts/setup.mjs`.
Para instalar también las herramientas de pruebas (pytest, ruff): `pnpm bootstrap:dev`.

## Correr

```bash
pnpm dev
```

Levanta los tres servicios juntos. `Ctrl + C` los detiene todos.

| Abre | Dirección |
|---|---|
| La web | http://localhost:5173 |
| Swagger (documentación y pruebas de la API) | http://localhost:3000/docs |
| La API | http://localhost:3000/api/v1 |

El modelo tarda unos 10 segundos en cargar; mientras tanto la web muestra
"Servicio de inferencia detenido" y luego cambia a "en línea".

## Usar la API desde Swagger

1. Abre http://localhost:3000/docs y pulsa **Authorize**.
2. Pega el valor de `API_KEY` que está en `backend/gateway/.env` (solo el valor).
3. Abre `POST /api/v1/predict`, pulsa **Try it out**, elige un ejemplo y **Execute**.

Desde la terminal:

```bash
curl -X POST http://localhost:3000/api/v1/predict \
  -H "x-api-key: TU_API_KEY" -H "content-type: application/json" \
  -d '{"subject":"Account suspended","body":"Click here to verify your PayPal account"}'
```

## Correr cada pieza por separado

```bash
cd backend/ml-service && python wsgi.py     # modelo, puerto 5000
cd backend/gateway && pnpm start:dev        # API, puerto 3000
cd frontend && pnpm dev                     # web, puerto 5173
```

## Pruebas

```bash
cd backend/ml-service && python -m pytest   # requiere pnpm bootstrap:dev
cd backend/gateway && pnpm test && pnpm test:e2e
```

## Documentación del proyecto

- `CLAUDE.md` — reglas y convenciones del proyecto
- `spec/` — misión, stack, roadmap y specs de cada feature (Spec-Driven Development)
- `docs/` — notas de cada sesión de trabajo
