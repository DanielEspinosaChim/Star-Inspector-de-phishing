import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_KEY_HEADER } from '../common/api-key.guard.js';

const DESCRIPCION = `
API que clasifica emails como **phishing** o **legítimos** con un modelo BERT
afinado con 131,339 emails de 5 corpus públicos (F1 en test 0.9945, ROC-AUC 0.9996).

## Cómo probarla aquí mismo

1. Haz clic en **Authorize** (arriba a la derecha).
2. En el campo \`x-api-key\` pega la API key. En local está en
   \`backend/gateway/.env\`, en la línea \`API_KEY=\`. Pega solo el valor, sin
   \`API_KEY=\` ni comillas. Pulsa **Authorize** y luego **Close**.
3. Abre \`POST /api/v1/predict\`, pulsa **Try it out**, elige un ejemplo en el
   desplegable **Examples** (o escribe tu email) y pulsa **Execute**.
4. El campo \`x-request-id\` es opcional: puedes dejarlo vacío.

## Endpoints

| Endpoint | Para qué sirve | API key |
|---|---|---|
| \`GET /api/v1/health\` | Saber si la API y el modelo están listos | No |
| \`POST /api/v1/predict\` | Analizar **un** email | Sí |
| \`POST /api/v1/predict/batch\` | Analizar **de 1 a 32** emails en una sola llamada, más rápido que uno por uno | Sí |

## Cómo se genera la predicción

1. **Validación (gateway NestJS).** Revisa la API key, el límite de peticiones y el
   formato: \`body\` obligatorio de hasta 20,000 caracteres, \`subject\` opcional de hasta 1,000.
2. **Envío al servicio de inferencia.** El gateway reenvía el email a un servicio
   interno en Flask que no es accesible desde fuera.
3. **Limpieza del texto**, idéntica a la del entrenamiento: se quitan las etiquetas HTML,
   las URLs se reemplazan por \`[URL]\`, las direcciones de correo por \`[EMAIL]\` y se
   normalizan los espacios. Se conservan mayúsculas, puntuación y palabras comunes,
   porque la urgencia y el tono son señales de phishing.
4. **Armado de la entrada.** \`asunto + " " + cuerpo\`, recortado a 1000 caracteres.
5. **Tokenización.** El tokenizador WordPiece de BERT convierte el texto en hasta
   **128 tokens**; lo que sobre se descarta y la respuesta lo indica con \`truncated: true\`.
6. **Modelo.** \`bert-base-uncased\` afinado para esta tarea (12 capas, 110 M de
   parámetros) produce dos puntuaciones, una por clase, en **CPU**.
7. **Probabilidades.** Una función softmax convierte las puntuaciones en
   \`probabilities.ham\` y \`probabilities.phishing\`, que suman 1.
8. **Veredicto.** \`label\` es la clase más probable; equivale a marcar PHISHING cuando
   \`probabilities.phishing > 0.5\`. \`confidence\` es la probabilidad de esa clase.

El resultado depende solo del texto: el modelo **no** ve remitente, encabezados,
adjuntos ni abre los enlaces.

## Encabezados

| Encabezado | Obligatorio | Qué es |
|---|---|---|
| \`x-api-key\` | Sí, en \`/predict*\` | Clave de acceso. Se configura con **Authorize**. |
| \`x-request-id\` | No | Identificador para rastrear tu petición en los logs. Si no lo mandas, se genera uno y vuelve en la respuesta. |

## Errores

Todos los errores tienen la misma forma: \`{ "error": { "code": "...", "message": "..." } }\`.

| HTTP | code | Qué hacer |
|---|---|---|
| 400 | \`VALIDATION_ERROR\` | Corrige el campo que indica \`message\` |
| 401 | \`UNAUTHORIZED\` | Revisa la API key en **Authorize** |
| 413 | \`PAYLOAD_TOO_LARGE\` | La petición supera 1 MB; divide el lote |
| 429 | \`RATE_LIMITED\` | Superaste 60 peticiones por minuto; espera |
| 503 | \`ML_SERVICE_UNAVAILABLE\` | El servicio de inferencia está apagado; arráncalo con \`python wsgi.py\` |

Por privacidad, la API no guarda los emails y nunca escribe su contenido en los logs.
`;

export function setupSwagger(app: NestExpressApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Estrella · API de detección de phishing')
    .setDescription(DESCRIPCION)
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: API_KEY_HEADER,
        in: 'header',
        description:
          'Pega aquí el valor de API_KEY de backend/gateway/.env (solo el valor).',
      },
      API_KEY_HEADER,
    )
    .addTag('Estado', 'Disponibilidad de la API y del modelo')
    .addTag('Predicción', 'Clasificar emails como phishing o legítimos')
    .build();

  SwaggerModule.setup(
    'docs',
    app,
    () => SwaggerModule.createDocument(app, config),
    {
      customSiteTitle: 'Estrella · API',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        defaultModelsExpandDepth: 0,
      },
    },
  );
}
