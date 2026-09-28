# Roadmap

Orden de construcción de las features, de la más fundacional a la más
opcional. Los números de feature (00X) corresponden a las carpetas en
`spec/features/`.

## Ya hecho (fase 1 — baseline por mensaje)

- Dataset consolidado: 131,339 emails de 5 fuentes, balanceado (48.7% ham / 51.3% phishing).
- `01_eda_exploracion`, `02_limpieza_preprocesamiento`.
- `03_modelos_clasicos`: TF-IDF (50k términos) + LR / RF / XGBoost / LightGBM.
  Mejor: LightGBM — ROC-AUC 0.9993, F1 0.9881.
- `04_bert_finetuning`: `bert-base-uncased`, MAX_LEN 128, 3 épocas, fp16.
  Test: ROC-AUC 0.9996, F1 0.9945, accuracy 0.9944.

## MVP — construir primero

1. **001-api-inferencia-bert** — API REST que sirve el BERT ya entrenado:
   servicio ML interno en Flask + gateway público en NestJS (pnpm). Va
   primero porque convierte el trabajo de la fase 1 en algo utilizable y
   deja la infraestructura de serving sobre la que luego se montará el
   modelo conversacional (feature 006). Lista para producción en CPU.
2. **007-despliegue-produccion** — Llevar la API a producción en CPU:
   Dockerfiles (torch CPU, modelo precargado en la imagen o montado),
   red privada entre gateway y servicio ML, HTTPS, variables de entorno y
   CI/CD. Numerada 007 porque se agregó después; va justo tras la 001.
   Requiere definir el destino (servidor/nube).
3. **002-baseline-consolidado** — Cerrar la fase 1 con rigor de tesis:
   tabla comparativa única clásicos vs BERT, análisis por fuente y
   evaluación *leave-one-source-out* para medir si el ~0.999 generaliza o
   el modelo aprende el sesgo de cada dataset.
4. **003-dataset-hilos** — Buscar y adoptar un dataset público de hilos /
   conversaciones de ingeniería social o scam; documentar licencia,
   formato, etiquetas y split. Prerrequisito de todo lo secuencial (los 5
   datasets actuales son emails sueltos, sin hilos).

## Siguiente etapa (núcleo de la tesis)

5. **004-encoder-mensajes** — Encoder por mensaje (Sentence-BERT y/o el
   BERT fine-tuneado como extractor): generar y cachear embeddings de cada
   mensaje del dataset de hilos; baseline "por último mensaje".
6. **005-modelo-jerarquico** — Nivel temporal (GRU vs Transformer ligero)
   sobre la secuencia de embeddings + atención multi-cabeza sobre los
   últimos N mensajes; comparación contra el baseline por mensaje y
   visualización del mensaje "disparador".
7. **006-api-hilos** — Extender la API con un endpoint que recibe un hilo
   completo y devuelve riesgo + pesos de atención por mensaje.

## Backlog / ideas futuras (sin priorizar todavía)

- Long-context: Longformer / BigBird con atención global sobre `[SEP]`.
- State-Space Models (Mamba) como alternativa con memoria de estado.
- RAG de comportamiento: vector DB con patrones de ataque conocidos.
- Exponer también LightGBM en la API (`model=classic`) para comparación.
- Cuantización int8 / ONNX Runtime para bajar latencia en CPU.
- Aumentar `MAX_LEN` de BERT a 256/512 y medir el impacto.

---

*Este roadmap se ajusta con el tiempo. Antes de reordenar prioridades,
actualízalo aquí primero.*
