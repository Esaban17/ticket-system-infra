// Tipos del contrato del API — única fuente de verdad: docs/api-contract.

// ---------- Enums ----------

export const TICKET_TYPES = ['incidente', 'solicitud'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_STATUSES = ['abierto', 'en_progreso', 'resuelto'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PRIORITIES = ['critica', 'alta', 'media', 'baja'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ROLES = ['reportante', 'agente', 'administrador'] as const;
export type Role = (typeof ROLES)[number];

export const EVENT_TYPES = [
  'ticket_creado',
  'asignacion',
  'cambio_estado',
  'resolucion',
  'escalamiento',
  'comentario',
  'adjunto_agregado',
  'adjunto_descargado',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Severidad / impacto: enteros 1..4 (la prioridad la calcula el backend). */
export type SeverityLevel = 1 | 2 | 3 | 4;

// ---------- Entidades ----------

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface Ticket {
  id: string;
  ticketNumber: string; // "TKT-0001"
  type: TicketType;
  title: string;
  description: string;
  severity: number; // 1..4
  impact: number; // 1..4
  priority: Priority;
  status: TicketStatus;
  reporterId: string;
  assigneeId: string | null;
  escalationLevel: number; // 0..3
  slaDueAt: string; // ISO8601
  rootCause: string | null;
  solution: string | null;
  resolvedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketEvent {
  id: string;
  ticketId: string;
  actorId: string;
  eventType: EventType;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: User;
}

// ---------- Errores (RFC 9457 Problem Details) ----------

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  request_id?: string;
  timestamp?: string;
}

// ---------- Respuestas genéricas ----------

export interface ListResponse<T> {
  items: T[];
  nextCursor: string | null;
}

// ---------- Requests / responses por endpoint ----------

export interface CreateTicketRequest {
  type: TicketType;
  title: string; // 5..200
  description: string; // 20..5000
  severity: SeverityLevel;
  impact: SeverityLevel;
  attachments?: string[]; // uuids, max 10
}

export interface ListTicketsParams {
  status?: TicketStatus;
  priority?: Priority;
  severity?: SeverityLevel;
  /** uuid de assignee o "me" */
  assigneeId?: string;
  createdFrom?: string; // ISO8601
  createdTo?: string; // ISO8601
  /** Búsqueda en title + description */
  q?: string;
  cursor?: string;
  limit?: number; // 1..100, default 20
}

export interface ListEventsParams {
  cursor?: string;
  limit?: number;
}

export interface CreateCommentRequest {
  message: string; // texto del comentario; no vacío (tras normalizar espacios)
}

export interface AssignTicketRequest {
  assigneeId: string;
  expectedVersion: number;
}

export interface ChangeStateRequest {
  targetState: Extract<TicketStatus, 'en_progreso' | 'resuelto'>;
  expectedVersion: number;
  rootCause?: string; // obligatorio si targetState=resuelto
  solution?: string; // obligatorio si targetState=resuelto
}

export interface RequestUploadRequest {
  filename: string; // max 255
  contentType: string; // whitelist: pdf, png, jpeg, docx, xlsx, txt, log
  sizeBytes: number; // 1..10485760
}

export interface RequestUploadResponse {
  attachmentId: string;
  key: string;
  uploadUrl: string; // PUT, expira en 10 min
  expiresIn: number;
}

export interface DownloadUrlResponse {
  downloadUrl: string;
  expiresIn: number;
}

export interface ReportsCsvParams {
  from?: string; // ISO8601 (sobre resolvedAt)
  to?: string; // ISO8601
  priority?: Priority;
  assigneeId?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

/** GET /v1/auth/config — el SPA decide qué mostrar (form mock y/o SSO Cognito). */
export interface AuthConfig {
  provider: 'mock' | 'cognito';
  cognito: {
    domain: string;
    clientId: string;
    redirectUri: string;
    logoutUri: string | null;
    scope: string;
  } | null;
}
