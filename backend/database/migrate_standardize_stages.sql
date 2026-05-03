-- ============================================================
-- LEGACY CRM — MIGRATION: Standardize Funnel Stages v3
-- Remove "Procuração" from ALL funnels
-- Standardize ALL funnels to end with:
--   ASSINATURA → ANALISE E ESPERA → FINALIZADO
-- ============================================================

USE legacy;

-- ============================================================
-- 1. Ensure required stages exist with correct names/slugs
-- ============================================================
INSERT IGNORE INTO stages (name, slug, display_order) VALUES
('Assinatura',       'assinatura',       7),
('Analise e Espera', 'analise_espera',   8),
('Finalizado',       'finalizado',       9);

-- Update name of 'Analise e Espera' if slug already exists with different name
UPDATE stages SET name = 'Analise e Espera' WHERE slug = 'analise_espera';

-- ============================================================
-- 2. Drop all existing funnel_stages and rebuild clean
-- ============================================================
DELETE FROM funnel_stages;

-- ============================================================
-- 3. Rebuild funnel_stages — standardized for all funnels
-- Structure:
--   Recebido > Abordagem > Documentação > Assinatura > Analise e Espera > Finalizado
-- (Golpe do Pix also includes Coleta de Informações before Documentação)
-- ============================================================

-- TRABALHISTA
INSERT INTO funnel_stages (funnel_id, stage_id, display_order, is_auto, bot_stage_trigger)
SELECT f.id, s.id, vals.ord, vals.ia, vals.trig
FROM funnels f
JOIN (
    SELECT 'recebido'       AS sl, 1 AS ord, 1 AS ia, 'reception'   AS trig
    UNION ALL SELECT 'abordagem',   2, 1, 'approach'
    UNION ALL SELECT 'documentacao',3, 1, 'doc_request'
    UNION ALL SELECT 'assinatura',  4, 0, NULL
    UNION ALL SELECT 'analise_espera', 5, 0, NULL
    UNION ALL SELECT 'finalizado',  6, 0, NULL
) vals ON 1=1
JOIN stages s ON s.slug = vals.sl
WHERE f.slug = 'trabalhista';

-- CLIENTE NEGATIVADO
INSERT INTO funnel_stages (funnel_id, stage_id, display_order, is_auto, bot_stage_trigger)
SELECT f.id, s.id, vals.ord, vals.ia, vals.trig
FROM funnels f
JOIN (
    SELECT 'recebido'       AS sl, 1 AS ord, 1 AS ia, 'reception'   AS trig
    UNION ALL SELECT 'abordagem',   2, 1, 'approach'
    UNION ALL SELECT 'documentacao',3, 1, 'doc_request'
    UNION ALL SELECT 'assinatura',  4, 0, NULL
    UNION ALL SELECT 'analise_espera', 5, 0, NULL
    UNION ALL SELECT 'finalizado',  6, 0, NULL
) vals ON 1=1
JOIN stages s ON s.slug = vals.sl
WHERE f.slug = 'negativado';

-- GOLPES CIBERNÉTICOS
INSERT INTO funnel_stages (funnel_id, stage_id, display_order, is_auto, bot_stage_trigger)
SELECT f.id, s.id, vals.ord, vals.ia, vals.trig
FROM funnels f
JOIN (
    SELECT 'recebido'       AS sl, 1 AS ord, 1 AS ia, 'reception'   AS trig
    UNION ALL SELECT 'abordagem',   2, 1, 'approach'
    UNION ALL SELECT 'documentacao',3, 1, 'doc_request'
    UNION ALL SELECT 'assinatura',  4, 0, NULL
    UNION ALL SELECT 'analise_espera', 5, 0, NULL
    UNION ALL SELECT 'finalizado',  6, 0, NULL
) vals ON 1=1
JOIN stages s ON s.slug = vals.sl
WHERE f.slug = 'golpe-cibernetico';

-- GOLPE DO PIX
INSERT INTO funnel_stages (funnel_id, stage_id, display_order, is_auto, bot_stage_trigger)
SELECT f.id, s.id, vals.ord, vals.ia, vals.trig
FROM funnels f
JOIN (
    SELECT 'recebido'       AS sl, 1 AS ord, 1 AS ia, 'reception'       AS trig
    UNION ALL SELECT 'abordagem',   2, 1, 'approach'
    UNION ALL SELECT 'coleta_info', 3, 1, 'info_collection'
    UNION ALL SELECT 'documentacao',4, 1, 'doc_request'
    UNION ALL SELECT 'assinatura',  5, 0, NULL
    UNION ALL SELECT 'analise_espera', 6, 0, NULL
    UNION ALL SELECT 'finalizado',  7, 0, NULL
) vals ON 1=1
JOIN stages s ON s.slug = vals.sl
WHERE f.slug = 'golpe-pix';

-- ============================================================
-- 4. Verify result
-- ============================================================
SELECT CONCAT(f.name, ' | ', s.name, ' | ordem:', fs.display_order) AS resultado
FROM funnel_stages fs
JOIN funnels f ON fs.funnel_id = f.id
JOIN stages s ON fs.stage_id = s.id
ORDER BY f.name, fs.display_order;

SELECT 'migrate_standardize_stages.sql executado com sucesso.' AS status;
