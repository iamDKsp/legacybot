-- =============================================================
-- Migration: parent_lead_id + activity_logs melhorado
-- Roda em produção (Railway) e local
-- =============================================================

-- 1. Vinculo entre leads (lead retornou → novo card com referência ao antigo)
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS parent_lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL;

-- Index para navegação rápida (filho → pai, pai → filhos)
CREATE INDEX IF NOT EXISTS idx_leads_parent_lead_id ON leads(parent_lead_id);

-- 2. Garantir que activity_logs existe com campos úteis
CREATE TABLE IF NOT EXISTS activity_logs (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    lead_id     INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    action      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id   INTEGER,
    old_value   JSONB,
    new_value   JSONB,
    ip_address  VARCHAR(45),
    user_agent  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_lead_id   ON activity_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action    ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created   ON activity_logs(created_at DESC);

-- 3. Verificar se tabela já tem colunas necessárias (não quebra se já existir)
DO $$
BEGIN
    -- Adiciona ip_address se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'activity_logs' AND column_name = 'ip_address'
    ) THEN
        ALTER TABLE activity_logs ADD COLUMN ip_address VARCHAR(45);
    END IF;

    -- Adiciona user_agent se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'activity_logs' AND column_name = 'user_agent'
    ) THEN
        ALTER TABLE activity_logs ADD COLUMN user_agent TEXT;
    END IF;
END $$;
