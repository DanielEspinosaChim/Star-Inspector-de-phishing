# Estrella — Detección de phishing conversacional

Proyecto de investigación (tesis) sobre detección de phishing en email con
NLP, cuyo modelo se sirve en una API REST que se despliega a producción
**en CPU**. Fase 1 (terminada): clasificación **por mensaje** con modelos clásicos
(TF-IDF + LightGBM) y BERT fine-tuneado. Objetivo de la tesis: pasar a
detección **secuencial en hilos de conversación** — detectar la escalada de
intención (saludo → confianza → urgencia → pedir credenciales) con una
arquitectura jerárquica, y poder señalar qué mensaje disparó la alerta.

Misión completa: `spec/constitution/mission.md`.

## Stack

- Lenguajes: Python 3.12 (ML + servicio de inferencia) · TypeScript (gateway)
- Experimentos: Jupyter Notebooks (`notebooks/`) — **toda la experimentación
  vive en notebooks**, no se crea un paquete `src/`
- ML: PyTorch 2.11 (entrenamiento en GPU local: RTX 5060 8 GB, CUDA 12.8;
  **servicios en producción: solo CPU**), Hugging Face
  `transformers`, scikit-learn, LightGBM, XGBoost
- Servicio ML interno: Flask + waitress (sirve BERT en CPU, modelo precargado al arrancar)
- API pública / gateway: NestJS con **pnpm** (npm está roto en esta máquina)
- Base de datos: ninguna (datos en CSV bajo `data/`)
- Tests: pytest (servicio Flask) · Vitest + supertest (gateway NestJS 12)

Detalle y versiones: `spec/constitution/tech-stack.md`.

## Comandos

Python usado: `C:\Users\danye\AppData\Local\Programs\Python\Python312\python.exe`
(PyTorch con CUDA ya instalado ahí; ver `INSTALAR_PYTORCH.md` si se rompe).

- `pnpm bootstrap` — instala todo (Python + gateway + frontend) y crea los `.env` locales
- `pnpm dev` — levanta modelo (5000), gateway (3000, Swagger en /docs) y web (5173); ver `README.md`
- `python -c "import torch; print(torch.cuda.is_available())"` — verifica GPU
- `jupyter notebook notebooks/` — abre los notebooks de experimentos
- `python scripts/build_phishing_dataset.py` — reconstruye el dataset consolidado

API (feature 001, `spec/features/001-api-inferencia-bert/`):

- `cd backend/ml-service && python -m pytest` — tests del servicio Flask
- `cd backend/ml-service && python wsgi.py` — arranca el servicio ML (CPU) en `127.0.0.1:5000`
- `cd backend/ml-service && ruff check .` — lint Python
- `cd backend/gateway && pnpm install` — instala dependencias del gateway
- `cd backend/gateway && pnpm start:dev` — arranca el gateway en `localhost:3000`
- `cd backend/gateway && pnpm test` / `pnpm test:e2e` — tests (deben pasar antes de cerrar tarea)
- `cd backend/gateway && pnpm lint` / `pnpm format` — oxlint / prettier
- `RUN_PERF=1` antes de `pytest` o `pnpm test:e2e` — incluye los benchmarks de latencia
  (conectar la laptop a corriente: en batería la CPU se limita)
- `cd backend/gateway && pnpm build` — compila
- `cd frontend && pnpm dev` — web de prueba en `localhost:5173` (requiere gateway y Flask arriba)

## Estructura del proyecto

- `data/raw/` — 5 CSVs originales (Enron, Ling, SpamAssasin, CEAS_08, TREC_07). **Solo lectura.**
- `data/processed/` — `merged_phishing_full.csv` (131,339 emails), `phishing_clean.csv`, `pipeline_summary.csv`
- `notebooks/` — `01_eda` → `02_limpieza` → `03_modelos_clasicos` → `04_bert_finetuning`; los nuevos siguen la numeración `05_…`
- `models/artifacts/` — modelos clásicos `.joblib` + vectorizador TF-IDF. **Solo lectura.**
- `models/bert_phishing/` — BERT fine-tuneado (safetensors + tokenizer). **Solo lectura.**
- `reports/` — `results_clasicos.csv` y figuras en `reports/figures/`
- `scripts/` — `build_phishing_dataset.py` (descarga de Zenodo + merge)
- `backend/ml-service/` — servicio Flask de inferencia (feature 001)
- `backend/gateway/` — API pública NestJS (feature 001)
- `frontend/` — web de prueba (React + Vite, pnpm). Llama a `/api` y el proxy de Vite
  reenvía al gateway con la API key (`GATEWAY_API_KEY` en `.env.local`, nunca en el bundle)
- `spec/` — constitución y specs de features (SDD)
- `docs/` — memoria de sesión
- `web/` — cartas HTML personales, **no son parte del proyecto**
- `quequierohacer` — nota original con las rutas arquitectónicas para la fase conversacional

## Convenciones

- Idioma: comentarios, markdown de notebooks, specs y docs en **español**;
  identificadores de código pueden ir en español (como en los notebooks
  actuales: `limpiar_para_bert`, `clasificar_email`) o inglés, pero
  consistentes dentro de cada archivo.
- Notebooks: numerados `NN_nombre.ipynb`, rutas relativas desde `notebooks/`
  (`../data/...`), configuración/hiperparámetros en una celda al inicio,
  `SEED = 42` en todo (random, numpy, torch), figuras a `../reports/figures/`,
  resultados tabulares a `../reports/*.csv`. Cada notebook cierra con una
  celda de conclusiones.
- Rigor experimental: split estratificado con semilla fija; el test set no
  se toca hasta la evaluación final; reportar ROC-AUC, F1, FP rate y FN rate
  (el formato de `reports/results_clasicos.csv`).
- Preprocesamiento: la limpieza para BERT es la función `limpiar_para_bert`
  de `notebooks/04_bert_finetuning.ipynb` (texto = `subject + ' ' + body`,
  truncado a 1000 caracteres, `MAX_LEN = 128` tokens). Cualquier código que
  sirva el modelo debe replicarla exactamente — hay un test de paridad.
- Python (backend/ml-service): PEP 8, type hints, app factory `create_app()`,
  el modelo se carga una sola vez al arrancar.
- **Servicios = CPU.** Todo código de `backend/` debe funcionar sin GPU (fp32,
  sin `autocast`/CUDA obligatorios, sin descargar modelos de internet). La
  GPU solo se usa para entrenar en notebooks.
- TypeScript (backend/gateway): convenciones estándar de NestJS (módulo +
  controller + service + DTOs con `class-validator`), ESM con imports
  `.js`, tests `*.spec.ts` al lado del archivo y e2e en `test/`.
  `src/setup-app.ts` concentra la config global (la usan `main.ts` y los e2e).
- Errores de API: respuesta JSON `{ "error": { "code", "message" } }`, sin
  stack traces ni rutas internas.

## No hagas

- No instalar dependencias sin avisar (ni pip ni pnpm).
- **No usar `npm` ni `yarn`** — solo `pnpm` (y `pnpm dlx` en vez de `npx`).
- No subir archivos `.env*` ni ninguna credencial al repositorio.
- No borrar código o archivos sin confirmar explícitamente conmigo.
- **No modificar `data/raw/` ni `models/`** (ni sobrescribir los modelos
  entrenados) salvo que yo lo pida explícitamente.
- No volver a entrenar BERT ni correr celdas pesadas de notebooks (>5 min
  de GPU) sin avisar antes.
- No registrar contenido de emails en logs (los datasets tienen emails
  reales de Enron con datos personales).
- No cargar `.joblib`/pickle de fuentes externas — solo los artefactos
  propios de `models/artifacts/`.

## Flujo de trabajo

- Este proyecto sigue **Spec-Driven Development (spec-anchored)**: toda
  feature pasa por `spec.md` → `plan.md` → `tasks.md` → implementar →
  verificar, dentro de `spec/features/NNN-nombre/`. Si un cambio altera lo
  acordado en la spec, se actualiza la spec **antes** de tocar código.
- No implementar una feature cuya spec no esté marcada **LISTO PARA
  IMPLEMENTAR** (checklist en `spec/features/README.md`).
- Para tareas grandes, refactors, o cambios que toquen más de 2 archivos:
  usa Plan Mode. Muestra el plan completo y espera mi OK explícito antes
  de tocar código.
- Para bugs evidentes, correcciones puntuales o tareas atómicas de un solo
  archivo: usa Build Mode y ejecuta directo.
- Una tarea a la vez; al terminar, márcala `[x]` en `tasks.md` y dime qué
  cambiaste para que lo revise.
- Antes de cerrar una feature: bucle Actuar → Observar → Corregir hasta que
  todos los tests pasen y cada criterio de aceptación esté verificado.
- Si no estás seguro al 80%, pregunta. No inventes.
- **`docs/` se actualiza solo, sin que yo lo pida.** Al cerrar cualquier
  tarea o sesión de trabajo relevante, agrega automáticamente una entrada
  en `docs/` con fecha, qué se hizo, qué quedó pendiente y qué decisiones
  se tomaron. Antes de empezar una tarea nueva, revisa `docs/` primero —
  si el contexto ya está documentado ahí, no me lo vuelvas a preguntar.

## Subagentes disponibles

Definidos en `.claude/agents/`:

- **coordinador**: no escribe código. Lee la spec/tasks, divide el trabajo
  en subtareas, decide el orden y a qué subagente asignar cada una.
- **implementador-ml**: escribe y edita notebooks (`notebooks/`) y sus
  salidas en `reports/`. No toca `backend/`, `data/raw/` ni `models/`.
- **implementador-api**: escribe código solo en `backend/` (Flask y NestJS).
  Usa pnpm, nunca npm.
- **validador-experimental**: valida criterios de aceptación. En ML revisa
  leakage, splits, semillas y métricas; en la API escribe y corre tests
  (solo archivos de test). No modifica código de producción ni notebooks.
- **auditor-seguridad**: solo lectura. Audita contra
  `spec/features/000-seguridad-transversal/spec.md`: PII en datos y logs,
  secrets, validación de inputs, dependencias con CVEs, licencias de datos.

Cada subagente devuelve solo un resumen al coordinador, no todo el detalle.

## MCPs configurados

- **Context7** (`.mcp.json`): documentación actualizada de `transformers`,
  PyTorch, scikit-learn, Flask y NestJS. Úsalo antes de escribir código
  contra cualquiera de estas librerías en vez de confiar en la memoria.

## Documentación

- `spec/constitution/` — misión, stack y roadmap del proyecto.
- `spec/features/` — spec, plan y tasks de cada feature.
- `spec/features/000-seguridad-transversal/` — checklist de seguridad de
  referencia para auditar cualquier módulo.
- `docs/` — notas de sesión y memoria de trabajo.
- `INSTALAR_PYTORCH.md` — cómo reinstalar torch con CUDA 12.8 si falla.
