import { ApiProperty } from '@nestjs/swagger';

export class ProbabilitiesDto {
  @ApiProperty({
    description: 'Probabilidad de que el email sea legítimo (clase HAM)',
    minimum: 0,
    maximum: 1,
    example: 0.00012,
  })
  ham!: number;

  @ApiProperty({
    description:
      'Probabilidad de que el email sea phishing. ham + phishing = 1',
    minimum: 0,
    maximum: 1,
    example: 0.99988,
  })
  phishing!: number;
}

/** Predicción tal como la devuelve el servicio de inferencia. */
export class MlPredictionDto {
  @ApiProperty({
    description:
      'Veredicto: la clase con mayor probabilidad. Equivale a decir PHISHING ' +
      'cuando probabilities.phishing > 0.5. HAM significa legítimo.',
    enum: ['HAM', 'PHISHING'],
    example: 'PHISHING',
  })
  label!: 'HAM' | 'PHISHING';

  @ApiProperty({
    description:
      'Probabilidad de la clase elegida (siempre ≥ 0.5). Qué tan seguro está el modelo de su veredicto.',
    minimum: 0.5,
    maximum: 1,
    example: 0.99988,
  })
  confidence!: number;

  @ApiProperty({ type: ProbabilitiesDto })
  probabilities!: ProbabilitiesDto;

  @ApiProperty({
    description: 'Identificador del modelo que respondió',
    example: 'bert-base-uncased-phishing',
  })
  model!: string;

  @ApiProperty({
    description:
      'true si el texto se recortó (más de 1000 caracteres o más de 128 tokens). ' +
      'En ese caso el final del email no influyó en el resultado.',
    example: false,
  })
  truncated!: boolean;
}

export class PredictResponseDto extends MlPredictionDto {
  @ApiProperty({
    description:
      'Milisegundos que tardó la inferencia, medidos en el gateway (incluye el viaje al servicio de inferencia)',
    example: 118.4,
  })
  latencyMs!: number;
}

export class PredictBatchResponseDto {
  @ApiProperty({
    description: 'Un resultado por email, en el mismo orden en que se enviaron',
    type: [MlPredictionDto],
  })
  results!: MlPredictionDto[];

  @ApiProperty({
    description:
      'Milisegundos del lote completo (todos los emails en una sola pasada del modelo)',
    example: 342.7,
  })
  latencyMs!: number;
}
