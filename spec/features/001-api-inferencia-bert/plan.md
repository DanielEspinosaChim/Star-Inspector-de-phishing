# Plan — API de inferencia BERT

## Enfoque técnico

Dos procesos separados por responsabilidad. **Flask** vive junto a Python y
los modelos: solo hace inferencia **en CPU** con el modelo precargado al
arrancar, no es público (escucha en `127.0.0.1` o en la red privada del
despliegue) y revalida lo mínimo. **NestJS** es el borde público: DTOs, API key, rate
limit, Swagger, manejo uniforme de errores y timeouts hacia Flask. Así, el
día que llegue el modelo conversacional (feature 006) solo se agrega una
ruta en Flask y un módulo en Nest, sin rehacer la seguridad.

El preprocesamiento se **copia** literalmente del notebook 04
(`limpiar_para_bert`) a `backend/ml-service/app/preprocessing.py`, porque el
proyecto no tiene paquete `src/` compartido. Un test de paridad garantiza
que ambas versiones no diverjan.

## Archivos a crear/modificar

### `backend/ml-service/` (Flask)

- `backend/ml-service/requirements.txt` — dependencias de runtime: `flask`,
  `waitress`, `transformers`, `safetensors` (torch se instala aparte: en
  producción con el wheel CPU `--index-url https://download.pytorch.org/whl/cpu`;
  en local ya está el build cu128, que corre en CPU sin cambios).
- `backend/ml-service/requirements-dev.txt` — `pytest`, `ruff` (ya instalados en local).
- `backend/ml-service/.env.example` — `MODEL_DIR=../../models/bert_phishing`,
  `ML_HOST=127.0.0.1`, `ML_PORT=5000`, `ML_DEVICE=cpu`, `TORCH_NUM_THREADS=2`,
  `WAITRESS_THREADS=2`, `MAX_LEN=128`, `MAX_CHARS=1000`, `MAX_BATCH=32`,
  `LOG_LEVEL=INFO`.
- `backend/ml-service/app/__init__.py` — `create_app(classifier=None)`: app
  factory; permite inyectar un clasificador falso en tests.
- `backend/ml-service/app/config.py` — lectura de variables de entorno con
  defaults; resuelve `MODEL_DIR` relativo a la raíz del repo.
- `backend/ml-service/app/preprocessing.py` — `limpiar_para_bert(text)` (copia
  exacta de la celda 9 del notebook 04) y `construir_texto(subject, body,
  max_chars)`.
- `backend/ml-service/app/classifier.py` — clase `BertPhishingClassifier`:
  carga `AutoTokenizer` + `BertForSequenceClassification` desde
  `MODEL_DIR` con `local_files_only=True` (safetensors, sin internet),
  `.eval()`, device de `ML_DEVICE` (default `cpu`), `torch.set_num_threads`;
  `predict(items) -> list[Prediction]` en batch con `torch.inference_mode()`
  en fp32 (sin autocast en CPU) y padding dinámico (más rápido en CPU; el
  attention mask hace que el resultado sea equivalente).
- `backend/ml-service/app/routes.py` — blueprint con `/health`, `/predict`,
  `/predict/batch`; validación mínima; errores JSON.
- `backend/ml-service/app/errors.py` — handlers que devuelven
  `{ "error": { "code", "message" } }` sin trazas.
- `backend/ml-service/wsgi.py` — precarga el modelo (falla si no existe) y
  arranca con `waitress.serve(app, host=ML_HOST, port=ML_PORT, threads=WAITRESS_THREADS)`.
- `backend/ml-service/tests/test_latency.py` — marcado `slow`: p95 < 300 ms en CPU con 2 hilos.
- `backend/ml-service/tests/conftest.py` — fixture `client` con clasificador falso.
- `backend/ml-service/tests/test_preprocessing.py` — paridad con el notebook.
- `backend/ml-service/tests/test_routes.py` — contratos, validación, errores.
- `backend/ml-service/tests/test_classifier_real.py` — marcado `@pytest.mark.slow`:
  carga el modelo real y verifica los 4 ejemplos del notebook.
- `backend/ml-service/tests/test_logging.py` — ningún log contiene el texto.

### `backend/gateway/` (NestJS, creado con `pnpm dlx @nestjs/cli new gateway --package-manager pnpm --skip-git`)

- `backend/gateway/package.json` — scripts del scaffold + deps:
  `@nestjs/config`, `@nestjs/throttler`, `@nestjs/swagger`,
  `class-validator`, `class-transformer`.
- `backend/gateway/.env.example` — `PORT=3000`, `ML_SERVICE_URL=http://127.0.0.1:5000`,
  `ML_TIMEOUT_MS=10000`, `API_KEY=`, `THROTTLE_LIMIT=60`,
  `THROTTLE_TTL_MS=60000`, `CORS_ORIGINS=`, `NODE_ENV=development`.
- `backend/gateway/src/main.ts` — prefijo global `api/v1`, `ValidationPipe`
  (`whitelist`, `forbidNonWhitelisted`, `transform`), límite de body 1 MB (32 emails × ~21k chars),
  CORS según `.env`, Swagger en `/docs` solo en development, filtro global
  de errores.
- `backend/gateway/src/config/env.validation.ts` — valida el entorno; sin `API_KEY` (≥16 chars) no arranca.
- `backend/gateway/src/setup-app.ts` — config global compartida por `main.ts` y los e2e.
- `backend/gateway/pnpm-workspace.yaml` — `allowBuilds` (telemetría `@scarf/scarf` denegada).
- `backend/gateway/src/app.module.ts` — `ConfigModule` (con validación de env),
  `ThrottlerModule`, `HealthModule`, `PredictModule`, `MlClientModule`.
- `backend/gateway/src/common/api-key.guard.ts` — compara `x-api-key` con
  `API_KEY` en tiempo constante (`crypto.timingSafeEqual`).
- `backend/gateway/src/common/http-exception.filter.ts` — formato de error
  uniforme, sin stack traces.
- `backend/gateway/src/common/logging.interceptor.ts` — loguea request id,
  ruta, status, latencia y longitud del body; **nunca** contenido.
- `backend/gateway/src/ml-client/ml-client.module.ts`
- `backend/gateway/src/ml-client/ml-client.service.ts` — `fetch` nativo a
  Flask con `AbortSignal.timeout(ML_TIMEOUT_MS)`; mapea fallos a
  `ServiceUnavailableException('ML_SERVICE_UNAVAILABLE')`.
- `backend/gateway/src/predict/predict.module.ts`
- `backend/gateway/src/predict/predict.controller.ts` — `POST /predict`,
  `POST /predict/batch`, protegido por `ApiKeyGuard` + `ThrottlerGuard`.
- `backend/gateway/src/predict/predict.service.ts` — orquesta y agrega `latencyMs`.
- `backend/gateway/src/predict/dto/predict-request.dto.ts` — `PredictRequestDto`, `PredictBatchRequestDto`.
- `backend/gateway/src/predict/dto/predict-response.dto.ts` — `PredictResponseDto`, `PredictBatchResponseDto`.
- `backend/gateway/src/health/health.module.ts`
- `backend/gateway/src/health/health.controller.ts` — `GET /health`.
- `backend/gateway/src/**/*.spec.ts` — unit tests junto a cada archivo.
- `backend/gateway/test/helpers.ts` — entorno de test, `FakeMlClient`, `createTestApp`.
- `backend/gateway/test/predict.e2e-spec.ts` — e2e con `MlClientService` simulado.
- `backend/gateway/test/production.e2e-spec.ts` — `NODE_ENV=production`: sin Swagger, rate limit 429.
- `backend/gateway/test/logging.e2e-spec.ts` — ningún log contiene email ni API key.
- `backend/gateway/test/full-stack.e2e-spec.ts` — e2e contra Flask real
  (se salta si `ML_SERVICE_URL` no responde).

### Raíz

- `.gitignore` — ya creado en el bootstrap (`.env*`, `node_modules/`, datos y modelos pesados).
- `spec/features/001-api-inferencia-bert/tasks.md` — marcar avance.
- `docs/AAAA-MM-DD-*.md` — notas de sesión.

## Endpoints

### Públicos — gateway NestJS (`http://localhost:3000`)

| Método | Path | Auth | Descripción |
|---|---|---|---|
| GET | `/api/v1/health` | No | Estado del gateway y del servicio ML (`ok`/`down`) + device |
| POST | `/api/v1/predict` | `x-api-key` | Clasifica un email: HAM o PHISHING con probabilidades |
| POST | `/api/v1/predict/batch` | `x-api-key` | Clasifica de 1 a 32 emails en un solo llamado |
| GET | `/docs` | No (solo dev) | Swagger UI / OpenAPI |

### Internos — Flask (`http://127.0.0.1:5000`, no expuesto)

| Método | Path | Descripción |
|---|---|---|
| GET | `/health` | `{ status: "ok", device, model }` |
| POST | `/predict` | Un email → predicción |
| POST | `/predict/batch` | Lista de emails → predicciones en el mismo orden |

## Modelo de datos

Sin persistencia. Contratos JSON:

**PredictRequest** (`/predict`, y cada item de `emails` en batch)

| Campo | Tipo | Notas |
|---|---|---|
| `subject` | string | Opcional, default `""`, máx. 1,000 caracteres |
| `body` | string | Requerido, 1–20,000 caracteres |

**PredictBatchRequest**

| Campo | Tipo | Notas |
|---|---|---|
| `emails` | PredictRequest[] | Requerido, 1–32 items |

**PredictResponse**

| Campo | Tipo | Notas |
|---|---|---|
| `label` | `"HAM" \| "PHISHING"` | argmax de las probabilidades (índice 0 = HAM, 1 = PHISHING) |
| `confidence` | number | Probabilidad de la clase predicha, [0, 1] |
| `probabilities.ham` | number | softmax[0] |
| `probabilities.phishing` | number | softmax[1] |
| `model` | string | `"bert-base-uncased-phishing"` |
| `truncated` | boolean | `true` si el texto superó 1,000 caracteres o 128 tokens |
| `latencyMs` | number | Solo en la respuesta del gateway |

**PredictBatchResponse**: `{ results: PredictResponse[], latencyMs: number }`

**Error**: `{ "error": { "code": string, "message": string } }` — códigos:
`VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `RATE_LIMITED` (429),
`ML_SERVICE_UNAVAILABLE` (503), `INTERNAL_ERROR` (500).

## Flujo técnico paso a paso

1. Flask arranca (`python wsgi.py`): lee config, fija hilos de torch, carga
   tokenizer + modelo desde `MODEL_DIR` una vez en CPU, `eval()`, y hace
   una inferencia de calentamiento. Si el modelo no está, sale con error.
2. Nest arranca (`pnpm start:dev`): valida `.env` (falla si no hay
   `API_KEY`), registra guards, pipes, filtro y Swagger.
3. Cliente envía `POST /api/v1/predict` con `x-api-key`.
4. `ThrottlerGuard` → `ApiKeyGuard` → `ValidationPipe` (DTO). Si falla,
   responde 429/401/400 sin tocar Flask.
5. `PredictService` llama a `MlClientService.predict()` → `fetch` a
   `ML_SERVICE_URL/predict` con timeout.
6. Flask revalida, construye `texto = limpiar(subject) + ' ' + limpiar(body)`,
   trunca a 1,000 chars, tokeniza (`max_length=128`, `truncation=True`),
   inferencia con `inference_mode`, softmax.
7. Flask responde la predicción; Nest agrega `latencyMs` y responde 200.
8. Si Flask falla o excede el timeout → 503 `ML_SERVICE_UNAVAILABLE`.

## Consideraciones de seguridad específicas de esta feature

- Flask en `127.0.0.1` por defecto; en producción solo en la red privada
  entre gateway y servicio ML, nunca con puerto publicado a internet.
- El contenido del email nunca aparece en logs (ni en errores de
  validación: el mensaje de error dice qué campo falló, no su valor).
- `API_KEY` obligatoria en `.env`; comparación en tiempo constante.
- El path del modelo sale de configuración, nunca del request; solo se
  carga safetensors (sin pickle).
- Rate limit agresivo porque la inferencia en CPU es cara (~100 ms por email).
- `pnpm audit` y `pip-audit` antes de cerrar la feature.
