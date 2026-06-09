import { NextFunction, Response } from 'express';

import {
  RequestIdMiddleware,
  RequestWithId,
  REQUEST_ID_HEADER,
} from './middleware/request-id.middleware';
import { JsonLoggerService } from './services/logger.service';
import { MetricsService } from './services/metrics.service';

describe('RequestIdMiddleware', () => {
  const mw = new RequestIdMiddleware();
  function run(headers: Record<string, string | string[]>) {
    const req = { headers } as unknown as RequestWithId;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;
    mw.use(req, res, next);
    return { req, setHeader, next };
  }

  it('usa el x-request-id entrante y lo refleja en la respuesta', () => {
    const { req, setHeader, next } = run({ [REQUEST_ID_HEADER]: 'incoming-1' });
    expect(req.requestId).toBe('incoming-1');
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'incoming-1');
    expect(next).toHaveBeenCalled();
  });

  it('genera un id cuando no viene', () => {
    const { req } = run({});
    expect(req.requestId).toMatch(/[0-9a-f-]{36}/);
  });

  it('toma el primer valor si el header llega como array', () => {
    const { req } = run({ [REQUEST_ID_HEADER]: ['first', 'second'] });
    expect(req.requestId).toBe('first');
  });
});

describe('JsonLoggerService.build', () => {
  it('incluye campos estándar + arbitrarios', () => {
    const log = new JsonLoggerService().build('info', 'ticket creado', {
      request_id: 'r1',
      actor_id: 'u1',
      ticket_number: 'TKT-0001',
    });
    expect(log).toMatchObject({
      level: 'info',
      service: 'ticket-system-api',
      message: 'ticket creado',
      request_id: 'r1',
      actor_id: 'u1',
      ticket_number: 'TKT-0001',
    });
    expect(typeof log.timestamp).toBe('string');
  });
});

describe('MetricsService.build (EMF)', () => {
  it('produce el documento EMF con namespace, dimensiones y la métrica', () => {
    const emf = new MetricsService().build('TicketsCreated', 1, 'Count', { priority: 'alta' });
    expect(emf).toMatchObject({ TicketsCreated: 1, priority: 'alta' });
    const aws = emf._aws as {
      CloudWatchMetrics: Array<{
        Namespace: string;
        Metrics: Array<{ Name: string; Unit: string }>;
      }>;
    };
    expect(aws.CloudWatchMetrics[0].Namespace).toBe('TicketSystem');
    expect(aws.CloudWatchMetrics[0].Metrics[0]).toEqual({ Name: 'TicketsCreated', Unit: 'Count' });
  });
});

describe('JsonLoggerService emit (stdout)', () => {
  it('escribe una línea JSON por nivel con los campos correctos', () => {
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const log = new JsonLoggerService();
    log.info('hola', { request_id: 'r1' });
    log.debug('d');
    log.warn('w');
    log.error('e', { actor_id: 'u9' });
    expect(spy).toHaveBeenCalledTimes(4);
    const first = JSON.parse(spy.mock.calls[0][0] as string);
    expect(first).toMatchObject({ level: 'info', message: 'hola', request_id: 'r1' });
    const last = JSON.parse(spy.mock.calls[3][0] as string);
    expect(last).toMatchObject({ level: 'error', message: 'e', actor_id: 'u9' });
    spy.mockRestore();
  });
});

describe('MetricsService emit (stdout)', () => {
  it('putMetric y count escriben EMF a stdout', () => {
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const m = new MetricsService();
    m.putMetric('Latency', 12, 'Milliseconds', { route: '/v1/tickets' });
    m.count('TicketsCreated', { priority: 'alta' });
    expect(spy).toHaveBeenCalledTimes(2);
    const doc = JSON.parse(spy.mock.calls[1][0] as string);
    expect(doc.TicketsCreated).toBe(1);
    expect(doc.priority).toBe('alta');
    spy.mockRestore();
  });
});

describe('cobertura de defaults', () => {
  it('MetricsService usa defaults (Count, sin dimensiones)', () => {
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const m = new MetricsService();
    const doc = m.build('Plain', 2); // unit=Count, dimensions={} por default
    expect(doc.Plain).toBe(2);
    m.putMetric('PlainPut', 5); // defaults
    m.count('PlainCount'); // dimensions={} por default
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('JsonLoggerService cae a env=development si NODE_ENV no está', () => {
    const prev = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      expect(new JsonLoggerService().build('info', 'x').env).toBe('development');
    } finally {
      if (prev !== undefined) process.env.NODE_ENV = prev;
    }
  });
});
