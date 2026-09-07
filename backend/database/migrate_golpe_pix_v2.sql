-- ============================================================
-- LEGACY CRM — MIGRATION: Golpe Pix v2 + Desqualificado stage
-- Adds 'Desqualificado' stage and links it to golpe-pix funnel.
-- Run ONCE against the 'legacy' database.
-- ============================================================

USE legacy;

-- 1. Create "Desqualificado" stage
INSERT IGNORE INTO stages (name, slug, display_order) VALUES
  ('Desqualificado', 'desqualificado', 99);

-- 2. Link Desqualificado to golpe-pix funnel
INSERT IGNORE INTO funnel_stages (funnel_id, stage_id, display_order, is_auto, bot_stage_trigger)
SELECT f.id, s.id, 10, 1, 'disqualified'
FROM funnels f, stages s
WHERE f.slug = 'golpe-pix' AND s.slug = 'desqualificado';

-- 3. (Optional) Also link Desqualificado to other funnels for future use
INSERT IGNORE INTO funnel_stages (funnel_id, stage_id, display_order, is_auto, bot_stage_trigger)
SELECT f.id, s.id, 10, 1, 'disqualified'
FROM funnels f, stages s
WHERE f.slug IN ('negativado', 'trabalhista', 'golpe-cibernetico') AND s.slug = 'desqualificado';

SELECT 'migrate_golpe_pix_v2.sql executed successfully.' AS status;
