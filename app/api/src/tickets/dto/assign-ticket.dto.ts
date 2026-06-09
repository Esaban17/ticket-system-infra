import { IsInt, IsUUID, Min } from 'class-validator';

/** POST /v1/tickets/:id/assign (BL-018). */
export class AssignTicketDto {
  @IsUUID('4')
  assigneeId!: string;

  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
