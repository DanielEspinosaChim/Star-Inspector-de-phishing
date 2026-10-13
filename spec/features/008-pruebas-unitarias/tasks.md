# Tasks — Pruebas unitarias de la arquitectura

Marcar `[x]` solo cuando esté implementado Y verificado. Subagente sugerido entre corchetes.

## Preparación
- [x] Confirmar con el usuario las dependencias nuevas del frontend (vitest, jsdom, testing-library) [coordinador]
- [x] Inventariar qué ya cubren `tests/unit/` (U1–U5) y los specs nuevos del gateway; listar huecos por criterio [validador-experimental]
- [x] Localizar el "Plan §4.1" de pruebas y resolver los `REVISAR` de la spec [coordinador]

## Servicio ML (Flask)
- [x] Revisar y completar U1–U5 (limpieza, tokenización, extracción, validación, respuesta) [implementador-api]
- [x] `test_u6_rutas.py`: `/health`, `/predict`, `/predict/batch` con clasificador falso [implementador-api]
- [x] `test_u7_errores_logging.py`: manejadores de error y logs sin contenido de emails [implementador-api]
- [x] Verificar que `reports/pruebas_unitarias.csv` se regenera completo [validador-experimental]

## Gateway (NestJS)
- [x] Completar specs de filter, interceptor, health, predict.service y DTO [implementador-api]
- [x] `predict.controller.spec.ts` con service simulado [implementador-api]
- [x] Verificar formato `{ error: { code, message } }` sin stack ni rutas [validador-experimental]

## Frontend
- [x] Instalar y configurar runner (solo tras aprobación) [implementador-api]
- [x] `api.test.ts`: éxito, error HTTP con/sin JSON, red caída, `ApiError` [implementador-api]

## Verificación
- [x] `cd backend/ml-service && python -m pytest tests/unit` en verde [validador-experimental]
- [x] `cd backend/gateway && pnpm test && pnpm lint` en verde [validador-experimental]
- [x] Runner del frontend en verde [validador-experimental]
- [x] Auditoría contra `spec/features/000-seguridad-transversal/spec.md` (PII en logs y fixtures) [auditor-seguridad]
- [x] Entrada en `docs/` con fecha, qué se hizo, pendientes y decisiones
