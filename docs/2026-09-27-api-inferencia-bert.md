# 2026-09-27 — Feature 001: API de inferencia BERT

## Qué se hizo
- `backend/ml-service/` (Flask + waitress): BERT en CPU, modelo precargado al arrancar. 47 tests pytest.
- `backend/gateway/` (NestJS 12 + pnpm): API key, validación, rate limit, Swagger en dev. 32 unit + 27 e2e (Vitest).
- Paridad con el notebook 04 verificada (misma limpieza, mismas clases en los 4 ejemplos).

## Qué quedó pendiente
- Latencia (criterio 12): re-medir con la laptop conectada (`RUN_PERF=1`); en batería da p95 de 360–460 ms.
- Resultado de la auditoría de seguridad contra la spec 000.
- Feature 007: despliegue (Docker, servidor, HTTPS).

## Decisiones tomadas
- Vitest en lugar de Jest (es el default de Nest 12).
- Benchmarks de latencia opcionales con `RUN_PERF=1`, porque dependen del hardware.
- Telemetría `@scarf/scarf` bloqueada en `pnpm-workspace.yaml`.
- Auditoría: APROBADO CON OBSERVACIONES (sin P0). Aplicados: use_safetensors, validación de x-request-id en Flask, NODE_ENV=production en .env.example. Pendientes P1/P2: pip-audit + fijar versiones Python, throttle más estricto para batch, quitar @nestjs/mau (dev), test del 413.
- Reestructurado: `api/` → `backend/` (ml-service + gateway). Nuevo `frontend/` (React + Vite + pnpm) con proxy que inyecta la API key. Despliegue irá a un VPS (spec 007, pendiente).
- Instalación y arranque en un comando: `pnpm bootstrap` y `pnpm dev` (scripts/setup.mjs, scripts/dev.mjs). requirements.txt del ml-service con versiones fijas y torch CPU. README.md en la raíz.
