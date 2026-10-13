# Plan — Pruebas unitarias de la arquitectura

## Enfoque técnico
Pruebas aisladas por unidad con dependencias simuladas: clasificador falso en
Flask (`app.config["CLASSIFIER"]`), `fetch`/`MlClientService` simulados en
gateway y frontend. Cada caso lleva ID (`U<n>-<nn>`) y el marcador pytest
`caso(id)` para alimentar `reports/pruebas_unitarias.csv`. Sin GPU, sin red, sin
modelo real. Gateway con Vitest (ya instalado); ml-service con pytest;
frontend con un runner nuevo (pendiente de aprobación).

## Archivos a crear/modificar
- `backend/ml-service/tests/unit/test_u1_limpieza.py` … `test_u5_respuesta.py` — existentes; revisar y completar.
- `backend/ml-service/tests/unit/test_u6_rutas.py` — rutas `/health`, `/predict`, `/predict/batch` con clasificador falso (nuevo).
- `backend/ml-service/tests/unit/test_u7_errores_logging.py` — manejadores de errores y logs sin PII (nuevo).
- `backend/ml-service/tests/unit/conftest.py` — fixtures y generación del CSV (existente).
- `backend/gateway/src/**/*.spec.ts` — existentes y nuevos; completar huecos (`logging.interceptor`, `http-exception.filter`, `predict.service`, `health.controller`, DTO).
- `backend/gateway/src/predict/predict.controller.spec.ts` — controller con service simulado (nuevo).
- `frontend/src/api.test.ts` — pruebas de `request`/`ApiError` (nuevo).
- `frontend/package.json`, `frontend/vite.config.ts` — script `test` y config del runner (solo tras aprobación).
- `spec/features/README.md` — fila 008 en el índice.

## Endpoints bajo prueba
| Método | Path | Descripción |
|---|---|---|
| GET | `/health` (Flask) | Estado, device y modelo |
| POST | `/predict` (Flask) | Un email → etiqueta y probabilidades |
| POST | `/predict/batch` (Flask) | Lote de emails (máx. `MAX_BATCH`) |
| GET | `/api/v1/health` (gateway) | Estado del gateway y del ml-service |
| POST | `/api/v1/predict` (gateway) | Valida, llama al ml-service, formatea respuesta |
| POST | `/api/v1/predict/batch` (gateway) | Igual, en lote |

## Datos de entrada / salida
| Campo | Tipo | Descripción |
|---|---|---|
| `subject` | string (opcional, ≤ `max_subject_chars`) | Asunto |
| `body` | string (requerido, ≤ `max_body_chars`) | Cuerpo |
| `label` | `HAM` \| `PHISHING` | Resultado simulado |
| `confidence`, `probabilities` | number | Valores fijos del fake |
| `error.code`, `error.message` | string | Formato de error de la API |
| `reports/pruebas_unitarias.csv` | CSV | ID, Fecha, Prueba, Entrada, Resultado, Estado, Observaciones, Entorno |

## Riesgos
- Dependencias nuevas en frontend → pedir aprobación antes de `pnpm add -D`.
- Tests acoplados a mensajes de error en español → afirmar sobre `code` y estado HTTP, y solo sobre fragmentos estables del mensaje.
- Un test que cargue el BERT real vuelve lenta la suite → marcador `slow` excluido de `tests/unit`.
- Confundir pruebas de arquitectura con evaluación del modelo → los fakes devuelven valores fijos; no se afirma nada sobre calidad de predicción.
