import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

import { TicketsService, StoredObject } from './tickets.service';

/**
 * Delivery 3 end-to-end proof endpoints. With the global /v1 prefix these are
 * reachable at GET/POST /v1/tickets, exclusively through the ALB Ingress.
 */
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  // GET /v1/tickets — reads from the database (not a hardcoded payload).
  @Get()
  list() {
    return this.tickets.list();
  }

  // POST /v1/tickets — writes the JSON body to S3, returns 201 + object key.
  @Post()
  @HttpCode(201)
  create(@Body() body: Record<string, unknown>): Promise<StoredObject> {
    return this.tickets.saveAttachment(body);
  }
}
