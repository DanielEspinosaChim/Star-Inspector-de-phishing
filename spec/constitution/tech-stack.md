# Tech Stack

## Lenguaje

- **Python 3.12.10** — experimentos y servicio de inferencia.
  Intérprete: `C:\Users\danye\AppData\Local\Programs\Python\Python312\python.exe`
- **TypeScript** — gateway NestJS.

## Framework / runtime

### Experimentación (fase de investigación)
- **Jupyter Notebooks** — toda la experimentación vive en `notebooks/`,
  numerados y secuenciales. Decisión explícita: **no** se crea un paquete
  `src/`; la lógica reutilizable se copia entre notebooks cuando haga falta.
- **PyTorch 2.11.0+cu128** (GPU NVIDIA RTX 5060 Laptop, 8 GB VRAM, CUDA 12.8,
  arquitectura Blackwell — requiere wheels `cu128`).
- **Hugging Face `transformers`** (5.x; el modelo guardado usa 5.6.2) +
  `accelerate`. Modelo base actual: `bert-base-uncased`. Para el modelo
  jerárquico se evaluará Sentence-BERT (`sentence-transformers`,
  pendiente de instalar cuando llegue esa feature).
- **scikit-learn, LightGBM, XGBoost** — baseline clásico con TF-IDF.
- **pandas, numpy, matplotlib, seaborn, tqdm, joblib**.

### Servicio de inferencia (`backend/ml-service/`)
- **Flask 3.1** — servicio interno (no público). **Inferencia en CPU**
  (`ML_DEVICE=cpu`, fp32, `TORCH_NUM_THREADS` configurable). El modelo se
  **precarga una sola vez al arrancar** desde `MODEL_DIR` (sin internet).
  Medido en local: ~90–140 ms por email en CPU.
- **waitress** como servidor WSGI (funciona igual en Windows y Linux).
- En producción torch se instala con el wheel **CPU**
  (`--index-url https://download.pytorch.org/whl/cpu`), mucho más liviano
  que el cu128.

### API pública (`backend/gateway/`)
- **Node.js 24** + **NestJS 12** (ESM: `"type": "module"`, imports con
  sufijo `.js`).
- **pnpm 11** como único gestor de paquetes. **npm y yarn prohibidos**
  (npm está corrupto en esta máquina). Scaffold con
  `pnpm dlx @nestjs/cli new gateway --package-manager pnpm --skip-git`.
- Librerías: `class-validator` + `class-transformer` (DTOs),
  `@nestjs/config` (variables de entorno), `@nestjs/throttler` (rate
  limit), `@nestjs/swagger` (documentación OpenAPI). HTTP hacia Flask con
  `fetch` nativo de Node (sin axios).

## Base de datos

Ninguna. Los datos viven en CSV (`data/raw/`, `data/processed/`). La API
es sin estado: no persiste los emails recibidos.

## Testing

- **Notebooks**: validación por el subagente `validador-experimental`
  (splits, semillas, leakage, métricas contra criterios de la spec).
- **backend/ml-service**: `pytest` — unit (preprocesamiento, paridad con el
  notebook 04), integración (rutas Flask con el cliente de pruebas).
- **backend/gateway**: **Vitest 4** + **supertest** (default de NestJS 12) —
  unit (`src/**/*.spec.ts`) y e2e (`test/*.e2e-spec.ts`) con el servicio ML
  simulado; `test/full-stack.e2e-spec.ts` contra Flask real.
- **Benchmarks de latencia** (dependen del hardware): opt-in con `RUN_PERF=1`.
- **E2E completo**: gateway + Flask reales, con emails de ejemplo del
  notebook 04.

## Otras herramientas relevantes

- Linter/formato TS: **oxlint** (type-aware) + Prettier (los del scaffold de Nest 12).
- pnpm: `backend/gateway/pnpm-workspace.yaml` → `allowBuilds` (build scripts
  denegados por defecto; `@scarf/scarf`, telemetría de swagger-ui, en `false`).
- Linter Python: `ruff` (ya instalado, 0.15) — `ruff check` en `backend/ml-service`.
- Dataset: Champa et al. (2024), IEEE ICMI — Zenodo 10.5281/zenodo.8339691
  (CC BY 4.0). Descarga con `scripts/build_phishing_dataset.py`.
- MCP: Context7 para documentación actualizada.
- Control de versiones: el proyecto **todavía no es un repositorio git**.

## Convenciones de versión

- Python 3.12 (los wheels de torch son `cp312`).
- Producción: CPU; torch CPU wheel. Desarrollo/entrenamiento: GPU.
- Node 24+, pnpm 11+.
- CUDA 12.8 / torch `+cu128` (no instalar torch CPU por accidente vía
  `pip install -r` sin el `--index-url`).

---

*Decidido en la entrevista inicial (2026-09-27). Si se cambia algo del
stack más adelante, actualizar este archivo primero (nivel spec-anchored)
antes de tocar código.*
