-- ============================================================
-- MIGRATION: Add extracted_text column to knowledge_files
-- Stores text content parsed from PDF/DOCX/TXT uploads
-- Run ONCE against the 'legacy' database.
-- ============================================================

USE legacy;

ALTER TABLE knowledge_files
    ADD COLUMN IF NOT EXISTS extracted_text LONGTEXT DEFAULT NULL
    COMMENT 'Text extracted from the uploaded file for AI context injection';

ALTER TABLE knowledge_files
    ADD COLUMN IF NOT EXISTS file_type VARCHAR(20) DEFAULT NULL
    COMMENT 'MIME type or extension: pdf, docx, txt';

SELECT 'migrate_knowledge_text.sql executado com sucesso.' AS status;
