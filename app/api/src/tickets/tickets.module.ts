import { Module } from '@nestjs/common';

import { NotificationsModule } from '@/notifications/notifications.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  // NotificationsModule expone NotificationsService (productor SQS) para que
  // TicketsService encole correos al reportante (EP-12 / BL-119).
  imports: [NotificationsModule],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
