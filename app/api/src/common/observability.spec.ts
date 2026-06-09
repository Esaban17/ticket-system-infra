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
