-- ============================================================
-- LEGACY CRM — SEED PostgreSQL
-- Executar APÓS schema.pg.sql
-- ============================================================

-- Funnels
INSERT INTO funnels (name, slug, color, description, is_active, display_order) VALUES
('Trabalhista',       'trabalhista',       '#C89B3C', 'Direito trabalhista',         TRUE, 1),
('Cliente Negativado','negativado',        '#3C89C8', 'Negativação indevida',        TRUE, 2),
('Golpe Cibernético', 'golpe-cibernetico', '#C83C3C', 'Golpes cibernéticos',         TRUE, 3),
('Golpe do Pix',      'golpe-pix',         '#8B3CC8', 'Golpes via Pix',              TRUE, 4),
('Geral',             'geral',             '#3CC87A', 'Funil geral de atendimento',  TRUE, 5)
ON CONFLICT (slug) DO NOTHING;

-- Stages
INSERT INTO stages (name, slug, display_order, color) VALUES
('Recebido',        'recebido',       1, '#6B7280'),
('Abordagem',       'abordagem',      2, '#3B82F6'),
('Coleta de Info',  'coleta_info',    3, '#F59E0B'),
('Documentação',    'documentacao',   4, '#8B5CF6'),
('Assinatura',      'assinatura',     5, '#EC4899'),
('Análise e Espera','analise_espera', 6, '#F97316'),
('Finalizado',      'finalizado',     7, '#10B981')
ON CONFLICT (slug) DO NOTHING;

-- Admin user padrão (senha: admin123 — TROCAR EM PRODUÇÃO)
-- bcrypt hash de 'admin123' com salt 10
INSERT INTO users (name, email, password_hash, role, is_active) VALUES
('Administrador', 'admin@legacy.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', TRUE)
ON CONFLICT (email) DO NOTHING;
