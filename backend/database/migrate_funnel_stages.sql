-- ============================================================
-- LEGACY CRM — MIGRATION: Funnel Stages Refactor v2
-- Adds per-funnel stages, funnel_stages linking table,
-- funnel rename (civel → negativado), funnel_prompts table,
-- and bot_stage enum expansion for new flow.
-- Run ONCE against the 'legacy' database.
-- ============================================================

USE legacy;

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. Insert new stages (only if they don't yet exist)
-- ============================================================
INSERT IGNORE INTO stages (name, slug, display_order) VALUES
('Abordagem',        'abordagem',        2),
('Coleta de Informações', 'coleta_info', 3),
('Documentação',     'documentacao',     4),
('Procuração',       'procuracao',       5),
('Emissão Procuração','emissao_proc',    6),
('Análise',          'analise',          7),
('Assinatura',       'assinatura',       8),
('Envio e Espera',   'envio_espera',     9),
('Finalizado',       'finalizado',       10);

-- ============================================================
-- 2. Rename funnel "Cível / Consumidor" → "Cliente Negativado"
--    Update slug civel → negativado
-- ============================================================
UPDATE funnels
SET
    name        = 'Cliente Negativado',
    slug        = 'negativado',
    description = 'Limpeza de nome, negativação indevida, cobranças abusivas e danos morais',
    color       = 'hsl(20 80% 55%)'
WHERE slug = 'civel';

-- ============================================================
-- 3. Create funnel_stages: maps which stages belong to each funnel
--    and in which order (per-funnel Kanban columns)
-- ============================================================
CREATE TABLE IF NOT EXISTS funnel_stages (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    funnel_id    INT NOT NULL,
    stage_id     INT NOT NULL,
    display_order INT DEFAULT 0,
    is_auto      TINYINT(1) DEFAULT 0 COMMENT '1 = Sofia moves lead here automatically, 0 = manual',
    bot_stage_trigger VARCHAR(50) DEFAULT NULL COMMENT 'The bot_stage value that triggers auto-movement to this stage',
    FOREIGN KEY (funnel_id) REFERENCES funnels(id) ON DELETE CASCADE,
    FOREIGN KEY (stage_id)  REFERENCES stages(id)  ON DELETE CASCADE,
    UNIQUE KEY uq_funnel_stage (funnel_id, stage_id)
);

-- ============================================================
-- 4. Populate funnel_stages for each funnel
-- ============================================================

-- Helper: get IDs (use subqueries for portability)
-- FUNIL: negativado (Cliente Negativado)
INSERT IGNORE INTO funnel_stages (funnel_id, stage_id, display_order, is_auto, bot_stage_trigger)
SELECT f.id, s.id, s.display_order, 1, bot_trigger
FROM funnels f
JOIN (
    SELECT 'recebido'   AS slug, 1   AS display_order, 'reception'  AS bot_trigger
    UNION ALL SELECT 'abordagem',  2, 'approach'
    UNION ALL SELECT 'analise',    3, 'analysis'
    UNION ALL SELECT 'finalizado', 4, NULL
) vals ON 1=1
JOIN stages s ON s.slug = vals.slug
WHERE f.slug = 'negativado';

-- FUNIL: golpe-pix
INSERT IGNORE INTO funnel_stages (funnel_id, stage_id, display_order, is_auto, bot_stage_trigger)
SELECT f.id, s.id, s.display_order, is_auto_flag, bot_trigger
FROM funnels f
JOIN (
    SELECT 'recebido'     AS slug, 1  AS display_order, 1 AS is_auto_flag, 'reception'      AS bot_trigger
    UNION ALL SELECT 'abordagem',   2, 1, 'approach'
    UNION ALL SELECT 'coleta_info', 3, 1, 'info_collection'
    UNION ALL SELECT 'documentacao',4, 1, 'doc_request'
    UNION ALL SELECT 'procuracao',  5, 1, 'procuracao_docs'
    UNION ALL SELECT 'analise',     6, 1, 'analysis'
    UNION ALL SELECT 'assinatura',  7, 0, NULL
    UNION ALL SELECT 'envio_espera',8, 0, NULL
    UNION ALL SELECT 'finalizado',  9, 0, NULL
) vals ON 1=1
JOIN stages s ON s.slug = vals.slug
WHERE f.slug = 'golpe-pix';

-- FUNIL: trabalhista
INSERT IGNORE INTO funnel_stages (funnel_id, stage_id, display_order, is_auto, bot_stage_trigger)
SELECT f.id, s.id, s.display_order, is_auto_flag, bot_trigger
FROM funnels f
JOIN (
    SELECT 'recebido'     AS slug, 1 AS display_order, 1 AS is_auto_flag, 'reception'      AS bot_trigger
    UNION ALL SELECT 'abordagem',   2, 1, 'approach'
    UNION ALL SELECT 'documentacao',3, 1, 'doc_request'
    UNION ALL SELECT 'analise',     4, 1, 'analysis'
    UNION ALL SELECT 'envio_espera',5, 0, NULL
    UNION ALL SELECT 'finalizado',  6, 0, NULL
) vals ON 1=1
JOIN stages s ON s.slug = vals.slug
WHERE f.slug = 'trabalhista';

-- FUNIL: golpe-cibernetico
INSERT IGNORE INTO funnel_stages (funnel_id, stage_id, display_order, is_auto, bot_stage_trigger)
SELECT f.id, s.id, s.display_order, is_auto_flag, bot_trigger
FROM funnels f
JOIN (
    SELECT 'recebido'     AS slug, 1 AS display_order, 1 AS is_auto_flag, 'reception'      AS bot_trigger
    UNION ALL SELECT 'abordagem',   2, 1, 'approach'
    UNION ALL SELECT 'documentacao',3, 1, 'doc_request'
    UNION ALL SELECT 'analise',     4, 1, 'analysis'
    UNION ALL SELECT 'envio_espera',5, 0, NULL
    UNION ALL SELECT 'finalizado',  6, 0, NULL
) vals ON 1=1
JOIN stages s ON s.slug = vals.slug
WHERE f.slug = 'golpe-cibernetico';

-- ============================================================
-- 5. Create funnel_prompts: per-funnel per-stage Sofia prompt
-- ============================================================
CREATE TABLE IF NOT EXISTS funnel_prompts (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    funnel_id   INT NOT NULL,
    bot_stage   VARCHAR(50) NOT NULL,
    prompt_text TEXT NOT NULL,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (funnel_id) REFERENCES funnels(id) ON DELETE CASCADE,
    UNIQUE KEY uq_funnel_bot_stage (funnel_id, bot_stage)
);

-- ============================================================
-- 6. Expand leads.bot_stage to support new stages
--    (the column was added by migrate_bot.sql as VARCHAR(50), no change needed)
--    But update default value
-- ============================================================
ALTER TABLE leads
    MODIFY COLUMN bot_stage VARCHAR(50) DEFAULT 'reception';

-- ============================================================
-- 7. Add gender_detected column to leads for procuracao template
-- ============================================================
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS gender ENUM('masculino','feminino','desconhecido') DEFAULT 'desconhecido'
    COMMENT 'Detected gender for procuracao template selection';

-- ============================================================
-- 8. Add case_summary column to leads for handoff summary
-- ============================================================
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS case_summary TEXT DEFAULT NULL
    COMMENT 'AI-generated case summary saved when lead reaches analysis stage';

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'migrate_funnel_stages.sql executed successfully.' AS status;
