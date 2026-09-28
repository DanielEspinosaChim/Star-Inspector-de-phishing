import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { MlClientService } from '../ml-client/ml-client.service.js';

export class HealthResponseDto {
  @ApiProperty({
    description: 'El gateway siempre responde ok si puede contestar',
    example: 'ok',
  })
  gateway!: 'ok';

  @ApiProperty({
    description:
      'Estado del servicio de inferencia (Flask con el modelo BERT). ' +
      'Si es `down`, /predict responderá 503 hasta que se levante.',
    enum: ['ok', 'down'],
    example: 'ok',
  })
  mlService!: 'ok' | 'down';

  @ApiProperty({
    description:
      'Dónde corre el modelo: `cpu` en producción. `null` si el servicio de inferencia está caído.',
    nullable: true,
    example: 'cpu',
    type: String,
  })
  device!: string | null;
}

@ApiTags('Estado')
@Controller('health')
export class HealthController {
  constructor(private readonly ml: MlClientService) {}

  @Get()
  @ApiOperation({
    summary: 'Ver si la API y el modelo están listos',
    description:
      'No necesita API key. Úsalo antes de enviar emails, o desde un monitor de disponibilidad. ' +
      'Siempre responde 200; revisa `mlService` para saber si el modelo puede atender.',
  })
  @ApiOkResponse({ type: HealthResponseDto })
  async health(): Promise<HealthResponseDto> {
    const ml = await this.ml.health();
    return {
      gateway: 'ok',
      mlService: ml?.status === 'ok' ? 'ok' : 'down',
      device: ml?.device ?? null,
    };
  }
}
