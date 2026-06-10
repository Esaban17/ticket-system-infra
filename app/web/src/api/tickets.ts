import { apiClient } from './client';
import type {
  AssignTicketRequest,
  ChangeStateRequest,
  CreateTicketRequest,
  ListEventsParams,
  ListResponse,
  ListTicketsParams,
  Ticket,
  TicketEvent,
} from './types';

/**
 * Crea un ticket. Envía siempre un header `Idempotency-Key` (uuid):
 * si la petición se repite dentro de 24h el API devuelve el mismo ticket.
 */
export function createTicket(
  body: CreateTicketRequest,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<Ticket> {
  return apiClient.post<Ticket>('/tickets', {
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

/** Lista tickets con filtros + paginación por cursor (orden: priority DESC, createdAt ASC). */
export function listTickets(
  params: ListTicketsParams = {},
): Promise<ListResponse<Ticket>> {
  return apiClient.get<ListResponse<Ticket>>('/tickets', { params: { ...params } });
}

export function getTicket(id: string): Promise<Ticket> {
  return apiClient.get<Ticket>(`/tickets/${id}`);
}

/** Historial de eventos del ticket (paginado por cursor). */
export function listEvents(
  ticketId: string,
  params: ListEventsParams = {},
): Promise<ListResponse<TicketEvent>> {
  return apiClient.get<ListResponse<TicketEvent>>(`/tickets/${ticketId}/events`, {
    params: { ...params },
  });
}

/**
 * Asigna el ticket (agente|administrador). Optimistic locking:
 * enviar `expectedVersion` = `ticket.version`; 409 → refetch y reintentar.
 */
export function assignTicket(
  ticketId: string,
  body: AssignTicketRequest,
): Promise<Ticket> {
  return apiClient.post<Ticket>(`/tickets/${ticketId}/assign`, { body });
}

/**
 * Cambia el estado (agente|administrador). `rootCause` y `solution` son
 * obligatorios si targetState=resuelto. 409 → version desactualizada.
 */
export function changeState(
  ticketId: string,
  body: ChangeStateRequest,
): Promise<Ticket> {
  return apiClient.patch<Ticket>(`/tickets/${ticketId}/state`, { body });
}
