# Spec — API de inferencia BERT

**Estado:** LISTO PARA IMPLEMENTAR (revisado 2026-09-27)

## Qué hace

Expone el modelo BERT fine-tuneado de la fase 1 (`models/bert_phishing/`)
como una API REST **lista para producción en CPU**. Un servicio interno en
**Flask** precarga el modelo una sola vez al arrancar y hace la inferencia
en CPU replicando exactamente el preprocesamiento del notebook 04. Un
**gateway en NestJS** (gestionado con **pnpm**) es la única puerta
pública: valida la entrada, aplica API key y rate limit, documenta con
Swagger (solo en desarrollo) y reenvía al servicio Flask.

Cliente → `POST /api/v1/predict` (NestJS :3000) → `POST /predict` (Flask
:5000, red privada) → BERT en CPU → `{ label, confidence, probabilities }`.

## Módulos que toca

- [x] Backend — servicio ML (Flask, `backend/ml-service/`)
- [x] Backend — gateway (NestJS, `backend/gateway/`)
- [ ] Frontend — no aplica
- [ ] Notebooks — no se modifican

## Depende de

- `models/bert_phishing/` (config, safetensors, tokenizer) — ya existe. En
  producción se provee en la ruta de `MODEL_DIR` (horneado en la imagen o
  montado); el servicio no descarga nada de internet.
- PyTorch 2.11 y `transformers` 5.x — ya instalados en local (build cu128,
  forzado a CPU por configuración). En producción: wheel CPU de torch.
- Node 24 + pnpm 11 — ya instalados.

## Fuera de alcance

- Modelos clásicos (LightGBM/TF-IDF) — solo BERT en esta feature.
- Análisis de hilos / múltiples mensajes con contexto (feature 006).
- Subir archivos `.eml` o parsear MIME; la entrada es texto en JSON.
- Autenticación de usuarios, cuentas, base de datos o persistencia de
  requests.
- Infraestructura de despliegue: Dockerfiles, servidor/nube destino,
  HTTPS, CI/CD — van en la feature 007 (despliegue a producción).
- Inferencia en GPU en producción.
- Cuantización u optimizaciones de modelo (ONNX, int8) — backlog.
- Reentrenar o modificar el modelo.
- Frontend / interfaz web.

## Criterios de aceptación

Cada uno debe poder probarse con un test.

1. `POST /api/v1/predict` con `{ "subject": "...", "body": "..." }` válido y
   `x-api-key` correcta responde `200` con `label` ∈ {`HAM`, `PHISHING`},
   `confidence` ∈ [0, 1], `probabilities.ham + probabilities.phishing` = 1
   (±1e-4) y `model` = `bert-base-uncased-phishing`.
2. **Paridad con el notebook**: para los 4 emails de ejemplo de la celda
   "Inferencia" de `04_bert_finetuning.ipynb`, la API (en CPU) devuelve la
   misma clase que el notebook (PHISHING, HAM, PHISHING, HAM), y
   `limpiar_para_bert` del servicio produce exactamente la misma salida que
   la del notebook para un set de casos de prueba (HTML, URLs, emails,
   espacios).
3. El texto enviado al modelo es `limpiar_para_bert(subject) + ' ' +
   limpiar_para_bert(body)`, truncado a 1000 caracteres y tokenizado con
   `max_length=128`, `truncation=True` — idéntico al entrenamiento.
4. `POST /api/v1/predict/batch` con `{ "emails": [...] }` de 1 a 32 items
   responde `200` con un arreglo de resultados en el mismo orden; con 0 o
   más de 32 items responde `400`.
5. Validación: `body` ausente, vacío, no-string o mayor a 20,000
   caracteres, `subject` mayor a 1,000 caracteres, o campos no declarados
   → `400` con `{ "error": { "code", "message" } }`, sin llegar a Flask.
6. Sin `x-api-key` o con una incorrecta → `401` en `/predict` y
   `/predict/batch`. `GET /api/v1/health` responde sin API key.
7. `GET /api/v1/health` responde `200` con `{ gateway: "ok", mlService:
   "ok" | "down", device: "cpu" }`; si Flask está caído, el gateway
   responde `mlService: "down"` (no se cae).
8. Si Flask no responde en el timeout configurado (default 10 s) o está
   caído, `/predict` responde `503` con código `ML_SERVICE_UNAVAILABLE`,
   sin stack trace.
9. Rate limit: más de N requests por minuto por IP a `/predict*` → `429`
   (N configurable en `.env`, default 60).
10. **CPU y precarga**: el servicio corre en CPU por defecto (`ML_DEVICE=cpu`),
    fija el número de hilos de torch desde `TORCH_NUM_THREADS`, carga el
    modelo **una vez** al arrancar desde `MODEL_DIR` sin acceso a internet,
    y **falla al arrancar** con mensaje claro si el modelo no está. El
    host de Flask es configurable (`ML_HOST`, default `127.0.0.1`) para
    poder ubicarlo en una red privada; nunca se expone públicamente.
11. Ningún log (gateway ni Flask) contiene el `subject`, el `body` ni la
    API key — verificado con un test que captura logs.
12. Latencia en CPU de un `/predict` individual contra Flask: p95 < 300 ms
    sobre 50 requests con `TORCH_NUM_THREADS=2` (medido en la máquina de
    desarrollo el 2026-09-27: p95 ≈ 141 ms con 2 hilos; ≈ 98 ms con 4).
13. Configuración de producción: con `NODE_ENV=production` Swagger no se
    expone, el gateway no arranca si falta `API_KEY`, y los errores no
    incluyen detalles internos. Swagger disponible en `GET /docs` solo con
    `NODE_ENV=development`.
14. Todos los tests (`pytest` en ml-service, `pnpm test` y `pnpm test:e2e`
    en gateway) pasan, `ruff check` sin errores en ml-service, y la
    auditoría contra `000-seguridad-transversal` resulta APROBADO (sin P0).
