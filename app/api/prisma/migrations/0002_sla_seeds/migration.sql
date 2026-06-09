-- ============================================================
-- Seeds idempotentes de sla_rules (BL-010).
-- Valores POR DEFAULT (minutos) — pendientes de confirmación final del PM (Q5).
-- UPSERT por priority: reaplicar esta migración no duplica filas.
--   time_to_assign  = minutos para asignar antes de incumplir SLA de asignación
--   time_to_resolve = minutos para resolver antes de incumplir SLA de resolución
--   escalation_l1/l2 = minutos (desde creación) para escalar a nivel 1 / nivel 2
-- ============================================================

INSERT INTO "sla_rules"
  ("priority", "time_to_assign_minutes", "time_to_resolve_minutes", "escalation_l1_minutes", "escalation_l2_minutes", "active")
VALUES
  ('critica', 15,  60,   30,  45,   true),
  ('alta',    30,  240,  120, 180,  true),
  ('media',   60,  480,  240, 360,  true),
  ('baja',    120, 1440, 720, 1080, true)
ON CONFLICT ("priority") DO UPDATE SET
  "time_to_assign_minutes"  = EXCLUDED."time_to_assign_minutes",
  "time_to_resolve_minutes" = EXCLUDED."time_to_resolve_minutes",
  "escalation_l1_minutes"   = EXCLUDED."escalation_l1_minutes",
  "escalation_l2_minutes"   = EXCLUDED."escalation_l2_minutes",
  "active"                  = EXCLUDED."active",
  "updated_at"              = now();
