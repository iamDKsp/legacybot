-- ============================================================
-- LEGACY CRM — MIGRATION: Document Validation Fields
-- Adds doc_type and validation_result columns to the documents table
-- Run this script once against the 'legacy' database
-- ============================================================

USE legacy;

-- Add doc_type: stores the AI-identified document category
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS doc_type VARCHAR(50) DEFAULT NULL
        COMMENT 'AI-identified document type: RG, CNH, Holerite, etc.';

-- Add validation_result: stores the full Gemini analysis JSON
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS validation_result JSON DEFAULT NULL
        COMMENT 'Full Gemini Vision analysis result: {isLegible, docType, description, extractedText, issues}';

-- Index for faster queries by doc_type
ALTER TABLE documents
    ADD INDEX IF NOT EXISTS idx_docs_type (doc_type);

-- Index for faster queries by status
ALTER TABLE documents
    ADD INDEX IF NOT EXISTS idx_docs_status (status);
