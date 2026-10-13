// U5 (gateway) — Respuesta de /health
import type { MlClientService } from '../ml-client/ml-client.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const ml = { health: vi.fn() };
  const controller = new HealthController(ml as unknown as MlClientService);

  it('U5-G16 Flask arriba → mlService ok y device', async () => {
    ml.health.mockResolvedValue({ status: 'ok', device: 'cpu', model: 'm' });
    await expect(controller.health()).resolves.toEqual({
      gateway: 'ok',
      mlService: 'ok',
      device: 'cpu',
    });
  });

  it.each([
    ['caído', null],
    ['estado distinto de ok', { status: 'loading', device: 'cpu', model: 'm' }],
  ])('U5-G17 Flask %s → mlService down', async (_, health) => {
    ml.health.mockResolvedValue(health);
    const res = await controller.health();
    expect(res.gateway).toBe('ok');
    expect(res.mlService).toBe('down');
  });
});

describe('HealthController: casos adicionales', () => {
  const ml = { health: vi.fn() };
  const controller = new HealthController(ml as unknown as MlClientService);

  it('U5-G31 status ok sin device → device null', async () => {
    ml.health.mockResolvedValue({ status: 'ok' });
    await expect(controller.health()).resolves.toEqual({
      gateway: 'ok',
      mlService: 'ok',
      device: null,
    });
  });

  it('U5-G32 caído → device null', async () => {
    ml.health.mockResolvedValue(null);
    await expect(controller.health()).resolves.toEqual({
      gateway: 'ok',
      mlService: 'down',
      device: null,
    });
  });

  it('U5-G33 no expone el modelo ni campos extra de Flask', async () => {
    ml.health.mockResolvedValue({
      status: 'ok',
      device: 'cpu',
      model: 'm',
      interno: 'ruta/secreta',
    });
    const res = await controller.health();
    expect(Object.keys(res).sort()).toEqual(['device', 'gateway', 'mlService']);
  });

  it('U5-G34 la ruta es GET /health y no exige API key', () => {
    expect(Reflect.getMetadata('path', HealthController)).toBe('health');
    expect(Reflect.getMetadata('__guards__', HealthController)).toBeUndefined();
    expect(
      Reflect.getMetadata(
        '__guards__',
        (HealthController.prototype as unknown as Record<string, object>)
          .health,
      ),
    ).toBeUndefined();
  });
});
