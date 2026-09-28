# Misión

## Qué construimos

Un proyecto de investigación (tesis) que estudia la detección de phishing
en email pasando de la **clasificación de mensajes aislados** a la
**detección secuencial en hilos de conversación**. La hipótesis central:
el phishing moderno — sobre todo el spear phishing con ingeniería social —
no se delata en un solo mensaje, sino en cómo escala la intención a lo
largo del hilo (saludo inocente → construcción de confianza → urgencia →
petición de credenciales o pagos).

Además del trabajo experimental, el modelo por mensaje se expone mediante
una API REST (Flask + NestJS) que **se despliega a producción en CPU**, con
el modelo precargado en el servidor, y que luego integrará el modelo
conversacional.

## Para quién

- **Comité / lectores de la tesis y comunidad académica**: necesitan
  resultados reproducibles y comparaciones rigurosas contra un baseline.
- **Consumidores de la API en producción**: cualquier sistema cliente que
  envíe un email (y más adelante un hilo) y reciba un nivel de riesgo.

## Qué problema resuelve

Los clasificadores de phishing actuales (incluido nuestro baseline:
LightGBM ROC-AUC 0.9993, BERT F1 0.9945 en test) evalúan cada mensaje sin
memoria. Un atacante que reparte la intención maliciosa en varios mensajes
individualmente inocentes pasa desapercibido. Además, los datasets
públicos son "fáciles" (emails sueltos, fuentes con sesgos propios), por lo
que las métricas casi perfectas no garantizan que el modelo generalice al
phishing conversacional.

## Qué lo hace distinto

- **Arquitectura jerárquica**: un encoder tipo (Sentence-)BERT por mensaje
  + un nivel temporal (GRU o Transformer ligero) sobre la secuencia de
  embeddings, que aprende la *trayectoria* de la conversación.
- **Interpretabilidad**: una capa de atención multi-cabeza sobre los
  últimos N mensajes permite señalar qué mensaje del pasado fue el
  "disparador" de la alerta.
- **Baseline fuerte y documentado**: la fase 1 (clásicos + BERT por
  mensaje) ya está hecha y sirve de comparación directa.

## Fuera de alcance (por ahora)

- Funcionalidades de producto completo (multi-tenant, cuentas de usuario,
  pagos). La API de producción es de un solo cliente/servicio con API key.
- Integración con clientes de correo (Gmail/Outlook plugins).
- Inferencia en GPU en producción: los servicios corren en CPU.
- Arquitecturas alternativas (Longformer/BigBird, Mamba/SSM, RAG de
  comportamiento): quedan en backlog como posible trabajo futuro.
- Mensajería no-email (SMS, WhatsApp, chats) salvo que el dataset de hilos
  elegido lo requiera.
