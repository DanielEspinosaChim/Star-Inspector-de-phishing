import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { API_KEY_HEADER, ApiKeyGuard } from '../common/api-key.guard.js';
import { ErrorResponseDto } from '../common/error-response.dto.js';
import { REQUEST_ID_HEADER } from '../common/logging.interceptor.js';
import {
  PredictBatchRequestDto,
  PredictRequestDto,
} from './dto/predict-request.dto.js';
import {
  PredictBatchResponseDto,
  PredictResponseDto,
} from './dto/predict-response.dto.js';
import { PredictService } from './predict.service.js';

const err = (code: string, message: string) => ({ error: { code, message } });

// LoggingInterceptor ya validó (o generó) el id y lo dejó en el request
const requestIdOf = (req: Request) => {
  const id = req.headers[REQUEST_ID_HEADER];
  return typeof id === 'string' ? id : undefined;
};

const EJEMPLO_PHISHING = {
  subject: 'Your account has been limited',
  body: 'Click here to verify your PayPal account immediately or it will be suspended. Login: http://paypal-verify.suspicious.com',
};
const EJEMPLO_LEGITIMO = {
  subject: 'Q3 budget review',
  body: "Hi team, please review the Q3 budget report attached and let me know your thoughts before Friday's meeting.",
};

@ApiTags('Predicción')
@ApiSecurity(API_KEY_HEADER)
@ApiHeader({
  name: REQUEST_ID_HEADER,
  required: false,
  description:
    '**Opcional.** Identificador para rastrear esta petición. Si lo envías, aparece en los ' +
    'logs del gateway y del servicio de inferencia y se devuelve en el encabezado de la ' +
    'respuesta, así puedes encontrar tu petición cuando algo falla. Si no lo envías, el ' +
    'gateway genera uno. Solo letras, números, `-` y `_`, máximo 64 caracteres. ' +
    '**Puedes dejarlo vacío.**',
  example: 'prueba-001',
})
@ApiBadRequestResponse({
  description:
    'Los datos no son válidos: falta `body`, está vacío, excede el tamaño o trae campos no permitidos.',
  type: ErrorResponseDto,
  example: err('VALIDATION_ERROR', 'body: matches'),
})
@ApiUnauthorizedResponse({
  description:
    'Falta el encabezado `x-api-key` o no es correcto. Usa el botón **Authorize**.',
  type: ErrorResponseDto,
  example: err('UNAUTHORIZED', 'API key inválida o ausente'),
})
@ApiPayloadTooLargeResponse({
  description: 'El cuerpo de la petición supera 1 MB.',
  type: ErrorResponseDto,
  example: err('PAYLOAD_TOO_LARGE', 'Payload Too Large'),
})
@ApiTooManyRequestsResponse({
  description:
    'Superaste el límite de peticiones por minuto de tu IP (60 por defecto). Espera y reintenta.',
  type: ErrorResponseDto,
  example: err('RATE_LIMITED', 'Demasiadas solicitudes, intenta más tarde'),
})
@ApiServiceUnavailableResponse({
  description:
    'El servicio de inferencia (Flask) está apagado o tardó más de 10 s. El gateway sigue en pie.',
  type: ErrorResponseDto,
  example: err(
    'ML_SERVICE_UNAVAILABLE',
    'El servicio de inferencia no está disponible',
  ),
})
@UseGuards(ThrottlerGuard, ApiKeyGuard)
@Controller('predict')
export class PredictController {
  constructor(private readonly predictService: PredictService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Analizar un email',
    description:
      'Recibe **un** email (asunto opcional + cuerpo) y devuelve si es phishing o legítimo, ' +
      'con la probabilidad de cada clase.\n\n' +
      'Úsalo cuando analizas mensajes de uno en uno, por ejemplo al llegar un correo o desde un formulario. ' +
      'Para muchos emails a la vez usa `/predict/batch`.\n\n' +
      'Cómo se calcula el resultado: ver la sección **Cómo se genera la predicción** al inicio de esta página.',
  })
  @ApiBody({
    type: PredictRequestDto,
    examples: {
      phishing: {
        summary: 'Phishing (suplanta a PayPal)',
        value: EJEMPLO_PHISHING,
      },
      legitimo: {
        summary: 'Email legítimo de trabajo',
        value: EJEMPLO_LEGITIMO,
      },
      sinAsunto: {
        summary: 'Solo cuerpo, sin asunto',
        value: {
          body: 'Congratulations! You have been selected to receive a $500 Amazon gift card. Claim now before it expires!',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Email analizado',
    type: PredictResponseDto,
    example: {
      label: 'PHISHING',
      confidence: 0.99988,
      probabilities: { ham: 0.00012, phishing: 0.99988 },
      model: 'bert-base-uncased-phishing',
      truncated: false,
      latencyMs: 118.4,
    },
  })
  predict(
    @Body() dto: PredictRequestDto,
    @Req() req: Request,
  ): Promise<PredictResponseDto> {
    return this.predictService.predict(dto, requestIdOf(req));
  }

  @Post('batch')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Analizar varios emails en una sola llamada (hasta 32)',
    description:
      'Hace lo mismo que `/predict`, pero con una lista de 1 a 32 emails. El modelo los procesa ' +
      'juntos en una sola pasada, así que es bastante más rápido que llamar 32 veces a `/predict`.\n\n' +
      'Úsalo para revisar una bandeja de entrada completa, importar un lote o evaluar un conjunto de pruebas. ' +
      'Los resultados vuelven **en el mismo orden** que enviaste los emails: `results[0]` corresponde a `emails[0]`.\n\n' +
      'Si **un solo** email del lote es inválido, se rechaza el lote completo con 400 y el mensaje indica cuál ' +
      '(por ejemplo `emails.1.body`).',
  })
  @ApiBody({
    type: PredictBatchRequestDto,
    examples: {
      dos: {
        summary: 'Dos emails: uno phishing y uno legítimo',
        value: { emails: [EJEMPLO_PHISHING, EJEMPLO_LEGITIMO] },
      },
    },
  })
  @ApiOkResponse({
    description: 'Lote analizado; un resultado por email, en el mismo orden',
    type: PredictBatchResponseDto,
    example: {
      results: [
        {
          label: 'PHISHING',
          confidence: 0.99988,
          probabilities: { ham: 0.00012, phishing: 0.99988 },
          model: 'bert-base-uncased-phishing',
          truncated: false,
        },
        {
          label: 'HAM',
          confidence: 0.99951,
          probabilities: { ham: 0.99951, phishing: 0.00049 },
          model: 'bert-base-uncased-phishing',
          truncated: false,
        },
      ],
      latencyMs: 203.9,
    },
  })
  predictBatch(
    @Body() dto: PredictBatchRequestDto,
    @Req() req: Request,
  ): Promise<PredictBatchResponseDto> {
    return this.predictService.predictBatch(dto, requestIdOf(req));
  }
}
