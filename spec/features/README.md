# Features (Spec-Driven Development)

Cada feature vive en `NNN-nombre/` con tres archivos:

- `spec.md` — **qué** se construye y criterios de aceptación verificables.
- `plan.md` — **cómo**: archivos exactos, endpoints, modelo de datos, flujo.
- `tasks.md` — checklist de tareas atómicas; `[x]` solo si está hecho **y** verificado.

Ciclo: Specify → Plan → Tasks → Implement → Verify. Si durante la
implementación algo cambia lo acordado, se actualiza primero la spec/plan.

Para features puramente experimentales (notebooks), `plan.md` sustituye
"Endpoints" por "Experimentos" y "Modelo de datos" por "Datos de entrada /
salida" (columnas, tipos, archivos generados).

## Revisión antes de implementar

Una feature solo se implementa si su `spec.md` dice **Estado: LISTO PARA
IMPLEMENTAR**. Para marcarla así se verifica:

1. `spec.md` tiene al menos 5 criterios de aceptación verificables.
2. `plan.md` lista archivos exactos a crear/modificar.
3. `plan.md` tiene endpoints (método, path, descripción) o experimentos.
4. `plan.md` tiene modelo de datos con campos y tipos.
5. `tasks.md` está dividido en secciones con tareas atómicas.
6. `tasks.md` incluye tests de seguridad (aislamiento multi-tenant: no aplica en este proyecto).
7. No quedan `<!-- REVISAR -->` sin resolver.

Si falta algo, se listan los puntos faltantes y no se avanza.

## Índice

| # | Feature | Estado |
|---|---|---|
| 000 | seguridad-transversal | Referencia fija |
| 001 | api-inferencia-bert | LISTO PARA IMPLEMENTAR |
| 002 | baseline-consolidado | Sin spec |
| 003 | dataset-hilos | Sin spec |
| 004 | encoder-mensajes | Sin spec |
| 005 | modelo-jerarquico | Sin spec |
| 006 | api-hilos | Sin spec |
| 007 | despliegue-produccion | Sin spec (va después de 001) |
