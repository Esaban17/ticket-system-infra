-- ============================================================
-- Delivery 4 — esquema de dominio completo (EP-02)
-- Reemplaza el modelo mínimo de tickets del proof E2E de D3.
-- Tablas: users, tickets, ticket_events (append-only), sla_rules, attachments.
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "user_role"         AS ENUM ('reportante', 'agente', 'administrador');
CREATE TYPE "ticket_type"       AS ENUM ('incidente', 'solicitud');
CREATE TYPE "ticket_priority"   AS ENUM ('critica', 'alta', 'media', 'baja');
CREATE TYPE "ticket_status"     AS ENUM ('abierto', 'en_progreso', 'resuelto');
CREATE TYPE "attachment_status" AS ENUM ('pending', 'attached', 'expired');
CREATE TYPE "ticket_event_type" AS ENUM (
  'ticket_creado', 'asignacion', 'cambio_estado', 'resolucion',
  'escalamiento', 'comentario', 'adjunto_agregado', 'adjunto_descargado'
);

-- Sequence que alimenta ticket_number (formato TKT-XXXX).
CREATE SEQUENCE "ticket_number_seq" START 1;

-- Trigger genérico para mantener updated_at en UPDATE crudos (Prisma además lo
-- setea con @updatedAt en sus propias escrituras).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── users ────────────────────────────────────────────────────────────────────
CREATE TABLE "users" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email"         TEXT NOT NULL UNIQUE,
  "role"          "user_role" NOT NULL DEFAULT 'reportante',
  "notify_email"  BOOLEAN NOT NULL DEFAULT true,
  "notify_slack"  BOOLEAN NOT NULL DEFAULT false,
  "slack_user_id" TEXT,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── tickets ──────────────────────────────────────────────────────────────────
CREATE TABLE "tickets" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_number"   TEXT NOT NULL UNIQUE DEFAULT ('TKT-' || lpad(nextval('ticket_number_seq')::text, 4, '0')),
  "type"            "ticket_type" NOT NULL,
  "title"           TEXT NOT NULL,
  "description"     TEXT NOT NULL,
  "severity"        INTEGER NOT NULL,
  "impact"          INTEGER NOT NULL,
  "priority"        "ticket_priority" NOT NULL,
  "status"          "ticket_status" NOT NULL DEFAULT 'abierto',
  "reporter_id"     UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "assignee_id"     UUID REFERENCES "users"("id") ON DELETE RESTRICT,
  "escalation_level" INTEGER NOT NULL DEFAULT 0,
  "sla_due_at"      TIMESTAMPTZ,
  "version"         INTEGER NOT NULL DEFAULT 0,
  "root_cause"      TEXT,
  "solution"        TEXT,
  "resolved_at"     TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "tickets_severity_range" CHECK ("severity" BETWEEN 1 AND 4),
  CONSTRAINT "tickets_impact_range"   CHECK ("impact" BETWEEN 1 AND 4),
  -- Cuando el ticket está resuelto, root_cause/solution/resolved_at son obligatorios.
  CONSTRAINT "tickets_resolved_fields" CHECK (
    "status" <> 'resuelto'
    OR ("resolved_at" IS NOT NULL AND "root_cause" IS NOT NULL AND "solution" IS NOT NULL)
  )
);
CREATE INDEX "tickets_status_priority_created_idx" ON "tickets" ("status", "priority" DESC, "created_at");
CREATE INDEX "tickets_assignee_status_idx" ON "tickets" ("assignee_id", "status");
CREATE INDEX "tickets_reporter_idx" ON "tickets" ("reporter_id");
-- Índice parcial para el barrido de SLA (solo tickets no resueltos).
CREATE INDEX "tickets_sla_due_open_idx" ON "tickets" ("sla_due_at") WHERE "status" <> 'resuelto';
CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON "tickets"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── ticket_events (append-only) ──────────────────────────────────────────────
CREATE TABLE "ticket_events" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id"  UUID NOT NULL REFERENCES "tickets"("id") ON DELETE RESTRICT,
  "actor_id"   UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "event_type" "ticket_event_type" NOT NULL,
  "payload"    JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "ticket_events_ticket_created_idx" ON "ticket_events" ("ticket_id", "created_at");

-- Append-only: el rol de aplicación solo recibe SELECT/INSERT (BL-009). Se
-- aplica únicamente si existe un rol dedicado 'ticket_app'; con el usuario
-- master de RDS este bloque es no-op intencional.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ticket_app') THEN
    REVOKE UPDATE, DELETE ON "ticket_events" FROM "ticket_app";
    GRANT SELECT, INSERT ON "ticket_events" TO "ticket_app";
  END IF;
END $$;

-- ── sla_rules ────────────────────────────────────────────────────────────────
CREATE TABLE "sla_rules" (
  "id"                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "priority"                "ticket_priority" NOT NULL UNIQUE,
  "time_to_assign_minutes"  INTEGER NOT NULL,
  "time_to_resolve_minutes" INTEGER NOT NULL,
  "escalation_l1_minutes"   INTEGER NOT NULL,
  "escalation_l2_minutes"   INTEGER NOT NULL,
  "active"                  BOOLEAN NOT NULL DEFAULT true,
  "created_at"              TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_sla_rules_updated_at BEFORE UPDATE ON "sla_rules"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── attachments ──────────────────────────────────────────────────────────────
-- Ciclo de vida: pending → attached (asociado a un ticket) | expired (no usado).
CREATE TABLE "attachments" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "s3_key"            TEXT NOT NULL UNIQUE,
  "original_filename" TEXT NOT NULL,
  "content_type"      TEXT NOT NULL,
  "size_bytes"        INTEGER NOT NULL,
  "uploader_id"       UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "ticket_id"         UUID REFERENCES "tickets"("id") ON DELETE RESTRICT,
  "status"            "attachment_status" NOT NULL DEFAULT 'pending',
  "expires_at"        TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "attached_at"       TIMESTAMPTZ
);
CREATE INDEX "attachments_uploader_status_idx" ON "attachments" ("uploader_id", "status");
CREATE INDEX "attachments_ticket_idx" ON "attachments" ("ticket_id");
