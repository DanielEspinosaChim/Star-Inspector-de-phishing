// U5 (gateway) — Controller de /predict con el service simulado
import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiKeyGuard } from '../common/api-key.guard.js';
import type {
  PredictBatchResponseDto,
  PredictResponseDto,
} from './dto/predict-response.dto.js';
import { PredictController } from './predict.controller.js';
import type { PredictService } from './predict.service.js';

const RESP: PredictResponseDto = {
  label: 'PHISHING',
  confidence: 0.9,
  probabilities: { ham: 0.1, phishing: 0.9 },
  model: 'm',
  truncated: false,
  latencyMs: 1.2,
};
const BATCH: PredictBatchResponseDto = { results: [RESP], latencyMs: 2.3 };

const req = (headers: Record<string, unknown>) =>
  ({ headers }) as unknown as Request;

describe('PredictController', () => {
  const service = { predict: vi.fn(), predictBatch: vi.fn() };
  const controller = new PredictController(
    service as unknown as PredictService,
  );

  beforeEach(() => {
    service.predict.mockReset().mockResolvedValue(RESP);
    service.predictBatch.mockReset().mockResolvedValue(BATCH);
  });

  it('U5-G56 predict delega en el service con dto y request id', async () => {
    const dto = { subject: 's', body: 'b' };
    await expect(
      controller.predict(dto, req({ 'x-request-id': 'rid-1' })),
    ).resolves.toBe(RESP);
    expect(service.predict).toHaveBeenCalledExactlyOnceWith(dto, 'rid-1');
  });

  it('U5-G57 predictBatch delega en el service con dto y request id', async () => {
    const dto = { emails: [{ body: 'b' }] };
    await expect(
      controller.predictBatch(dto, req({ 'x-request-id': 'rid-2' })),
    ).resolves.toBe(BATCH);
    expect(service.predictBatch).toHaveBeenCalledExactlyOnceWith(dto, 'rid-2');
  });

  it.each([
    ['ausente', {}],
    ['arreglo', { 'x-request-id': ['a', 'b'] }],
    ['no string', { 'x-request-id': 5 }],
  ])('U5-G58 request id %s → undefined', async (_, headers) => {
    await controller.predict({ body: 'b' }, req(headers));
    await controller.predictBatch({ emails: [] }, req(headers));
    expect(service.predict.mock.calls[0][1]).toBeUndefined();
    expect(service.predictBatch.mock.calls[0][1]).toBeUndefined();
  });

  it('U5-G59 propaga los errores del service sin tocarlos', async () => {
    const err = new Error('503');
    service.predict.mockRejectedValue(err);
    service.predictBatch.mockRejectedValue(err);
    await expect(controller.predict({ body: 'b' }, req({}))).rejects.toBe(err);
    await expect(controller.predictBatch({ emails: [] }, req({}))).rejects.toBe(
      err,
    );
  });

  it('U5-G60 las rutas son POST /predict y POST /predict/batch con HTTP 200', () => {
    expect(Reflect.getMetadata('path', PredictController)).toBe('predict');
    const proto = PredictController.prototype as unknown as Record<
      string,
      object
    >;
    expect(Reflect.getMetadata('path', proto.predict)).toBe('/');
    expect(Reflect.getMetadata('path', proto.predictBatch)).toBe('batch');
    // RequestMethod.POST === 1
    expect(Reflect.getMetadata('method', proto.predict)).toBe(1);
    expect(Reflect.getMetadata('method', proto.predictBatch)).toBe(1);
    expect(Reflect.getMetadata('__httpCode__', proto.predict)).toBe(200);
    expect(Reflect.getMetadata('__httpCode__', proto.predictBatch)).toBe(200);
  });

  it('U5-G61 protege ambas rutas con ThrottlerGuard y ApiKeyGuard (en ese orden)', () => {
    expect(Reflect.getMetadata('__guards__', PredictController)).toEqual([
      ThrottlerGuard,
      ApiKeyGuard,
    ]);
  });

  it('U5-G62 el ApiKeyGuard del controller rechaza sin key antes de llegar al service', () => {
    const [, GuardCls] = Reflect.getMetadata(
      '__guards__',
      PredictController,
    ) as [unknown, typeof ApiKeyGuard];
    const guard = new GuardCls({ get: () => 'k'.repeat(20) } as never);
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow();
    expect(service.predict).not.toHaveBeenCalled();
  });
});
