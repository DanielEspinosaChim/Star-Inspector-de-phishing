# 2026-10-13 — Feature 008: pruebas unitarias de la arquitectura

## Qué se hizo
- Spec/plan/tasks en `spec/features/008-pruebas-unitarias/` (spec pasada a LISTO PARA IMPLEMENTAR por petición explícita del usuario).
- **ml-service (pytest):** de 80 a 214 tests en `tests/unit` (6 skip por tokenizer real). Nuevos U6 rutas, U7 errores/logging, U8 config, U9 clasificador con fakes. `ruff` limpio. CSV `reports/pruebas_unitarias.csv` regenerado con `REGISTRO_PRUEBAS=reports/pruebas_unitarias.csv` (220 filas, 0 fallos).
- **gateway (Vitest):** de 60 a 207 tests + 2 `it.fails`, 14 archivos. Cobertura ≈ 96.7% líneas/statements. `pnpm lint` y `pnpm build` OK.
- **frontend (Vitest + Testing Library):** 41 tests (api, App, main). `lint` y `build` OK.
- Auditoría de seguridad: APROBADO CON OBSERVACIONES (sin P0/P1).

## Qué quedó pendiente
- **Bug gateway:** body > 1 MB devuelve 500 `INTERNAL_ERROR` en vez de 413 (el filtro no reconoce `PayloadTooLargeError`). Test `U4-G32` es `it.fails`; al corregir, cambiar a `it`.
- **Bug gateway:** el 400 por JSON malformado repite el inicio del cuerpo en el mensaje (`U4-G41`, `it.fails`).
- Menores: `HTTP_ERROR` falta en el enum de `ErrorResponseDto.code`; `predictBatch` no filtra campos extra.
- **Bug frontend:** respuesta 2xx con cuerpo no JSON devuelve `null` y `App` fallaría al renderizar; rama "error inesperado" inalcanzable sin refactor.
- ml-service: `config.py` no valida rangos (`MAX_BATCH=-1` pasa).
- P2 auditoría: CVE de `source-map-js` <1.2.2 (dev, transitiva) → override de pnpm, requiere OK; `models/bert_phishing/tokenizer.json` modificado solo por fin de línea (restaurar con OK); decidir si se versiona el CSV.
- No se corrió `pnpm test:e2e` al cierre.

## Decisiones tomadas
- Número 008 (007 sigue siendo despliegue).
- Alcance: arquitectura (endpoints, frontend, limpieza), no modelo; clasificador siempre simulado.
- Se aprobaron devDependencies del frontend: vitest 5.0.4, jsdom 30.1.2, @testing-library/react 16.3.3, user-event 14.6.7, jest-dom 7.0.1 y dom 10.4.2 (peer obligatoria).
- Los bugs se documentan con `it.fails` en lugar de corregirse: el código de producción no se tocó.

## Actualización (mismo día): pendientes resueltos con OK del usuario
- Gateway: `HttpExceptionFilter` reconoce errores de body-parser → 413 `PAYLOAD_TOO_LARGE` y 400 con mensaje fijo; cualquier 400 sin formato propio responde "Solicitud inválida". `HTTP_ERROR` añadido al enum de `ErrorResponseDto`; `predictBatch` filtra campos extra. `U4-G32` y `U4-G41` pasaron de `it.fails` a `it`. Gateway: 209 tests en verde, e2e 21 pasan (7 skip sin Flask real).
- Frontend: `api.ts` lanza `ApiError('INVALID_RESPONSE')` si un 2xx no trae JSON. 41 tests en verde.
- CVE `source-map-js`: override en `frontend/pnpm-workspace.yaml` (pnpm 12 ya no lee `pnpm.overrides` de package.json). `pnpm audit --dev`: sin vulnerabilidades.
- `models/bert_phishing/tokenizer.json` restaurado con `git checkout`.
- `config.py`: los enteros deben ser >= 1 (puerto 1–65535); tests U8-07/07b/07c. ml-service: 221 unit + suite completa (sin `slow`) 260 pasan.
- Decisión: `reports/pruebas_unitarias.csv` va a `.gitignore` (se regenera en cada corrida). Revertir si se quiere versionar como evidencia de tesis.
- Sin commits hechos; pendiente que el usuario lo pida.
