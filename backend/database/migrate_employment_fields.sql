-- ============================================================
-- MIGRATION: migrate_employment_fields.sql
-- Adds employment_status (select) and occupation_detail (free text)
-- to the leads table for PHC document generation.
-- Safe to run multiple times (IF NOT EXISTS)
-- ============================================================

DO $$
BEGIN
    -- employment_status: situação de emprego (select pré-definido)
    -- Valores: empregado, desempregado, autonomo, mei, aposentado,
    --          funcionario_publico, estudante, outro
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'employment_status'
    ) THEN
        ALTER TABLE leads ADD COLUMN employment_status VARCHAR(100) DEFAULT NULL;
        RAISE NOTICE 'Column employment_status added to leads.';
    ELSE
        RAISE NOTICE 'Column employment_status already exists, skipping.';
    END IF;

    -- occupation_detail: profissão / cargo específico (texto livre)
    -- Ex: "Motorista de aplicativo", "Vendedor(a)", "Professora"
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'occupation_detail'
    ) THEN
        ALTER TABLE leads ADD COLUMN occupation_detail VARCHAR(255) DEFAULT NULL;
        RAISE NOTICE 'Column occupation_detail added to leads.';
    ELSE
        RAISE NOTICE 'Column occupation_detail already exists, skipping.';
    END IF;
END $$;
