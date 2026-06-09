-- BL-023 — Índice GIN para búsqueda full-text en title + description.
-- Soporta el filtro `q` de GET /v1/tickets a escala (to_tsvector('spanish', ...)).
CREATE INDEX "tickets_search_gin_idx" ON "tickets"
  USING GIN (to_tsvector('spanish', "title" || ' ' || "description"));
