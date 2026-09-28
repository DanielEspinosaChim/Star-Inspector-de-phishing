import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const MAX_BODY_CHARS = 20_000;
export const MAX_SUBJECT_CHARS = 1_000;
export const MAX_BATCH = 32;

export class PredictRequestDto {
  @ApiPropertyOptional({
    description:
      'Asunto del email. Opcional; si no se envía se usa cadena vacía. ' +
      'El modelo lo lee antes del cuerpo, así que un asunto sospechoso pesa en el resultado.',
    maxLength: MAX_SUBJECT_CHARS,
    example: 'Your account has been limited',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SUBJECT_CHARS)
  subject?: string;

  @ApiProperty({
    description:
      'Cuerpo del email en texto plano o HTML (el HTML se limpia antes de analizar). ' +
      'Se aceptan hasta 20,000 caracteres, pero el modelo solo lee los primeros ' +
      '1000 caracteres de asunto + cuerpo (≈128 tokens).',
    minLength: 1,
    maxLength: MAX_BODY_CHARS,
    example:
      'Click here to verify your PayPal account immediately or it will be suspended. Login: http://paypal-verify.suspicious.com',
  })
  @IsString()
  @Matches(/\S/, { message: 'body no puede estar vacío' })
  @MaxLength(MAX_BODY_CHARS)
  body!: string;
}

export class PredictBatchRequestDto {
  @ApiProperty({
    description:
      'Lista de 1 a 32 emails. Cada uno tiene el mismo formato que en /predict. ' +
      'Los resultados vuelven en el mismo orden.',
    type: [PredictRequestDto],
    minItems: 1,
    maxItems: MAX_BATCH,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH)
  @ValidateNested({ each: true })
  @Type(() => PredictRequestDto)
  emails!: PredictRequestDto[];
}
