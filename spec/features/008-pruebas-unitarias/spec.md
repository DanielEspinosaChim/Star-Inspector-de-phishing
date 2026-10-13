# Spec — Pruebas unitarias de la arquitectura (API + frontend)

**Estado:** LISTO PARA IMPLEMENTAR

## Qué hace
Cubre con pruebas unitarias aisladas **la arquitectura del sistema**: endpoints
(servicio Flask y gateway NestJS), validación de entradas, manejo de errores,
logging sin PII, cliente HTTP del frontend y la función de limpieza
`limpiar_para_bert`. **No evalúa el modelo** (sin métricas ROC-AUC/F1, sin BERT
real, sin reentrenar): el clasificador se simula con mocks/fakes.

Parte de lo ya existente (sin commitear): `backend/ml-service/tests/unit/`
(U1–U5), specs nuevos del gateway (filter, interceptor, health, predict.service,
DTO) y `backend/ml-service/reports/pruebas_unitarias.csv`. La feature los
completa, los ordena y los deja verificados.

## Módulos que toca
- [x] Backend — servicio ML (Flask, `backend/ml-service/`)
- [x] Backend — gateway (NestJS, `backend/gateway/`)
- [x] Frontend
- [x] Notebooks (solo la función de limpieza, vía su réplica en `app/preprocessing.py`; no se ejecutan celdas)

## Depende de
- Feature 001 (api-inferencia-bert) — código bajo prueba.
- Plan de pruebas unitarias referenciado en `tests/unit/test_u4_validacion.py` ("Plan §4.1").

## Fuera de alcance
- Tests e2e (`backend/gateway/test/`) y benchmarks de latencia (`RUN_PERF`).
- Cargar/reentrenar BERT y cualquier prueba a nivel modelo (calidad, métricas).
- Meta numérica de cobertura.
- Modificar `data/raw/` o `models/`.

## Criterios de aceptación
1. Servicio Flask: `/health`, `/predict` y `/predict/batch` tienen pruebas unitarias con clasificador falso (éxito, body vacío, campos extra, tipos inválidos, límites de longitud y de lote, JSON inválido).
2. Servicio Flask: `limpiar_para_bert`/`construir_texto` replican el notebook 04 (URL, EMAIL, HTML, espacios, truncado a 1000 chars) con casos en `tests/unit/`.
3. Gateway: guard de API key, filtro de excepciones, interceptor de logging, `PredictService`, `MlClientService`, `HealthController`, DTOs y validación de env tienen specs `*.spec.ts` junto al archivo.
4. Gateway: todo error responde `{ "error": { "code", "message" } }` sin stack ni rutas internas (verificado en el filtro).
5. Ningún test ni log registra contenido de emails (se verifica con un marcador sentinela en los logs capturados).
6. Frontend: `api.ts` (`request`, `ApiError`, red caída, error HTTP con y sin cuerpo JSON) tiene pruebas unitarias con `fetch` simulado.
7. `cd backend/ml-service && python -m pytest tests/unit` y `cd backend/gateway && pnpm test` pasan sin GPU, sin red y sin modelo real; el frontend corre su runner con un solo comando.
8. `reports/pruebas_unitarias.csv` se regenera con ID, entrada, resultado y estado de cada caso.

## Seguridad y datos
- Sin contenido de emails en logs. `data/raw/` y `models/` solo lectura.
- Servicios en CPU; los tests no descargan modelos de internet.
- Los textos de prueba son sintéticos, nunca emails reales de Enron.

## Decisiones (resueltas con el usuario, 2026-10-13)
- Cobertura total de la arquitectura: Flask, gateway, frontend (`api.ts` y componentes React) y limpieza. Se aprueban devDependencies del frontend (vitest, jsdom, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom), instaladas con pnpm.
- "Plan §4.1": referencia interna de los tests existentes U1–U5; no hay documento aparte, la fuente de verdad es esta spec.
- Línea base antes de empezar: gateway 60 tests en verde (8 archivos); ml-service tests/unit 80 pasan, 6 skip.
