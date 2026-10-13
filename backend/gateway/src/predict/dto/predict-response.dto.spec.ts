// U5 (gateway) — Metadatos de los DTOs de respuesta (contrato documentado)
const DECORATORS = {
  API_MODEL_PROPERTIES: 'swagger/apiModelProperties',
  API_MODEL_PROPERTIES_ARRAY: 'swagger/apiModelPropertiesArray',
} as const;
import {
  MlPredictionDto,
  PredictBatchResponseDto,
  PredictResponseDto,
  ProbabilitiesDto,
} from './predict-response.dto.js';

const campos = (cls: new () => object) =>
  (
    (Reflect.getMetadata(
      DECORATORS.API_MODEL_PROPERTIES_ARRAY,
      cls.prototype,
    ) ?? []) as string[]
  )
    .map((c) => c.slice(1))
    .sort();

const meta = (cls: new () => object, campo: string) =>
  Reflect.getMetadata(
    DECORATORS.API_MODEL_PROPERTIES,
    cls.prototype,
    campo,
  ) as Record<string, any>;

describe('DTOs de respuesta', () => {
  it('U5-G80 ProbabilitiesDto declara ham y phishing en [0, 1]', () => {
    expect(campos(ProbabilitiesDto)).toEqual(['ham', 'phishing']);
    for (const c of ['ham', 'phishing']) {
      expect(meta(ProbabilitiesDto, c)).toMatchObject({
        minimum: 0,
        maximum: 1,
      });
    }
  });

  it('U5-G81 MlPredictionDto declara los 5 campos y el enum de label', () => {
    expect(campos(MlPredictionDto)).toEqual([
      'confidence',
      'label',
      'model',
      'probabilities',
      'truncated',
    ]);
    expect(meta(MlPredictionDto, 'label').enum).toEqual(['HAM', 'PHISHING']);
    expect(meta(MlPredictionDto, 'confidence')).toMatchObject({
      minimum: 0.5,
      maximum: 1,
    });
  });

  it('U5-G82 PredictResponseDto hereda los campos y agrega latencyMs', () => {
    expect(campos(PredictResponseDto)).toEqual([
      'confidence',
      'label',
      'latencyMs',
      'model',
      'probabilities',
      'truncated',
    ]);
    expect(new PredictResponseDto()).toBeInstanceOf(MlPredictionDto);
  });

  it('U5-G83 PredictBatchResponseDto declara results (lista) y latencyMs', () => {
    expect(campos(PredictBatchResponseDto)).toEqual(['latencyMs', 'results']);
    expect(meta(PredictBatchResponseDto, 'results').isArray).toBe(true);
    expect(meta(PredictBatchResponseDto, 'results').type).toBe(MlPredictionDto);
  });

  it('U5-G84 los ejemplos de la doc son coherentes (ham + phishing = 1)', () => {
    const p =
      meta(ProbabilitiesDto, 'ham').example +
      meta(ProbabilitiesDto, 'phishing').example;
    expect(p).toBeCloseTo(1, 10);
  });
});
