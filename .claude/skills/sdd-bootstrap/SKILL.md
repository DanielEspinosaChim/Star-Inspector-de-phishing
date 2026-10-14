---
name: sdd-bootstrap
description: Crea el andamiaje Spec-Driven Development de Estrella. Sin argumentos revisa/crea spec/constitution/ y spec/features/README.md; con un nombre de feature (ej. "002-baseline-consolidado") crea spec.md, plan.md y tasks.md con las plantillas del proyecto. Úsala al empezar una feature nueva.
---

# sdd-bootstrap

Andamiaje SDD (spec-anchored) del proyecto Estrella. Sigue el flujo de `CLAUDE.md`:
`spec.md` → `plan.md` → `tasks.md` → implementar → verificar.

**Reglas generales**
- Todo en español. No sobrescribas archivos existentes: si ya existen, léelos y dime qué falta.
- No borres nada. No instales dependencias.
- No marques ninguna spec como LISTO PARA IMPLEMENTAR: eso se decide con el checklist de `spec/features/README.md` y con el OK del usuario.
- Antes de empezar, revisa `docs/` por si el contexto ya está documentado.
- Si no estás seguro al 80% de qué va la feature, pregunta. No inventes criterios.

## Modo 1 — Sin argumentos: bootstrap del proyecto

Verifica que existan, y crea solo lo que falte:

1. `spec/constitution/mission.md`, `tech-stack.md`, `roadmap.md` (resume desde `CLAUDE.md` y `quequierohacer`; no inventes).
2. `spec/features/README.md` con el ciclo, el checklist de revisión (7 puntos) y la tabla índice de features.
3. `spec/features/000-seguridad-transversal/spec.md` (checklist de seguridad de referencia).
4. `.claude/agents/` con los 5 subagentes: coordinador, implementador-ml, implementador-api, validador-experimental, auditor-seguridad.

Al final, reporta qué existía y qué creaste, y agrega una entrada en `docs/` (`YYYY-MM-DD-bootstrap-sdd.md`) con qué se hizo, qué quedó pendiente y decisiones.

## Modo 2 — Con argumento `NNN-nombre`: nueva feature

1. Valida que el argumento tenga formato `NNN-nombre-en-kebab-case` y que `spec/features/NNN-nombre/` no exista.
2. Si el usuario no explicó qué hace la feature, pregúntale: objetivo, módulos que toca (backend / frontend / notebooks) y qué queda fuera de alcance.
3. Crea `spec/features/NNN-nombre/` con las tres plantillas de abajo.
4. Añade o actualiza la fila en la tabla índice de `spec/features/README.md` con estado **En borrador**.
5. Termina diciendo qué puntos del checklist de revisión faltan y sugiere invocar al subagente `coordinador`.

### Plantilla `spec.md`

```markdown
# Spec — <Título>

**Estado:** EN BORRADOR

## Qué hace
<Descripción corta del comportamiento o experimento.>

## Módulos que toca
- [ ] Backend — servicio ML (Flask, `backend/ml-service/`)
- [ ] Backend — gateway (NestJS, `backend/gateway/`)
- [ ] Frontend
- [ ] Notebooks

## Depende de
- <features, datos o modelos previos>

## Fuera de alcance
- <lo que explícitamente no se hace>

## Criterios de aceptación
Cada uno debe poder probarse con un test (API) o una métrica (notebook).
1. <criterio verificable>
2. ...
(mínimo 5)

## Seguridad y datos
- Sin contenido de emails en logs. `data/raw/` y `models/` solo lectura.
- Servicios en CPU.

<!-- REVISAR: <duda abierta> -->
```

### Plantilla `plan.md`

```markdown
# Plan — <Título>

## Enfoque técnico
<Cómo se resuelve y por qué.>

## Archivos a crear/modificar
- `ruta/exacta` — para qué

## Endpoints            <!-- features de API -->
| Método | Path | Descripción |
|---|---|---|

## Experimentos         <!-- features de notebooks; sustituye a "Endpoints" -->
- `notebooks/NN_nombre.ipynb` — objetivo, split, métricas (ROC-AUC, F1, FP rate, FN rate)

## Modelo de datos      <!-- o "Datos de entrada / salida" en notebooks -->
| Campo | Tipo | Descripción |
|---|---|---|

## Riesgos
- <riesgo y mitigación>
```

### Plantilla `tasks.md`

```markdown
# Tasks — <Título>

Marcar `[x]` solo cuando esté implementado Y verificado. Subagente sugerido entre corchetes.

## Preparación
- [ ] Confirmar dependencias nuevas con el usuario [coordinador]

## <Sección: implementación>
- [ ] <tarea atómica> [implementador-api | implementador-ml]

## Verificación
- [ ] Tests / métricas de los criterios de aceptación [validador-experimental]
- [ ] Auditoría contra `spec/features/000-seguridad-transversal/spec.md` [auditor-seguridad]
- [ ] Entrada en `docs/` con fecha, qué se hizo, pendientes y decisiones
```

## Notas
- Notebooks nuevos: `NN_nombre.ipynb`, `SEED = 42`, split estratificado, test set intacto hasta la evaluación final.
- Features grandes (más de 2 archivos): usar Plan Mode y esperar OK del usuario antes de tocar código.
