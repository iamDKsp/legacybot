-- Migration: Add ai_error_logs table
-- Purpose: To store errors caught by the Sofia AI processing for later debugging via the Admin panel.

CREATE TABLE IF NOT EXISTS ai_error_logs (
    id SERIAL PRIMARY KEY,
    lead_id INT REFERENCES leads(id) ON DELETE SET NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    payload JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
