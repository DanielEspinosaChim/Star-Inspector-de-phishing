import { ApiProperty } from '@nestjs/swagger';

class ErrorDetailDto {
  @ApiProperty({
    description:
      'Código estable del error, pensado para que el cliente lo evalúe',
    enum: [
      'VALIDATION_ERROR',
      'UNAUTHORIZED',
      'NOT_FOUND',
      'RATE_LIMITED',
      'PAYLOAD_TOO_LARGE',
      'ML_SERVICE_UNAVAILABLE',
      'INTERNAL_ERROR',
    ],
  })
  code!: string;

  @ApiProperty({
    description:
      'Explicación legible. Nunca incluye el texto del email ni detalles internos.',
  })
  message!: string;
}

/** Formato único de todos los errores de la API. */
export class ErrorResponseDto {
  @ApiProperty({ type: ErrorDetailDto })
  error!: ErrorDetailDto;
}
