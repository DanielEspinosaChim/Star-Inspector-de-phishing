// U5 (gateway) — Construcción de la respuesta de /predict y /predict/batch
import type { MlClientService } from '../ml-client/ml-client.service.js';
import type { MlPredictionDto } from './dto/predict-response.dto.js';
import { PredictService } from './predict.service.js';

const pred = (
  label: 'HAM' | 'PHISHING',
  phishing: number,
): MlPredictionDto => ({
  label,
  confidence: Math.max(phishing, 1 - phishing),
  probabilities: { ham: 1 - phishing, phishing },
  model: 'bert-base-uncased-phishing',
  truncated: false,
});

describe('PredictService', () => {
  const ml = { predict: vi.fn(), predictBatch: vi.fn() };
  const service = new PredictService(ml as unknown as MlClientService);

  beforeEach(() => vi.resetAllMocks());

  it('U5-G01 sin subject envía cadena vacía y reenvía el request id', async () => {
    ml.predict.mockResolvedValue(pred('HAM', 0.1));
    await service.predict({ body: 'hola' }, 'req-1');
    expect(ml.predict).toHaveBeenCalledWith(
      { subject: '', body: 'hola' },
      'req-1',
    );
  });

  it('U5-G02 copia la predicción y agrega latencyMs', async () => {
    const p = pred('PHISHING', 0.97);
    ml.predict.mockResolvedValue(p);
    const res = await service.predict({ subject: 's', body: 'b' });
    expect(res).toMatchObject(p);
    expect(Object.keys(res).sort()).toEqual([
      'confidence',
      'label',
      'latencyMs',
      'model',
      'probabilities',
      'truncated',
    ]);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(res.latencyMs * 10)).toBe(true); // 1 decimal
  });

  it('U5-G03 no reenvía campos extra que trajera Flask', async () => {
    ml.predict.mockResolvedValue(
      Object.assign(pred('HAM', 0.2), { interno: 'x' }),
    );
    const res = await service.predict({ body: 'b' });
    expect(res).not.toHaveProperty('interno');
  });

  it('U5-G04 batch: normaliza subject y conserva el orden de resultados', async () => {
    const results = [
      pred('PHISHING', 0.9),
      pred('HAM', 0.1),
      pred('PHISHING', 0.8),
    ];
    ml.predictBatch.mockResolvedValue(results);
    const res = await service.predictBatch(
      { emails: [{ body: 'a' }, { subject: 's', body: 'b' }, { body: 'c' }] },
      'req-2',
    );
    expect(ml.predictBatch).toHaveBeenCalledWith(
      [
        { subject: '', body: 'a' },
        { subject: 's', body: 'b' },
        { subject: '', body: 'c' },
      ],
      'req-2',
    );
    expect(res.results.map((r) => r.label)).toEqual([
      'PHISHING',
      'HAM',
      'PHISHING',
    ]);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('U5-G05 propaga el error del cliente ML (503) sin envolverlo', async () => {
    const err = new Error('ML caído');
    ml.predict.mockRejectedValue(err);
    await expect(service.predict({ body: 'b' })).rejects.toBe(err);
  });
});

describe('PredictService: casos adicionales', () => {
  const ml = { predict: vi.fn(), predictBatch: vi.fn() };
  const service = new PredictService(ml as unknown as MlClientService);

  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('U5-G49 conserva un subject vacío y uno con contenido', async () => {
    ml.predict.mockResolvedValue(pred('HAM', 0.1));
    await service.predict({ subject: '', body: 'b' });
    await service.predict({ subject: 'asunto', body: 'b' });
    expect(ml.predict.mock.calls[0][0]).toEqual({ subject: '', body: 'b' });
    expect(ml.predict.mock.calls[1][0]).toEqual({
      subject: 'asunto',
      body: 'b',
    });
    expect(ml.predict.mock.calls[0][1]).toBeUndefined();
  });

  it('U5-G50 no muta el DTO de entrada', async () => {
    ml.predict.mockResolvedValue(pred('HAM', 0.1));
    const dto = { body: 'b' };
    await service.predict(dto);
    expect(dto).toEqual({ body: 'b' });
    ml.predictBatch.mockResolvedValue([pred('HAM', 0.1)]);
    const lote = { emails: [{ body: 'x' }] };
    await service.predictBatch(lote);
    expect(lote).toEqual({ emails: [{ body: 'x' }] });
  });

  it('U5-G51 latencyMs se redondea a 1 decimal a partir del reloj', async () => {
    ml.predict.mockResolvedValue(pred('HAM', 0.1));
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValueOnce(100).mockReturnValueOnce(218.46);
    const res = await service.predict({ body: 'b' });
    expect(res.latencyMs).toBe(118.5);
    ml.predictBatch.mockResolvedValue([]);
    now.mockReturnValueOnce(0).mockReturnValueOnce(203.94);
    expect((await service.predictBatch({ emails: [] })).latencyMs).toBe(203.9);
  });

  it('U5-G52 batch de 1 y de 32 emails llama una sola vez al cliente', async () => {
    for (const n of [1, 32]) {
      ml.predictBatch.mockReset();
      ml.predictBatch.mockResolvedValue(
        Array.from({ length: n }, () => pred('HAM', 0.1)),
      );
      const emails = Array.from({ length: n }, (_, i) => ({ body: `m${i}` }));
      const res = await service.predictBatch({ emails });
      expect(ml.predictBatch).toHaveBeenCalledOnce();
      expect(ml.predictBatch.mock.calls[0][0]).toHaveLength(n);
      expect(res.results).toHaveLength(n);
    }
  });

  it('U5-G53 batch propaga el error del cliente sin envolverlo', async () => {
    const err = new Error('ML caído');
    ml.predictBatch.mockRejectedValue(err);
    await expect(
      service.predictBatch({ emails: [{ body: 'a' }] }),
    ).rejects.toBe(err);
  });

  it('U5-G54 la respuesta de batch solo tiene results y latencyMs', async () => {
    ml.predictBatch.mockResolvedValue([pred('HAM', 0.1)]);
    const res = await service.predictBatch({ emails: [{ body: 'a' }] });
    expect(Object.keys(res).sort()).toEqual(['latencyMs', 'results']);
  });

  it('U5-G55 mapea ambas etiquetas y todos los campos de la predicción', async () => {
    for (const p of [pred('HAM', 0.05), pred('PHISHING', 0.95)]) {
      ml.predict.mockResolvedValue(p);
      const { latencyMs: _l, ...resto } = await service.predict({ body: 'b' });
      expect(resto).toEqual(p);
    }
  });
});
