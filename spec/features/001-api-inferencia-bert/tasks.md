# Tasks — API de inferencia BERT

Checklist de tareas atómicas y verificables. Marcar `[x]` solo cuando esté
implementado Y verificado, no solo escrito. Subagente sugerido entre
corchetes.

## Preparación

- [x] Confirmar con el usuario las dependencias nuevas a instalar (`waitress`; deps de Nest listadas en `plan.md`) — aprobado 2026-09-27 [coordinador]
- [x] Verificar con Context7 la sintaxis vigente de Flask, NestJS (`ThrottlerModule`, `ValidationPipe`, Swagger) y `transformers` (`AutoTokenizer`) [implementador-api] <!-- verificado contra los .d.ts instalados (Nest 12, throttler 6.7) y ejecución real -->

## Backend — servicio ML (Flask)

- [x] Crear `backend/ml-service/requirements.txt`, `requirements-dev.txt` y `.env.example` [implementador-api]
- [x] `app/config.py`: variables de entorno con defaults y resolución de `MODEL_DIR` [implementador-api]
- [x] `app/preprocessing.py`: copiar `limpiar_para_bert` literal del notebook 04 + `construir_texto` [implementador-api]
- [x] `app/classifier.py`: `BertPhishingClassifier` con carga única, CPU por defecto (`ML_DEVICE`), `TORCH_NUM_THREADS`, `local_files_only` y `predict` en batch [implementador-api]
- [x] `app/errors.py`: handlers JSON sin trazas [implementador-api]
- [x] `app/routes.py`: `/health`, `/predict`, `/predict/batch` con validación mínima [implementador-api]
- [x] `app/__init__.py`: `create_app(classifier=None)` [implementador-api]
- [x] `wsgi.py`: precarga + warm-up + waitress en `ML_HOST:ML_PORT`; sale con error si falta el modelo [implementador-api]
- [x] Arranque manual: `python wsgi.py` carga el modelo y `/health` reporta `device: cpu` [validador-experimental]

## Backend — gateway (NestJS, pnpm)

- [x] Scaffold con `pnpm dlx @nestjs/cli new gateway --package-manager pnpm --skip-git` dentro de `backend/` (verificar que no se generó `package-lock.json`) [implementador-api]
- [x] Instalar deps con `pnpm add` (previa confirmación) [implementador-api]
- [x] `.env.example` y validación de env en `ConfigModule` [implementador-api]
- [x] `main.ts`: prefijo `api/v1`, `ValidationPipe`, límite de body, CORS, Swagger solo en dev [implementador-api]
- [x] `common/http-exception.filter.ts` con formato `{ error: { code, message } }` [implementador-api]
- [x] `common/api-key.guard.ts` con `timingSafeEqual` [implementador-api]
- [x] `common/logging.interceptor.ts` sin contenido de email [implementador-api]
- [x] `ml-client/ml-client.service.ts` con `fetch` + timeout → 503 [implementador-api]
- [x] DTOs de request/response con decoradores de validación y Swagger [implementador-api]
- [x] `predict` module/controller/service (`/predict`, `/predict/batch`) con throttler [implementador-api]
- [x] `health` module/controller (sin API key, reporta `mlService: ok|down`) [implementador-api]

## Frontend

- No aplica en esta feature.

## Tests unitarios

- [x] pytest: paridad de `limpiar_para_bert` con el notebook (HTML, entidades, URLs → `[URL]`, emails → `[EMAIL]`, espacios, no-string → `""`) — criterio 2 [validador-experimental]
- [x] pytest: `construir_texto` concatena y trunca a 1,000 chars; marca `truncated` — criterio 3 [validador-experimental]
- [x] vitest: DTOs rechazan body vacío/ausente/>20k, subject >1k, campos extra, batch 0 o >32 — criterios 4 y 5 [validador-experimental]
- [x] vitest: `ApiKeyGuard` acepta la key correcta y rechaza ausente/incorrecta — criterio 6 [validador-experimental]
- [x] vitest: `MlClientService` mapea timeout y conexión rechazada a 503 — criterio 8 [validador-experimental]

## Tests de integración

- [x] pytest: rutas Flask con clasificador falso (contrato de respuesta, suma de probabilidades = 1, orden en batch, errores 400) — criterios 1, 4 [validador-experimental]
- [x] pytest `slow`: modelo real clasifica los 4 ejemplos del notebook igual que el notebook — criterio 2 [validador-experimental]
- [x] vitest e2e: `/api/v1/predict`, `/predict/batch`, `/health` con `MlClientService` mockeado (200, 400, 401, 429, 503) — criterios 1, 4–9 [validador-experimental]

## Tests de seguridad

- [x] Validación de inputs cubierta con test (tests unitarios de DTOs y de rutas Flask)
- [x] Control de acceso cubierto con test: sin API key o con key incorrecta → 401
- [x] Test de aislamiento multi-tenant — **No aplica** (proyecto sin tenants, ver 000 punto 3)
- [x] Test de logs: enviar un email con un marcador único y verificar que no aparece en logs de Flask ni de Nest — criterio 11
- [x] Flask usa `127.0.0.1` por defecto y falla al arrancar sin modelo — criterio 10
- [x] Errores no filtran stack traces (forzar excepción interna → 500 con formato uniforme)
- [ ] `pnpm audit` y `pip-audit` sin CVEs críticos sin justificar [auditor-seguridad] <!-- pip-audit no instalado -->
- [x] Revisar contra `spec/features/000-seguridad-transversal/spec.md` antes de cerrar [auditor-seguridad] <!-- 2026-09-27: APROBADO CON OBSERVACIONES, sin P0; P1 pip-audit pendiente -->

## E2E

- [x] Flask real + gateway real: `POST /api/v1/predict` con los 4 ejemplos del notebook devuelve las clases esperadas — criterios 1, 2
- [ ] Latencia p95 < 300 ms sobre 50 requests en CPU con `TORCH_NUM_THREADS=2` — criterio 12 <!-- parcial: con la laptop conectada pasó (p95 141–174 ms); en batería da 360–460 ms. Re-medir conectada con RUN_PERF=1 y en el hardware de producción (feature 007) -->
- [x] Apagar Flask → `/health` muestra `mlService: "down"` y `/predict` da 503 — criterios 7, 8
- [x] Swagger accesible en `/docs` en development y ausente en production; gateway no arranca sin `API_KEY` — criterio 13

## Cierre

- [x] Todos los tests pasan (`python -m pytest`, `pnpm test`, `pnpm test:e2e`) y `ruff check` limpio — criterio 14
- [x] Actualizar comandos reales en `CLAUDE.md` si difieren de los previstos
- [x] Nota de sesión en `docs/`

---

*Al completar una tarea, márcala con `[x]`. Si surge una tarea nueva no
prevista, agrégala al final de su sección correspondiente en vez de
modificar las ya existentes. Si una tarea queda parcial, déjala en `[ ]`
con una nota `<!-- parcial: falta X -->`.*
