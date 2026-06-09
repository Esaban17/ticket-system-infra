import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Propagación de request_id (BL-043). Toma `x-request-id` entrante o genera uno,
 * lo deja en `req.requestId` y lo refleja en la respuesta para correlación
 * end-to-end (API → logs → SQS attributes en los workers).
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    req.requestId = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  }
}
