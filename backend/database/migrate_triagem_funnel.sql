-- ============================================================
-- LEGACY CRM — Migration: TRIAGEM funnel refactor + CAPS nomes
-- 1. Rename funnel "Geral" → "TRIAGEM" (slug permanece 'geral')
-- 2. Rename todos os outros funis para CAPS
-- 3. Rename stage 'recebido' no funil geral → "GERAL"
-- 4. Mover todos os leads do funil geral que estão em outras
--    stages para a stage 'recebido' (agora chamada GERAL)
-- 5. Remover as outras stages do funil TRIAGEM
-- ============================================================

-- STEP 1: Renomear todos os funis para CAPS
UPDATE funnels SET name = 'TRIAGEM'           WHERE slug = 'geral';
UPDATE funnels SET name = 'TRABALHISTA'       WHERE slug = 'trabalhista';
UPDATE funnels SET name = 'CLIENTE NEGATIVADO' WHERE slug = 'negativado';
UPDATE funnels SET name = 'GOLPE CIBERNÉTICO' WHERE slug = 'golpe-cibernetico';
UPDATE funnels SET name = 'GOLPE DO PIX'      WHERE slug = 'golpe-pix';

-- STEP 2: Renomear a stage 'recebido' para "GERAL" (nome de display)
-- Nota: o slug permanece 'recebido' para compatibilidade com o webhook
UPDATE stages SET name = 'GERAL' WHERE slug = 'recebido';

-- STEP 3: Pegar o ID do funil geral e da stage 'recebido'
-- e mover todos os leads das outras stages desse funil para 'recebido'
WITH geral_funnel AS (
    SELECT id FROM funnels WHERE slug = 'geral'
),
geral_stage AS (
    SELECT id FROM stages WHERE slug = 'recebido'
)
UPDATE leads
SET stage_id = (SELECT id FROM geral_stage)
WHERE funnel_id = (SELECT id FROM geral_funnel)
  AND stage_id != (SELECT id FROM geral_stage);

-- STEP 4: Remover todas as funnel_stages do funil TRIAGEM exceto 'recebido'
WITH geral_funnel AS (
    SELECT id FROM funnels WHERE slug = 'geral'
),
geral_stage AS (
    SELECT id FROM stages WHERE slug = 'recebido'
)
DELETE FROM funnel_stages
WHERE funnel_id = (SELECT id FROM geral_funnel)
  AND stage_id != (SELECT id FROM geral_stage);

-- Verificação rápida
SELECT f.name as funnel, s.name as stage, fs.display_order
FROM funnel_stages fs
JOIN funnels f ON f.id = fs.funnel_id
JOIN stages s ON s.id = fs.stage_id
WHERE f.slug = 'geral'
ORDER BY fs.display_order;
