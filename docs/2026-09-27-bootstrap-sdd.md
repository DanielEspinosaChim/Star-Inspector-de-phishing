# 2026-09-27 — Bootstrap de Spec-Driven Development

## Qué se hizo
- Revisión del estado del proyecto: dataset consolidado (131,339 emails, 5
  fuentes), notebooks 01–04 terminados, modelos en `models/`.
  Resultados base: LightGBM ROC-AUC 0.9993 / F1 0.9881; BERT (test)
  ROC-AUC 0.9996 / F1 0.9945.
- Lectura de `quequierohacer`: objetivo de pasar a detección de phishing
  conversacional (hilos) con arquitectura jerárquica.
- Creado el andamiaje SDD: `CLAUDE.md`, `spec/constitution/`
  (mission, tech-stack, roadmap), `spec/features/000-seguridad-transversal`,
  `spec/features/001-api-inferencia-bert` (spec, plan, tasks),
  5 subagentes en `.claude/agents/`, `.mcp.json` (Context7), `.gitignore`.

## Qué quedó pendiente
- Resolver los `<!-- REVISAR -->` de la spec 001 (umbral de latencia) y de
  tech-stack (ruff) y marcar la spec 001 como LISTO PARA IMPLEMENTAR.
- Implementar la feature 001.
- Escribir specs de 002 (baseline consolidado) y 003 (dataset de hilos).
- El proyecto aún no es repositorio git.

## Decisiones tomadas
- Proyecto de **investigación/tesis**, no producto.
- **Solo notebooks** para experimentación (sin paquete `src/`); el único
  código fuera de notebooks es `backend/`.
- Arquitectura objetivo: **jerárquica** (encoder por mensaje + GRU/Transformer
  temporal + atención multi-cabeza). Longformer, Mamba y RAG → backlog.
- Dataset de hilos: se buscará uno **público**, en una spec posterior (003).
- Primera spec: API REST — **Flask** como servicio ML interno + **NestJS**
  como gateway público; **solo BERT** en esta fase.
- **pnpm** obligatorio (npm está roto en la máquina).
- (Actualización) La API se **despliega a producción en CPU** con el modelo
  precargado. Medido: BERT en CPU p95 ≈ 141 ms (2 hilos), ≈ 98 ms (4 hilos).
  Infraestructura de despliegue → feature 007. `ruff` adoptado como linter.
- `data/raw/` y `models/` son de solo lectura. `web/` (cartas HTML) no es parte del proyecto.
- Subagentes: coordinador, implementador-ml, implementador-api,
  validador-experimental, auditor-seguridad. MCP: solo Context7.
