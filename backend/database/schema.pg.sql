-- ============================================================
-- LEGACY CRM — SCHEMA PostgreSQL (Railway)
-- Executar ANTES do primeiro startup do backend
-- ============================================================

-- Função de updated_at reutilizada por todos os triggers
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  DEFAULT 'assessor' CHECK (role IN ('admin','assessor')),
    avatar_url    VARCHAR(500) DEFAULT NULL,
    is_active     BOOLEAN      DEFAULT TRUE,
    created_at    TIMESTAMP    DEFAULT NOW(),
    updated_at    TIMESTAMP    DEFAULT NOW()
);
CREATE TRIGGER trg_users_upd BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 2. FUNNELS
CREATE TABLE IF NOT EXISTS funnels (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    slug          VARCHAR(100) NOT NULL UNIQUE,
    color         VARCHAR(50)  DEFAULT '#C89B3C',
    description   TEXT,
    is_active     BOOLEAN      DEFAULT TRUE,
    display_order INTEGER      DEFAULT 0,
    created_at    TIMESTAMP    DEFAULT NOW()
);

-- 3. STAGES
CREATE TABLE IF NOT EXISTS stages (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    slug          VARCHAR(100) NOT NULL UNIQUE,
    display_order INTEGER      DEFAULT 0,
    color         VARCHAR(50)  DEFAULT NULL,
    created_at    TIMESTAMP    DEFAULT NOW()
);

-- 4. LEADS
CREATE TABLE IF NOT EXISTS leads (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    phone           VARCHAR(20)  NOT NULL,
    email           VARCHAR(255) DEFAULT NULL,
    cpf             VARCHAR(14)  DEFAULT NULL,
    origin          VARCHAR(20)  DEFAULT 'whatsapp' CHECK (origin IN ('whatsapp','manual','instagram','site')),
    funnel_id       INTEGER      NOT NULL REFERENCES funnels(id) ON DELETE RESTRICT,
    stage_id        INTEGER      NOT NULL REFERENCES stages(id)  ON DELETE RESTRICT,
    assigned_to     INTEGER      DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
    status          VARCHAR(20)  DEFAULT 'active' CHECK (status IN ('active','approved','rejected','archived')),
    description     TEXT         DEFAULT NULL,
    verdict_notes   TEXT         DEFAULT NULL,
    whatsapp_id     VARCHAR(100) DEFAULT NULL UNIQUE,
    bot_active      BOOLEAN      DEFAULT TRUE,
    bot_session_id  VARCHAR(100) DEFAULT NULL,
    bot_stage       VARCHAR(50)  DEFAULT 'reception',
    bot_last_seen   TIMESTAMP    DEFAULT NULL,
    address         VARCHAR(255) DEFAULT NULL,
    city            VARCHAR(100) DEFAULT NULL,
    state           CHAR(2)      DEFAULT NULL,
    rg              VARCHAR(30)  DEFAULT NULL,
    marital_status  VARCHAR(20)  DEFAULT NULL,
    nationality     VARCHAR(50)  DEFAULT 'brasileiro(a)',
    birthdate       DATE         DEFAULT NULL,
    gender          VARCHAR(20)  DEFAULT NULL,
    created_at      TIMESTAMP    DEFAULT NOW(),
    updated_at      TIMESTAMP    DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_phone       ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_funnel      ON leads(funnel_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage       ON leads(stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_status      ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_id ON leads(whatsapp_id);
CREATE TRIGGER trg_leads_upd BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 5. CONVERSATIONS
CREATE TABLE IF NOT EXISTS conversations (
    id               SERIAL PRIMARY KEY,
    lead_id          INTEGER     NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    whatsapp_chat_id VARCHAR(100) NOT NULL,
    last_message_at  TIMESTAMP   DEFAULT NOW(),
    unread_count     INTEGER     DEFAULT 0,
    status           VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
    channel          VARCHAR(20) DEFAULT 'whatsapp',
    created_at       TIMESTAMP   DEFAULT NOW(),
    updated_at       TIMESTAMP   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_lead     ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conv_whatsapp ON conversations(whatsapp_chat_id);
CREATE TRIGGER trg_conversations_upd BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 6. MESSAGES
CREATE TABLE IF NOT EXISTS messages (
    id                   SERIAL PRIMARY KEY,
    conversation_id      INTEGER     NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    lead_id              INTEGER     NOT NULL REFERENCES leads(id)          ON DELETE CASCADE,
    content              TEXT        NOT NULL,
    media_url            VARCHAR(500) DEFAULT NULL,
    media_type           VARCHAR(20)  DEFAULT NULL CHECK (media_type IS NULL OR media_type IN ('image','video','audio','document')),
    direction            VARCHAR(20)  NOT NULL CHECK (direction IN ('inbound','outbound')),
    sender               VARCHAR(20)  DEFAULT 'lead' CHECK (sender IN ('lead','bot','assessor')),
    sender_user_id       INTEGER      DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
    whatsapp_message_id  VARCHAR(100) DEFAULT NULL UNIQUE,
    is_read              BOOLEAN      DEFAULT FALSE,
    image_url            VARCHAR(500) DEFAULT NULL,
    sent_at              TIMESTAMP    DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_msg_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_msg_sent_at      ON messages(sent_at);

-- 7. TASKS
CREATE TABLE IF NOT EXISTS tasks (
    id           SERIAL PRIMARY KEY,
    lead_id      INTEGER     NOT NULL REFERENCES leads(id)  ON DELETE CASCADE,
    created_by   INTEGER     NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
    assigned_to  INTEGER     DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
    title        VARCHAR(255) NOT NULL,
    description  TEXT         DEFAULT NULL,
    category     VARCHAR(20)  DEFAULT 'outro' CHECK (category IN ('ligacao','documento','reuniao','prazo','outro')),
    priority     VARCHAR(10)  DEFAULT 'media' CHECK (priority IN ('alta','media','baixa')),
    status       VARCHAR(20)  DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluida')),
    due_date     DATE         DEFAULT NULL,
    completed_at TIMESTAMP    DEFAULT NULL,
    created_at   TIMESTAMP    DEFAULT NOW(),
    updated_at   TIMESTAMP    DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_lead     ON tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE TRIGGER trg_tasks_upd BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 8. DOCUMENTS
CREATE TABLE IF NOT EXISTS documents (
    id           SERIAL PRIMARY KEY,
    lead_id      INTEGER     NOT NULL REFERENCES leads(id)  ON DELETE CASCADE,
    uploaded_by  INTEGER     DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
    name         VARCHAR(255) NOT NULL,
    file_type    VARCHAR(50)  DEFAULT NULL,
    file_url     VARCHAR(500) DEFAULT NULL,
    file_path    VARCHAR(500) DEFAULT NULL,
    file_size_kb INTEGER      DEFAULT NULL,
    status       VARCHAR(20)  DEFAULT 'pendente' CHECK (status IN ('pendente','recebido','aprovado','rejeitado')),
    notes        TEXT         DEFAULT NULL,
    created_at   TIMESTAMP    DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docs_lead ON documents(lead_id);

-- 9. NOTES
CREATE TABLE IF NOT EXISTS notes (
    id              SERIAL PRIMARY KEY,
    lead_id         INTEGER    NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    author_type     VARCHAR(10) DEFAULT 'user' CHECK (author_type IN ('user','bot')),
    author_user_id  INTEGER    DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
    content         TEXT       NOT NULL,
    created_at      TIMESTAMP  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notes_lead ON notes(lead_id);

-- 10. BOT_SESSIONS
CREATE TABLE IF NOT EXISTS bot_sessions (
    id             SERIAL PRIMARY KEY,
    lead_id        INTEGER      NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    session_token  VARCHAR(100) NOT NULL UNIQUE,
    step           VARCHAR(50)  DEFAULT 'reception',
    collected_data JSONB        DEFAULT NULL,
    ai_context     JSONB        DEFAULT NULL,
    is_active      BOOLEAN      DEFAULT TRUE,
    created_at     TIMESTAMP    DEFAULT NOW(),
    updated_at     TIMESTAMP    DEFAULT NOW()
);
CREATE TRIGGER trg_bot_sessions_upd BEFORE UPDATE ON bot_sessions FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 11. ACTIVITY_LOG
CREATE TABLE IF NOT EXISTS activity_log (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER     DEFAULT NULL REFERENCES users(id)  ON DELETE SET NULL,
    lead_id     INTEGER     DEFAULT NULL REFERENCES leads(id)  ON DELETE SET NULL,
    action      VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50)  DEFAULT NULL,
    entity_id   INTEGER      DEFAULT NULL,
    old_value   JSONB        DEFAULT NULL,
    new_value   JSONB        DEFAULT NULL,
    ip_address  VARCHAR(45)  DEFAULT NULL,
    created_at  TIMESTAMP    DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_log_user    ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_log_lead    ON activity_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_log_created ON activity_log(created_at);
