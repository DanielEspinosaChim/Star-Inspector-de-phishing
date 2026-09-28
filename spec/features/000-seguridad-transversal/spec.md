# Checklist de seguridad transversal

Referencia fija que se usa para auditar **cualquier** módulo del proyecto
antes de dar una feature por terminada. No es específico de una feature —
aplica a todas (API y notebooks).

## Los 11 puntos

1. **Validación de inputs**: todo input de usuario se valida en tipo,
   formato y longitud antes de usarse. En la API: DTOs con
   `class-validator` en el gateway (whitelist + rechazo de campos
   desconocidos) **y** revalidación en el servicio Flask (no confiar en que
   solo el gateway lo llame).
2. **Control de acceso**: cada endpoint público del gateway exige API key
   (`x-api-key`, valor en `.env`). El servicio Flask no es público: escucha
   en `127.0.0.1` o solo en la red privada del despliegue. `GET /health` puede quedar abierto.
3. **Aislamiento multi-tenant**: **No aplica.** Proyecto de investigación
   de un solo usuario, sin cuentas ni datos por cliente; la API no persiste
   nada. Si algún día se vuelve producto, reevaluar.
4. **Manejo de secrets**: ninguna credencial, token o llave hardcodeada ni
   en el repositorio (`.env*` en `.gitignore`; se versiona solo
   `.env.example` sin valores reales). Tokens de Hugging Face, si se usan,
   van en variables de entorno.
5. **Protección contra inyecciones**: nunca se concatenan inputs en
   comandos de sistema, rutas de archivo ni queries. Las rutas a modelos
   vienen de configuración, nunca del request. No hay base de datos.
6. **Protección XSS/CSRF**: la API solo devuelve JSON (`Content-Type:
   application/json`); nunca refleja el texto del email en HTML. Swagger UI
   solo en desarrollo. CORS cerrado por defecto (orígenes explícitos en
   `.env`).
7. **Rate limiting**: `@nestjs/throttler` en `/predict` y `/predict/batch`
   (inferencia BERT en CPU es cara, ~100 ms por email). Límite de tamaño de body y de items por
   batch.
8. **Logging seguro**: **nunca se registra el contenido de los emails**
   (subject/body) ni la API key. Se loguea solo: request id, longitud del
   texto, label, latencia, código de respuesta. Los datasets contienen
   emails reales (Enron) con nombres, correos y teléfonos: no imprimirlos
   en logs, reportes públicos ni figuras más allá de ejemplos ya
   anonimizados.
9. **Manejo de errores**: los errores al cliente usan el formato
   `{ "error": { "code", "message" } }` sin stack traces, rutas internas
   ni versiones de librerías. Flask con `DEBUG=False` fuera de desarrollo.
10. **Dependencias**: sin vulnerabilidades conocidas (CVEs) sin mitigar o
    justificar — `pnpm audit` en el gateway y `pip-audit` en Python antes de
    cerrar una feature. No se agregan dependencias sin avisar.
11. **Subida de archivos**: **No aplica** por ahora — la API recibe texto
    en JSON, no archivos `.eml`. Si se agrega, validar tipo real, tamaño
    máximo y no almacenar.

## Puntos específicos de ML / datos

- **Deserialización insegura**: `.joblib`/pickle ejecuta código al cargar.
  Solo se cargan artefactos propios de `models/artifacts/`. El modelo BERT
  se carga desde `safetensors` (formato seguro); no aceptar rutas de modelo
  desde el request.
- **Licencias de datos**: el dataset consolidado es CC BY 4.0 (Champa et
  al., 2024) — citar en la tesis. Cualquier dataset nuevo (feature 003)
  debe documentar su licencia antes de usarse.
- **Leakage**: el test set no se usa para ninguna decisión de
  entrenamiento o selección de hiperparámetros.
- **Abuso del modelo**: la API devuelve probabilidades; no exponer
  logits crudos ni gradientes que faciliten ataques adversariales
  automatizados más allá de lo necesario para la demo.

## Formato de auditoría

```
Módulo: [nombre]
Fecha: [fecha]

1. Validación de inputs — [OK / P0 / P1 / P2 / No aplica] — [detalle si hay hallazgo]
2. Control de acceso — [...]
...
11. Subida de archivos — [...]
ML/datos — [...]

Resultado final: APROBADO / APROBADO CON OBSERVACIONES / RECHAZADO
```

- **P0**: crítico, bloquea el cierre de la feature.
- **P1**: importante, debe resolverse pronto pero no bloquea si hay plan.
- **P2**: menor, mejora recomendada.
