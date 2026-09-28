import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  PredictBatchRequestDto,
  PredictRequestDto,
} from './predict-request.dto.js';

const errors = (cls: new () => object, plain: object) =>
  validateSync(plainToInstance(cls, plain), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('PredictRequestDto', () => {
  it('acepta un email válido con y sin subject', () => {
    expect(
      errors(PredictRequestDto, { subject: 'Hola', body: 'texto' }),
    ).toHaveLength(0);
    expect(errors(PredictRequestDto, { body: 'texto' })).toHaveLength(0);
  });

  it.each([
    ['body ausente', {}],
    ['body vacío', { body: '' }],
    ['body solo espacios', { body: '   \n ' }],
    ['body no string', { body: 42 }],
    ['body > 20000', { body: 'x'.repeat(20_001) }],
    ['subject > 1000', { body: 'ok', subject: 's'.repeat(1_001) }],
    ['subject no string', { body: 'ok', subject: 5 }],
    ['campo extra', { body: 'ok', extra: 'x' }],
  ])('rechaza %s', (_, plain) => {
    expect(errors(PredictRequestDto, plain).length).toBeGreaterThan(0);
  });
});

describe('PredictBatchRequestDto', () => {
  it('acepta de 1 a 32 emails', () => {
    expect(
      errors(PredictBatchRequestDto, { emails: [{ body: 'a' }] }),
    ).toHaveLength(0);
    const max = Array.from({ length: 32 }, () => ({ body: 'a' }));
    expect(errors(PredictBatchRequestDto, { emails: max })).toHaveLength(0);
  });

  it.each([
    ['vacío', { emails: [] }],
    ['33 items', { emails: Array.from({ length: 33 }, () => ({ body: 'a' })) }],
    ['no arreglo', { emails: 'x' }],
    ['item inválido', { emails: [{ body: 'ok' }, { body: '' }] }],
  ])('rechaza batch %s', (_, plain) => {
    expect(errors(PredictBatchRequestDto, plain).length).toBeGreaterThan(0);
  });
});
