-- ============================================================
-- LEGACY CRM - SEED DATA (completo)
-- ============================================================

USE legacy;

-- ============================================================
-- FUNNELS (área de atuação)
-- ============================================================
INSERT IGNORE INTO funnels (name, slug, color, description, display_order) VALUES
('Trabalhista',      'trabalhista',      'hsl(43 72% 49%)',  'Rescisão indireta, insalubridade, horas extras e demais direitos trabalhistas', 1),
('Cliente Negativado','negativado',      'hsl(20 80% 55%)',  'Limpeza de nome, negativação indevida, cobranças abusivas e danos morais', 2),
('Golpes Cibernéticos','golpe-cibernetico','hsl(200 70% 50%)','Recuperação de contas hackeadas e indenização por danos morais', 3),
('Golpe do Pix',     'golpe-pix',        'hsl(0 65% 55%)',   'Recuperação de valores perdidos em golpes do Pix e indenização por danos morais', 4);

-- ============================================================
-- STAGES (etapas globais do pipeline)
-- ============================================================
INSERT IGNORE INTO stages (name, slug, display_order) VALUES
('Recebido',              'recebido',        1),
('Abordagem',             'abordagem',        2),
('Coleta de Informações', 'coleta_info',      3),
('Documentação',          'documentacao',     4),
('Assinatura',            'assinatura',       5),
('Analise e Espera',      'analise_espera',   6),
('Finalizado',            'finalizado',       7);

-- ============================================================
-- FUNNEL_STAGES — colunas por funil (Kanban)
-- ============================================================

-- Trabalhista
INSERT IGNORE INTO funnel_stages (funnel_id, stage_id, display_order, is_auto, bot_stage_trigger)
SELECT f.id, s.id, vals.ord, vals.ia, vals.trig
FROM funnels f
JOIN (
    SELECT 'recebido'        AS sl, 1 AS ord, 1 AS ia, 'reception'   AS trig
    UNION ALL SELECT 'abordagem',      2, 1, 'approach'
    UNION ALL SELECT 'documentacao',   3, 1, 'doc_request'
    UNION ALL SELECT 'assinatura',     4, 0, NULL
    UNION ALL SELECT 'analise_espera', 5, 0, NULL
    UNION ALL SELECT 'finalizado',     6, 0, NULL
) vals ON 1=1
JOIN stages s ON s.slug = vals.sl
WHERE f.slug = 'trabalhista';

-- Cliente Negativado
INSERT IGNORE INTO funnel_stages (funnel_id, stage_id, display_order, is_auto, bot_stage_trigger)
SELECT f.id, s.id, vals.ord, vals.ia, vals.trig
FROM funnels f
JOIN (
    SELECT 'recebido'        AS sl, 1 AS ord, 1 AS ia, 'reception'   AS trig
    UNION ALL SELECT 'abordagem',      2, 1, 'approach'
    UNION ALL SELECT 'documentacao',   3, 1, 'doc_request'
    UNION ALL SELECT 'assinatura',     4, 0, NULL
    UNION ALL SELECT 'analise_espera', 5, 0, NULL
    UNION ALL SELECT 'finalizado',     6, 0, NULL
) vals ON 1=1
JOIN stages s ON s.slug = vals.sl
WHERE f.slug = 'negativado';

-- Golpes Cibernéticos
INSERT IGNORE INTO funnel_stages (funnel_id, stage_id, display_order, is_auto, bot_stage_trigger)
SELECT f.id, s.id, vals.ord, vals.ia, vals.trig
FROM funnels f
JOIN (
    SELECT 'recebido'        AS sl, 1 AS ord, 1 AS ia, 'reception'   AS trig
    UNION ALL SELECT 'abordagem',      2, 1, 'approach'
    UNION ALL SELECT 'documentacao',   3, 1, 'doc_request'
    UNION ALL SELECT 'assinatura',     4, 0, NULL
    UNION ALL SELECT 'analise_espera', 5, 0, NULL
    UNION ALL SELECT 'finalizado',     6, 0, NULL
) vals ON 1=1
JOIN stages s ON s.slug = vals.sl
WHERE f.slug = 'golpe-cibernetico';

-- Golpe do Pix
INSERT IGNORE INTO funnel_stages (funnel_id, stage_id, display_order, is_auto, bot_stage_trigger)
SELECT f.id, s.id, vals.ord, vals.ia, vals.trig
FROM funnels f
JOIN (
    SELECT 'recebido'        AS sl, 1 AS ord, 1 AS ia, 'reception'       AS trig
    UNION ALL SELECT 'abordagem',      2, 1, 'approach'
    UNION ALL SELECT 'coleta_info',    3, 1, 'info_collection'
    UNION ALL SELECT 'documentacao',   4, 1, 'doc_request'
    UNION ALL SELECT 'assinatura',     5, 0, NULL
    UNION ALL SELECT 'analise_espera', 6, 0, NULL
    UNION ALL SELECT 'finalizado',     7, 0, NULL
) vals ON 1=1
JOIN stages s ON s.slug = vals.sl
WHERE f.slug = 'golpe-pix';

-- ============================================================
-- ADMIN USER
-- Senha padrão: legacy@2025  (bcrypt hash rounds=10)
-- Para gerar novo hash no Node.js:
--   node -e "const b=require('bcrypt');b.hash('SUA_SENHA',10).then(console.log)"
-- ============================================================
INSERT IGNORE INTO users (name, email, password_hash, role) VALUES
('Administrador', 'admin@legacy.com', '$2b$10$rIC8BFN5USCJEKMrDJdHYuGxDmvf8RB8KuiHqJGKv1LdI2USDaAaK', 'admin');

SELECT 'seed.sql executado com sucesso.' AS status;
