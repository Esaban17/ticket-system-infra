-- BL-014 — Idempotency-Key para POST /v1/tickets.
-- Un mismo Idempotency-Key (ventana 24h, validada en la app) no duplica tickets.
ALTER TABLE "tickets" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "tickets_idempotency_key_key" ON "tickets" ("idempotency_key");
