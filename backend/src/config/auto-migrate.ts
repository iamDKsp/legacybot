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

        // ── 2. messages: image_url + audio_url ──────────────────────────────
        await db.raw(`
            ALTER TABLE messages
                ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) DEFAULT NULL
        `).catch(() => {});

        await db.raw(`
            ALTER TABLE messages
                ADD COLUMN IF NOT EXISTS audio_url VARCHAR(500) DEFAULT NULL
        `).catch(() => {});

        // ── 3. leads: bot_stage + bot_last_seen + case_summary ──────────────
        await db.raw(`
            ALTER TABLE leads
                ADD COLUMN IF NOT EXISTS bot_stage    VARCHAR(50)  DEFAULT 'reception',
                ADD COLUMN IF NOT EXISTS bot_last_seen TIMESTAMP   DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS case_summary TEXT         DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS gender       CHAR(1)      DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS occupation   VARCHAR(255) DEFAULT NULL
        `).catch(() => {});

        // ── 3b. documents: file_data BYTEA (armazena binário no DB para persistência em Railway) ──
        await db.raw(`
            ALTER TABLE documents
                ADD COLUMN IF NOT EXISTS file_data BYTEA DEFAULT NULL
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

        // ── 9a. Seed: garantir stages essenciais existem ────────────────────────
        await db.raw(`
            INSERT INTO stages (name, slug, display_order)
            VALUES ('Analise e Espera', 'analise_espera', 6)
            ON CONFLICT (slug) DO NOTHING
        `);
        // Pré-Análise: nova etapa exclusiva do funil Negativado
        await db.raw(`
            INSERT INTO stages (name, slug, display_order)
            VALUES ('Pré-Análise', 'pre_analise', 3)
            ON CONFLICT (slug) DO NOTHING
        `);
        // Garantir que existe a etapa 'abordagem' para o funil Geral (triagem)
        await db.raw(`
            INSERT INTO stages (name, slug, display_order)
            VALUES ('Abordagem', 'abordagem', 2)
            ON CONFLICT (slug) DO NOTHING
        `);
        console.log('[DB] ✅ Stages essenciais garantidos (analise_espera, pre_analise, abordagem)');

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
                    // TRIAGEM: recebido (escuta) + abordagem (identificação de área)
                    { slug: 'recebido',  ord: 1, auto: true,  trig: 'reception' },
                    { slug: 'abordagem', ord: 2, auto: true,  trig: 'approach'  },
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
                    { slug: 'pre_analise',    ord: 3, auto: true,  trig: 'pre_analise' }, // NEW
                    { slug: 'documentacao',   ord: 4, auto: true,  trig: 'doc_request' },
                    { slug: 'assinatura',     ord: 5, auto: false, trig: null          },
                    { slug: 'analise_espera', ord: 6, auto: false, trig: null          },
                    { slug: 'finalizado',     ord: 7, auto: false, trig: null          },
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

            // ── Seed Lawyer: João Paulo Gabriel ───────────────────────
            const jpExists = await db('phc_lawyers').where({ oab: 'OAB/SP nº 243.936' }).first();
            if (!jpExists) {
                console.log('[DB] 👨‍⚖️ Semeando Advogado Padrão (João Paulo Gabriel)...');
                await db('phc_lawyers').insert({
                    name: 'JOÃO PAULO GABRIEL',
                    oab: 'OAB/SP nº 243.936',
                    street: 'Rua Boa Vista',
                    street_number: '865',
                    neighborhood: 'Boa Vista',
                    city: 'São José do Rio Preto',
                    state: 'SP',
                    cep: '15025-010',
                    additional_info: 'brasileiro, casado, advogado',
                    created_at: new Date(),
                    updated_at: new Date()
                });
                console.log('[DB] ✅ Advogado Padrão criado com sucesso!');
            }

        }

        // ── 9c. TRIAGEM: Garante etapa EXCLUSIVA 'geral' (nome GERAL) no funil geral ─
        // NUNCA renomeia o stage 'recebido' — ele é compartilhado com outros funis.
        // A TRIAGEM usa um stage próprio slug='geral' name='GERAL'.
        await db('funnels').where({ slug: 'geral' }).update({ name: 'TRIAGEM' }).catch(() => {});

        // Reverter qualquer renomeação indevida do stage recebido (bug anterior)
        await db('stages').where({ slug: 'recebido' }).update({ name: 'Recebido' }).catch(() => {});

        // Criar stage exclusivo da TRIAGEM se não existir
        await db.raw(`
            INSERT INTO stages (name, slug, display_order)
            VALUES ('GERAL', 'geral', 1)
            ON CONFLICT (slug) DO UPDATE SET name = 'GERAL'
        `).catch(() => {});

        const geralFunnel    = await db('funnels').where({ slug: 'geral' }).first()    as { id: number } | undefined;
        const geralStage     = await db('stages').where({ slug: 'geral' }).first()     as { id: number } | undefined;
        const recebidoStage  = await db('stages').where({ slug: 'recebido' }).first()  as { id: number } | undefined;
        const abordagemStage = await db('stages').where({ slug: 'abordagem' }).first() as { id: number } | undefined;

        if (geralFunnel && geralStage) {
            // Inserir stage 'geral' no funil TRIAGEM (única coluna visível)
            await db('funnel_stages')
                .insert({ funnel_id: geralFunnel.id, stage_id: geralStage.id, display_order: 1, is_auto: true, bot_stage_trigger: 'reception' })
                .onConflict(['funnel_id', 'stage_id']).ignore()
                .catch(() => {});

            // Remover stage 'recebido' do geral (substituído por 'geral')
            if (recebidoStage) {
                // Mover leads que estejam em 'recebido' dentro do geral → 'geral'
                await db('leads')
                    .where({ funnel_id: geralFunnel.id, stage_id: recebidoStage.id })
                    .update({ stage_id: geralStage.id })
                    .catch(() => {});
                await db('funnel_stages')
                    .where({ funnel_id: geralFunnel.id, stage_id: recebidoStage.id })
                    .del()
                    .catch(() => {});
            }

            // Remover 'abordagem' do geral (TRIAGEM só tem 1 coluna)
            if (abordagemStage) {
                await db('leads')
                    .where({ funnel_id: geralFunnel.id, stage_id: abordagemStage.id })
                    .update({ stage_id: geralStage.id })
                    .catch(() => {});
                await db('funnel_stages')
                    .where({ funnel_id: geralFunnel.id, stage_id: abordagemStage.id })
                    .del()
                    .catch(() => {});
            }

            // Limpar qualquer outra coluna que tenha entrado no geral
            await db('funnel_stages')
                .where({ funnel_id: geralFunnel.id })
                .whereNot({ stage_id: geralStage.id })
                .del()
                .catch(() => {});

            console.log('[DB] ✅ TRIAGEM: única etapa GERAL (slug=geral). Recebido global intocado.');
        }


        // ── 9e. Negativado: inserir 'pre_analise' idempotentemente ──────────────
        // Roda SEMPRE (não só quando funnel_stages está vazio)
        const negativadoFunnel = await db('funnels').where({ slug: 'negativado' }).first() as { id: number } | undefined;
        const preAnaliseStage  = await db('stages').where({ slug: 'pre_analise' }).first() as { id: number } | undefined;
        if (negativadoFunnel && preAnaliseStage) {
            await db('funnel_stages')
                .insert({
                    funnel_id:         negativadoFunnel.id,
                    stage_id:          preAnaliseStage.id,
                    display_order:     3,
                    is_auto:           true,
                    bot_stage_trigger: 'pre_analise',
                })
                .onConflict(['funnel_id', 'stage_id']).ignore()
                .catch(() => {});

            // Reajusta display_order das etapas seguintes (documentacao=4, assinatura=5...)
            const docStage = await db('stages').where({ slug: 'documentacao' }).first() as { id: number } | undefined;
            if (docStage) {
                await db('funnel_stages')
                    .where({ funnel_id: negativadoFunnel.id, stage_id: docStage.id })
                    .update({ display_order: 4 })
                    .catch(() => {});
            }
            console.log('[DB] ✅ Negativado: etapa pré-análise inserida/garantida.');
        }

        // ── 9d. Rename all other funnels to CAPS ─────────────────────────────
        const capsNames: Record<string, string> = {
            'trabalhista':       'TRABALHISTA',
            'negativado':        'CLIENTE NEGATIVADO',
            'golpe-cibernetico': 'GOLPE CIBERNÉTICO',
            'golpe-pix':         'GOLPE DO PIX',
        };
        for (const [slug, name] of Object.entries(capsNames)) {
            await db('funnels').where({ slug }).update({ name }).catch(() => {});
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
                id         SERIAL PRIMARY KEY,
                name       VARCHAR(255) NOT NULL,
                oab        VARCHAR(50)  NOT NULL,
                created_at TIMESTAMP    DEFAULT NOW(),
                updated_at TIMESTAMP    DEFAULT NOW()
            )
        `).catch(() => {});
        // Colunas adicionais — idempotente (tabela pode ter sido criada com schema antigo)
        await db.raw(`ALTER TABLE phc_lawyers ADD COLUMN IF NOT EXISTS cpf             VARCHAR(20)  DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE phc_lawyers ADD COLUMN IF NOT EXISTS email           VARCHAR(150) DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE phc_lawyers ADD COLUMN IF NOT EXISTS phone           VARCHAR(30)  DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE phc_lawyers ADD COLUMN IF NOT EXISTS address         VARCHAR(255) DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE phc_lawyers ADD COLUMN IF NOT EXISTS city            VARCHAR(100) DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE phc_lawyers ADD COLUMN IF NOT EXISTS state           CHAR(2)      DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE phc_lawyers ADD COLUMN IF NOT EXISTS additional_info TEXT         DEFAULT NULL`).catch(() => {});
        // Endereço dividido (v2)
        await db.raw(`ALTER TABLE phc_lawyers ADD COLUMN IF NOT EXISTS cep             VARCHAR(9)   DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE phc_lawyers ADD COLUMN IF NOT EXISTS street          VARCHAR(255) DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE phc_lawyers ADD COLUMN IF NOT EXISTS street_number   VARCHAR(20)  DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE phc_lawyers ADD COLUMN IF NOT EXISTS neighborhood    VARCHAR(100) DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE phc_lawyers ADD COLUMN IF NOT EXISTS complement      VARCHAR(100) DEFAULT NULL`).catch(() => {});
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_lawyers_name ON phc_lawyers(name)`).catch(() => {});
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
        `).catch(() => {});
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_phc_lead   ON phc_documents(lead_id)`).catch(() => {});
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_phc_lawyer ON phc_documents(lawyer_id)`).catch(() => {});
        await ensureUpdatedAtTrigger('phc_documents').catch(() => {});
        // Colunas que podem faltar em tabelas antigas (idempotente)
        await db.raw(`ALTER TABLE phc_documents ADD COLUMN IF NOT EXISTS funnel_slug VARCHAR(100) DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE phc_documents ADD COLUMN IF NOT EXISTS notes       TEXT         DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE phc_documents ADD COLUMN IF NOT EXISTS file_path   VARCHAR(500) DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE phc_documents ADD COLUMN IF NOT EXISTS status      VARCHAR(20)  DEFAULT 'rascunho'`).catch(() => {});
        // Recriar constraint de status para garantir que inclui 'baixado'
        await db.raw(`ALTER TABLE phc_documents DROP CONSTRAINT IF EXISTS phc_documents_status_check`).catch(() => {});
        await db.raw(`ALTER TABLE phc_documents ADD CONSTRAINT  phc_documents_status_check CHECK (status IN ('rascunho','salvo','baixado'))`).catch(() => {});
        await db.raw(`ALTER TABLE phc_documents ADD COLUMN IF NOT EXISTS arguments TEXT DEFAULT NULL`).catch(() => {});
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_phc_funnel ON phc_documents(funnel_slug)`).catch(() => {});


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
                ADD COLUMN IF NOT EXISTS birthdate      DATE         DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS gender         CHAR(1)      DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS occupation     VARCHAR(255) DEFAULT NULL
        `).catch(() => {});

        // ── LEAD-FILIATION. Dados de filiação extraídos do RG ────────────────
        await db.raw(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS mother      VARCHAR(255) DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS father      VARCHAR(255) DEFAULT NULL`).catch(() => {});
        // ── LEAD-RG-ISSUER. Órgão emissor do RG ──────────────────────────────
        // DEFAULT NULL para não poluir leads sem documento
        await db.raw(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS org_emissor VARCHAR(20)  DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS uf_emissor  CHAR(2)      DEFAULT NULL`).catch(() => {});
        // ── LEAD-ADDRESS-GRANULAR. Campos de endereço detalhados (via migrate_address_fields.sql) ──
        await db.raw(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS street       VARCHAR(255) DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS number       VARCHAR(20)  DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100) DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS zip_code     VARCHAR(10)  DEFAULT NULL`).catch(() => {});
        // ── LEAD-EMPLOYMENT. Situação de emprego e profissão detalhada ──────
        await db.raw(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS employment_status VARCHAR(100) DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS occupation_detail VARCHAR(255) DEFAULT NULL`).catch(() => {});

        // ── Seed Lawyer: João Paulo Gabriel ───────────────────────
        const jpExists = await db('phc_lawyers').where({ oab: 'OAB/SP nº 243.936' }).first();
        if (!jpExists) {
            console.log('[DB] 👨‍⚖️ Semeando Advogado Padrão (João Paulo Gabriel)...');
            await db('phc_lawyers').insert({
                name: 'JOÃO PAULO GABRIEL',
                oab: 'OAB/SP nº 243.936',
                street: 'Rua Boa Vista',
                street_number: '865',
                neighborhood: 'Boa Vista',
                city: 'São José do Rio Preto',
                state: 'SP',
                cep: '15025-010',
                additional_info: 'brasileiro, casado, advogado',
                created_at: new Date(),
                updated_at: new Date()
            });
            console.log('[DB] ✅ Advogado Padrão criado com sucesso!');
        }

        // ── 11. ai_error_logs (Painel de Erros da Sofia) ─────────────────────
        await db.raw(`
            CREATE TABLE IF NOT EXISTS ai_error_logs (
                id           SERIAL PRIMARY KEY,
                lead_id      INTEGER REFERENCES leads(id) ON DELETE SET NULL,
                error_message TEXT NOT NULL,
                stack_trace  TEXT,
                payload      JSONB,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `).catch(() => {});
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_ai_error_logs_created ON ai_error_logs(created_at DESC)`).catch(() => {});

        // ── 12. leads: parent_lead_id (vínculo com lead anterior arquivado) ────
        await db.raw(`
            ALTER TABLE leads
                ADD COLUMN IF NOT EXISTS parent_lead_id INTEGER DEFAULT NULL
        `).catch(() => {});
        // Adicionar FK separadamente (pode falhar se a referencia ainda não existe — seguro ignorar)
        await db.raw(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE constraint_name = 'leads_parent_lead_id_fkey'
                ) THEN
                    ALTER TABLE leads
                        ADD CONSTRAINT leads_parent_lead_id_fkey
                        FOREIGN KEY (parent_lead_id) REFERENCES leads(id) ON DELETE SET NULL;
                END IF;
            END $$
        `).catch(() => {});
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_leads_parent_lead_id ON leads(parent_lead_id)`).catch(() => {});

        // ── 13. activity_logs (auditoria de ações sobre leads) ─────────────
        await db.raw(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id           SERIAL PRIMARY KEY,
                user_id      INTEGER      REFERENCES users(id)  ON DELETE SET NULL,
                lead_id      INTEGER      REFERENCES leads(id)  ON DELETE CASCADE,
                action       VARCHAR(100) NOT NULL,
                entity_type  VARCHAR(50)  DEFAULT NULL,
                entity_id    INTEGER      DEFAULT NULL,
                old_value    TEXT         DEFAULT NULL,
                new_value    TEXT         DEFAULT NULL,
                ip_address   VARCHAR(45)  DEFAULT NULL,
                user_agent   TEXT         DEFAULT NULL,
                created_at   TIMESTAMP    DEFAULT NOW()
            )
        `).catch(() => {});
        // Garantir colunas extras caso tabela já existia sem elas
        await db.raw(`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS ip_address   VARCHAR(45)  DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS user_agent   TEXT         DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS old_value    TEXT         DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS new_value    TEXT         DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS entity_type  VARCHAR(50)  DEFAULT NULL`).catch(() => {});
        await db.raw(`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS entity_id    INTEGER      DEFAULT NULL`).catch(() => {});
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_activity_logs_lead_id ON activity_logs(lead_id)`).catch(() => {});
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_activity_logs_action   ON activity_logs(action)`).catch(() => {});
        await db.raw(`CREATE INDEX IF NOT EXISTS idx_activity_logs_created  ON activity_logs(created_at DESC)`).catch(() => {});

        // ── 14. Seed Admin user (teste@legacy.com) ──────────────────────────
        const testUserExists = await db('users').where({ email: 'teste@legacy.com' }).first();
        if (!testUserExists) {
            console.log('[DB] 👤 Semeando Usuário Admin (teste@legacy.com)...');
            await db('users').insert({
                name: 'Administrador Teste',
                email: 'teste@legacy.com',
                password_hash: '$2a$10$ahdPhePqKw43lHTLyNTyG.RJmVq84t18Rvay1413dU2yhq/3STXqa',
                role: 'admin',
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            });
            console.log('[DB] ✅ Usuário teste@legacy.com criado com sucesso!');
        } else {
            await db('users').where({ email: 'teste@legacy.com' }).update({
                password_hash: '$2a$10$ahdPhePqKw43lHTLyNTyG.RJmVq84t18Rvay1413dU2yhq/3STXqa',
                role: 'admin',
                is_active: true,
                updated_at: new Date()
            });
            console.log('[DB] ✅ Usuário teste@legacy.com atualizado com sucesso!');
        }

        console.log('[DB] ✅ Auto-migrations concluídas (PostgreSQL)');



    } catch (err) {
        console.error('[DB] ❌ Migration error (non-fatal):', err);
        // Não bloqueia o startup do servidor
    }
}



