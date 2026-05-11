-- ============================================================
-- MIGRATION: migrate_personal_fields.sql
-- Adds personal/family fields extracted from identity documents (RG/CNH)
-- Safe to run multiple times (IF NOT EXISTS via DO block)
-- ============================================================

DO $$
BEGIN
    -- mother: nome da mãe extraído do RG
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'mother'
    ) THEN
        ALTER TABLE leads ADD COLUMN mother VARCHAR(255) DEFAULT NULL;
        RAISE NOTICE 'Column mother added to leads.';
    ELSE
        RAISE NOTICE 'Column mother already exists, skipping.';
    END IF;

    -- father: nome do pai extraído do RG
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'father'
    ) THEN
        ALTER TABLE leads ADD COLUMN father VARCHAR(255) DEFAULT NULL;
        RAISE NOTICE 'Column father added to leads.';
    ELSE
        RAISE NOTICE 'Column father already exists, skipping.';
    END IF;
END $$;
