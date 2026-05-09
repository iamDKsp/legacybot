-- ============================================================
-- LEGACY CRM — Migration: Granular Address Fields
-- Adiciona campos de endereço separados na tabela leads
-- Executar em produção (Railway) via psql ou Railway console
-- ============================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS street       VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS number       VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS zip_code     VARCHAR(10)  DEFAULT NULL;

-- Comentário: o campo "address" original é mantido para
-- retrocompatibilidade com o bot (Sofia extrai endereço completo)
-- Os novos campos permitem ao assessor detalhar manualmente.
