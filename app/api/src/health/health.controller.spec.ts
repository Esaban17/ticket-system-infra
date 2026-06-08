import { HealthController } from './health.controller';

describe('HealthController', () => {
  const controller = new HealthController();

  it('liveness() returns ok', () => {
    expect(controller.liveness()).toEqual({ status: 'ok' });
  });

  it('readiness() returns ready', () => {
    expect(controller.readiness()).toEqual({ status: 'ready' });
  });
});
