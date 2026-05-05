/**
 * auto-migrate.ts  — PostgreSQL Edition
 * Roda migrações de schema automaticamente no startup do servidor.
 * Idempotente: seguro de executar múltiplas vezes.
 *
 * Diferenças chave vs MySQL:
 *  - SERIAL / BIGSERIAL em vez de INT AUTO_INCREMENT
 *  - BOOLEAN em vez de TINYINT(1)
 *  - TEXT em vez de LONGTEXT
 *  - CREATE INDEX IF NOT EXISTS em vez de INDEX inline no CREATE TABLE
 *  - ON CONFLICT DO NOTHING em vez de INSERT IGNORE
 *  - ALTER COLUMN ... TYPE em vez de MODIFY COLUMN
 *  - Sem ENGINE=InnoDB / CHARSET / COLLATE
 */

import { db } from './database';

// ── Helper: cria função e trigger de updated_at para uma tabela ──────────────
async function ensureUpdatedAtTrigger(table: string): Promise<void> {
    // Função compartilhada — criada uma vez e reutilizada por todas as tabelas
    await db.raw(`
        CREATE OR REPLACE FUNCTION fn_set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    `);

    // Trigger por tabela — idempotente via DROP IF EXISTS + CREATE
    await db.raw(`
        DROP TRIGGER IF EXISTS trg_${table}_updated_at ON ${table};
        CREATE TRIGGER trg_${table}_updated_at
            BEFORE UPDATE ON ${table}
            FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()
    `);
}

export async function runAutoMigrations(): Promise<void> {
    console.log('[DB] Running auto-migrations (PostgreSQL)...');

    try {

        // ── 1. conversations: canal + updated_at ────────────────────────────
        await db.raw(`
            ALTER TABLE conversations
                ADD COLUMN IF NOT EXISTS channel     VARCHAR(20) DEFAULT 'whatsapp',
                ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMP  DEFAULT NOW()
        `).catch(() => {/* colunas já existem */});

        // ── 2. messages: image_url ───────────────────────────────────────────
        await db.raw(`
            ALTER TABLE messages
                ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) DEFAULT NULL
        `).catch(() => {});

        // ── 3. leads: bot_stage + bot_last_seen ─────────────────────────────
        await db.raw(`
            ALTER TABLE leads
                ADD COLUMN IF NOT EXISTS bot_stage    VARCHAR(50)  DEFAULT 'reception',
                ADD COLUMN IF NOT EXISTS bot_last_seen TIMESTAMP   DEFAULT NULL
        `).catch(() => {});

        // ── 4. bot_sessions: step → VARCHAR (PG não tem MODIFY COLUMN) ──────
        await db.raw(`
            ALTER TABLE bot_sessions
                ALTER COLUMN step TYPE VARCHAR(50),
                ALTER COLUMN step SET DEFAULT 'reception'
        `).catch(() => {/* tabela pode não existir ainda */});

        // ── 5. bot_memory ────────────────────────────────────────────────────
        await db.raw(`
            CREATE TABLE IF NOT EXISTS bot_memory (
                id                 SERIAL PRIMARY KEY,
                category           VARCHAR(50)  NOT NULL
                                   CHECK (category IN ('objection','question','success_pattern','error_pattern','case_type_signal')),
                trigger_pattern    TEXT         NOT NULL,
                successful_response TEXT        DEFAULT NULL,
                legal_area         VARCHAR(20)  DEFAULT NULL
                                   CHECK (legal_area IS NULL OR legal_area IN ('trabalhista','consumidor','cibernetico','pix')),
                lead_converted     BOOLEAN      DEFAULT FALSE,
                usage_count        INTEGER      DEFAULT 1,
                confidence_score   SMALLINT     DEFAULT 50,
                is_active          BOOLEAN      DEFAULT TRUE,
                last_used_at       TIMESTAMP    DEFAULT NOW(),
                created_at         TIMESTAMP    DEFAULT NOW()
            )
        `);
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_memory_category ON bot_memory(category)`);
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_memory_area      ON bot_memory(legal_area)`);
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_memory_usage     ON bot_memory(usage_count DESC)`);
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_memory_active    ON bot_memory(is_active)`);

        // ── 6. bot_handoffs ──────────────────────────────────────────────────
        await db.raw(`
            CREATE TABLE IF NOT EXISTS bot_handoffs (
                id                  SERIAL PRIMARY KEY,
                lead_id             INTEGER     NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
                reason              VARCHAR(30) DEFAULT 'documents_received'
                                    CHECK (reason IN ('documents_received','client_request','assessor_override','error')),
                bot_stage_at_handoff VARCHAR(50) DEFAULT NULL,
                summary             TEXT        DEFAULT NULL,
                notified_at         TIMESTAMP   DEFAULT NOW(),
                acknowledged_by     INTEGER     DEFAULT NULL,
                acknowledged_at     TIMESTAMP   DEFAULT NULL
            )
        `);
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_handoff_lead ON bot_handoffs(lead_id)`);
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_handoff_ack  ON bot_handoffs(acknowledged_at)`);

        // ── 7. bot_prompts ───────────────────────────────────────────────────
        await db.raw(`
            CREATE TABLE IF NOT EXISTS bot_prompts (
                id          SERIAL PRIMARY KEY,
                funnel_slug VARCHAR(100) NOT NULL UNIQUE,
                content     TEXT         NOT NULL,
                updated_at  TIMESTAMP    DEFAULT NOW()
            )
        `);
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_prompts_funnel ON bot_prompts(funnel_slug)`);
        await ensureUpdatedAtTrigger('bot_prompts').catch(() => {});

        // ── 8. knowledge_files ───────────────────────────────────────────────
        await db.raw(`
            CREATE TABLE IF NOT EXISTS knowledge_files (
                id             SERIAL PRIMARY KEY,
                funnel_slug    VARCHAR(100) NOT NULL,
                original_name  VARCHAR(255) NOT NULL,
                file_size_kb   INTEGER      DEFAULT NULL,
                file_type      VARCHAR(50)  DEFAULT NULL,
                extracted_text TEXT         DEFAULT NULL,
                file_data      BYTEA        DEFAULT NULL,
                created_at     TIMESTAMP    DEFAULT NOW()
            )
        `);
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_knowledge_funnel ON knowledge_files(funnel_slug)`);

        // Colunas adicionais caso tabela já existia sem elas
        await db.raw(`ALTER TABLE knowledge_files ADD COLUMN IF NOT EXISTS extracted_text TEXT   DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE knowledge_files ADD COLUMN IF NOT EXISTS file_type      VARCHAR(50) DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE knowledge_files ADD COLUMN IF NOT EXISTS file_data      BYTEA  DEFAULT NULL`).catch(() => {});

        // ── 9. funnel_stages ─────────────────────────────────────────────────
        await db.raw(`
            CREATE TABLE IF NOT EXISTS funnel_stages (
                id            SERIAL PRIMARY KEY,
                funnel_id     INTEGER NOT NULL REFERENCES funnels(id) ON DELETE CASCADE,
                stage_id      INTEGER NOT NULL REFERENCES stages(id)  ON DELETE CASCADE,
                display_order INTEGER DEFAULT 0,
                is_auto       BOOLEAN DEFAULT FALSE,
                bot_stage_trigger VARCHAR(50) DEFAULT NULL,
                UNIQUE (funnel_id, stage_id)
            )
        `);

        // ── 9a. Seed: garantir que 'Analise e Espera' existe ─────────────────
        await db.raw(`
            INSERT INTO stages (name, slug, display_order)
            VALUES ('Analise e Espera', 'analise_espera', 6)
            ON CONFLICT (slug) DO NOTHING
        `);

        // ── 9b. Rebuild funnel_stages se estiver vazio ou com dados obsoletos ─
        const procStage = await db('stages').where({ slug: 'procuracao' }).first() as { id: number } | undefined;
        const hasProcInFunnel = procStage
            ? await db('funnel_stages').where({ stage_id: procStage.id }).first()
            : null;

        const fsCount = await db('funnel_stages').count('id as c').first();
        const funelStageCount = parseInt(String((fsCount as { c: string }).c || '0'), 10);

        if (funelStageCount === 0 || hasProcInFunnel) {
            if (hasProcInFunnel) {
                console.log('[DB] 🔄 Detectado stage obsoleto (procuracao) — reconstruindo funnel_stages...');
                await db('funnel_stages').del();
            }

            const funnelDefs: Record<string, Array<{ slug: string; ord: number; auto: boolean; trig: string | null }>> = {
                geral: [
                    { slug: 'recebido',       ord: 1, auto: true,  trig: 'reception'   },
                    { slug: 'abordagem',      ord: 2, auto: true,  trig: 'approach'    },
                    { slug: 'documentacao',   ord: 3, auto: true,  trig: 'doc_request' },
                    { slug: 'analise_espera', ord: 4, auto: false, trig: null          },
                    { slug: 'finalizado',     ord: 5, auto: false, trig: null          },
                ],
                trabalhista: [
                    { slug: 'recebido',       ord: 1, auto: true,  trig: 'reception'   },
                    { slug: 'abordagem',      ord: 2, auto: true,  trig: 'approach'    },
                    { slug: 'documentacao',   ord: 3, auto: true,  trig: 'doc_request' },
                    { slug: 'assinatura',     ord: 4, auto: false, trig: null          },
                    { slug: 'analise_espera', ord: 5, auto: false, trig: null          },
                    { slug: 'finalizado',     ord: 6, auto: false, trig: null          },
                ],
                negativado: [
                    { slug: 'recebido',       ord: 1, auto: true,  trig: 'reception'   },
                    { slug: 'abordagem',      ord: 2, auto: true,  trig: 'approach'    },
                    { slug: 'documentacao',   ord: 3, auto: true,  trig: 'doc_request' },
                    { slug: 'assinatura',     ord: 4, auto: false, trig: null          },
                    { slug: 'analise_espera', ord: 5, auto: false, trig: null          },
                    { slug: 'finalizado',     ord: 6, auto: false, trig: null          },
                ],
                'golpe-cibernetico': [
                    { slug: 'recebido',       ord: 1, auto: true,  trig: 'reception'   },
                    { slug: 'abordagem',      ord: 2, auto: true,  trig: 'approach'    },
                    { slug: 'documentacao',   ord: 3, auto: true,  trig: 'doc_request' },
                    { slug: 'assinatura',     ord: 4, auto: false, trig: null          },
                    { slug: 'analise_espera', ord: 5, auto: false, trig: null          },
                    { slug: 'finalizado',     ord: 6, auto: false, trig: null          },
                ],
                'golpe-pix': [
                    { slug: 'recebido',       ord: 1, auto: true,  trig: 'reception'       },
                    { slug: 'abordagem',      ord: 2, auto: true,  trig: 'approach'        },
                    { slug: 'coleta_info',    ord: 3, auto: true,  trig: 'info_collection' },
                    { slug: 'documentacao',   ord: 4, auto: true,  trig: 'doc_request'     },
                    { slug: 'assinatura',     ord: 5, auto: false, trig: null              },
                    { slug: 'analise_espera', ord: 6, auto: false, trig: null              },
                    { slug: 'finalizado',     ord: 7, auto: false, trig: null              },
                ],
            };

            for (const [funnelSlug, stageDefs] of Object.entries(funnelDefs)) {
                const funnel = await db('funnels').where({ slug: funnelSlug }).first() as { id: number } | undefined;
                if (!funnel) continue;

                for (const def of stageDefs) {
                    const stage = await db('stages').where({ slug: def.slug }).first() as { id: number } | undefined;
                    if (!stage) continue;

                    await db('funnel_stages')
                        .insert({
                            funnel_id:         funnel.id,
                            stage_id:          stage.id,
                            display_order:     def.ord,
                            is_auto:           def.auto,
                            bot_stage_trigger: def.trig,
                        })
                        .onConflict(['funnel_id', 'stage_id'])
                        .ignore()
                        .catch(() => {/* duplicata — seguro ignorar */});
                }
            }
            console.log('[DB] ✅ funnel_stages populado');
        }

        // ── 9c. Garante funnel_stages para 'geral' se ainda vazio ────────────
        const geralFunnel = await db('funnels').where({ slug: 'geral' }).first() as { id: number } | undefined;
        if (geralFunnel) {
            const gCount = await db('funnel_stages').where({ funnel_id: geralFunnel.id }).count('id as c').first();
            const geralCount = parseInt(String((gCount as { c: string }).c || '0'), 10);
            if (geralCount === 0) {
                console.log('[DB] ➕ Seeding funnel_stages para funil "geral"...');
                const geralDefs = [
                    { slug: 'recebido', ord: 1, auto: true, trig: 'reception' },
                    { slug: 'abordagem', ord: 2, auto: true, trig: 'approach' },
                    { slug: 'documentacao', ord: 3, auto: true, trig: 'doc_request' },
                    { slug: 'analise_espera', ord: 4, auto: false, trig: null },
                    { slug: 'finalizado', ord: 5, auto: false, trig: null },
                ];
                for (const def of geralDefs) {
                    const stage = await db('stages').where({ slug: def.slug }).first() as { id: number } | undefined;
                    if (!stage) continue;
                    await db('funnel_stages')
                        .insert({ funnel_id: geralFunnel.id, stage_id: stage.id, display_order: def.ord, is_auto: def.auto, bot_stage_trigger: def.trig })
                        .onConflict(['funnel_id', 'stage_id']).ignore()
                        .catch(() => {});
                }
                console.log('[DB] ✅ funnel_stages "geral" populado');
            }
        }

        // ── 10. Seed inicial bot_memory (se vazio) ────────────────────────────
        const count = await db('bot_memory').count('id as c').first();
        const memoryCount = parseInt(String((count as { c: string }).c || '0'), 10);

        if (memoryCount === 0) {
            await db('bot_memory').insert([
                {
                    category: 'objection',
                    trigger_pattern: 'é golpe|piramide|desconfio|não confio|tenho medo de golpe',
                    successful_response: 'Eu entendo sua insegurança! Mas te garanto: nosso serviço é sério. Se fosse um golpista, estaria te cobrando R$100 agora. Trabalhamos só com êxito — sem ganhar, você não paga NADA 🙏',
                    legal_area: null, lead_converted: true, confidence_score: 90,
                },
                {
                    category: 'question',
                    trigger_pattern: 'quanto custa|tem taxa|cobra quanto|valor|honorário|é de graça',
                    successful_response: 'Não cobramos nada adiantado. Trabalhamos em cima de resultado: se ganharmos, você paga os honorários. Caso contrário, você não paga NADA 👍',
                    legal_area: null, lead_converted: true, confidence_score: 95,
                },
                {
                    category: 'question',
                    trigger_pattern: 'quanto tempo|quando fica pronto|prazo|demora quanto|quando termina',
                    successful_response: 'O prazo depende do juiz responsável pelo seu caso. Assim que tivermos atualizações, entraremos em contato direto! 🙏',
                    legal_area: null, lead_converted: true, confidence_score: 85,
                },
                {
                    category: 'case_type_signal',
                    trigger_pattern: 'demitido|demissão|mandado embora|aviso prévio|horas extras|fgts|assédio|carteira de trabalho',
                    successful_response: null, legal_area: 'trabalhista', lead_converted: false, confidence_score: 90,
                },
                {
                    category: 'case_type_signal',
                    trigger_pattern: 'copasa|cemig|cobrança indevida|negativado|serasa|spc|faculdade|curso',
                    successful_response: null, legal_area: 'consumidor', lead_converted: false, confidence_score: 88,
                },
                {
                    category: 'case_type_signal',
                    trigger_pattern: 'whatsapp hackeado|conta invadida|clonaram|dados roubados|phishing|fraude online',
                    successful_response: null, legal_area: 'cibernetico', lead_converted: false, confidence_score: 92,
                },
                {
                    category: 'case_type_signal',
                    trigger_pattern: 'pix|caí em golpe|fui enganado|falso vendedor|boleto falso|estelionato',
                    successful_response: null, legal_area: 'pix', lead_converted: false, confidence_score: 92,
                },
            ]);
            console.log('[DB] ✅ Seed de bot_memory (7 padrões)');
        }

        // ── PHC-1. phc_lawyers ────────────────────────────────────────────────
        await db.raw(`
            CREATE TABLE IF NOT EXISTS phc_lawyers (
                id              SERIAL PRIMARY KEY,
                name            VARCHAR(255) NOT NULL,
                oab             VARCHAR(50)  NOT NULL,
                cpf             VARCHAR(20)  DEFAULT NULL,
                email           VARCHAR(150) DEFAULT NULL,
                phone           VARCHAR(30)  DEFAULT NULL,
                address         VARCHAR(255) DEFAULT NULL,
                city            VARCHAR(100) DEFAULT NULL,
                state           CHAR(2)      DEFAULT NULL,
                additional_info TEXT         DEFAULT NULL,
                created_at      TIMESTAMP    DEFAULT NOW(),
                updated_at      TIMESTAMP    DEFAULT NOW()
            )
        `);
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_lawyers_name ON phc_lawyers(name)`);
        await ensureUpdatedAtTrigger('phc_lawyers').catch(() => {});

        // ── PHC-2. phc_documents ─────────────────────────────────────────────
        await db.raw(`
            CREATE TABLE IF NOT EXISTS phc_documents (
                id          SERIAL PRIMARY KEY,
                lead_id     INTEGER     NOT NULL REFERENCES leads(id)       ON DELETE CASCADE,
                lawyer_id   INTEGER     NOT NULL REFERENCES phc_lawyers(id) ON DELETE RESTRICT,
                doc_type    VARCHAR(30) NOT NULL
                            CHECK (doc_type IN ('procuracao','declaracao_hipo','contrato')),
                funnel_slug VARCHAR(100) DEFAULT NULL,
                status      VARCHAR(20)  DEFAULT 'rascunho'
                            CHECK (status IN ('rascunho','salvo','baixado')),
                notes       TEXT         DEFAULT NULL,
                file_path   VARCHAR(500) DEFAULT NULL,
                created_at  TIMESTAMP    DEFAULT NOW(),
                updated_at  TIMESTAMP    DEFAULT NOW()
            )
        `);
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_phc_lead   ON phc_documents(lead_id)`);
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_phc_lawyer ON phc_documents(lawyer_id)`);
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_phc_funnel ON phc_documents(funnel_slug)`);
        await ensureUpdatedAtTrigger('phc_documents').catch(() => {});

        // ── DOC-1. documents: file_path + file_url ───────────────────────────
        await db.raw(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_url  VARCHAR(500) DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_path VARCHAR(500) DEFAULT NULL`).catch(() => {});

        // ── LEAD-PHC. Dados jurídicos no lead ────────────────────────────────
        await db.raw(`
            ALTER TABLE leads
                ADD COLUMN IF NOT EXISTS address        VARCHAR(255) DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS city           VARCHAR(100) DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS state          CHAR(2)      DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS rg             VARCHAR(30)  DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS marital_status VARCHAR(20)  DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS nationality    VARCHAR(50)  DEFAULT 'brasileiro(a)',
                ADD COLUMN IF NOT EXISTS birthdate      DATE         DEFAULT NULL
        `).catch(() => {});

        // ── PHC-3. phc_documents: file_path (caso tabela já existia) ─────────
        await db.raw(`ALTER TABLE phc_documents ADD COLUMN IF NOT EXISTS file_path VARCHAR(500) DEFAULT NULL`).catch(() => {});

        console.log('[DB] ✅ Auto-migrations concluídas (PostgreSQL)');

    } catch (err) {
        console.error('[DB] ❌ Migration error (non-fatal):', err);
        // Não bloqueia o startup do servidor
    }
}
