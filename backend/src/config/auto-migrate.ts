/**
 * auto-migrate.ts
 * Runs schema migrations automatically on server startup.
 * Uses IF NOT EXISTS and ADD COLUMN IF NOT EXISTS so it's safe
 * to run multiple times (idempotent).
 */

import { db } from './database';

export async function runAutoMigrations(): Promise<void> {
    console.log('[DB] Running auto-migrations...');

    try {
        // ── 1. Add missing columns to conversations ──────────────
        await db.raw(`
            ALTER TABLE conversations
                ADD COLUMN IF NOT EXISTS channel ENUM('whatsapp','email','manual') DEFAULT 'whatsapp' AFTER lead_id,
                ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER status
        `).catch(() => {/* column may already exist */ });

        // ── 1b. Add image_url column to messages (for document image preview in CRM chat) ──
        await db.raw(`
            ALTER TABLE messages
                ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) DEFAULT NULL AFTER media_type
        `).catch(() => { /* column may already exist */ });

        // ── 2. Add bot tracking columns to leads ─────────────────
        await db.raw(`
            ALTER TABLE leads
                ADD COLUMN IF NOT EXISTS bot_stage VARCHAR(50) DEFAULT 'reception' AFTER bot_active,
                ADD COLUMN IF NOT EXISTS bot_last_seen TIMESTAMP NULL DEFAULT NULL AFTER bot_stage
        `).catch(() => {/* column may already exist */ });

        // ── 3. Expand bot_sessions step enum for 10-stage funnel ─
        await db.raw(`
            ALTER TABLE bot_sessions
                MODIFY COLUMN step ENUM(
                    'reception','case_identification','cpf_collection',
                    'approval_hook','payment_objection','document_request',
                    'insecurity_handling','documents_received',
                    'timeline_question','followup','done'
                ) DEFAULT 'reception'
        `).catch(() => {/* already correct */ });

        // ── 4. Create bot_memory (self-learning) table ────────────
        await db.raw(`
            CREATE TABLE IF NOT EXISTS bot_memory (
                id INT AUTO_INCREMENT PRIMARY KEY,
                category ENUM('objection','question','success_pattern','error_pattern','case_type_signal') NOT NULL,
                trigger_pattern TEXT NOT NULL,
                successful_response TEXT DEFAULT NULL,
                legal_area ENUM('trabalhista','consumidor','cibernetico','pix') DEFAULT NULL,
                lead_converted TINYINT(1) DEFAULT 0,
                usage_count INT DEFAULT 1,
                confidence_score TINYINT UNSIGNED DEFAULT 50,
                is_active TINYINT(1) DEFAULT 1,
                last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_memory_category (category),
                INDEX idx_memory_area (legal_area),
                INDEX idx_memory_usage (usage_count DESC),
                INDEX idx_memory_active (is_active)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 5. Create bot_handoffs table ──────────────────────────
        await db.raw(`
            CREATE TABLE IF NOT EXISTS bot_handoffs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                lead_id INT NOT NULL,
                reason ENUM('documents_received','client_request','assessor_override','error') DEFAULT 'documents_received',
                bot_stage_at_handoff VARCHAR(50) DEFAULT NULL,
                summary TEXT DEFAULT NULL,
                notified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                acknowledged_by INT DEFAULT NULL,
                acknowledged_at TIMESTAMP NULL DEFAULT NULL,
                FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
                INDEX idx_handoff_lead (lead_id),
                INDEX idx_handoff_ack (acknowledged_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 6. Create bot_prompts table (Oracle-Core module) ──────
        await db.raw(`
            CREATE TABLE IF NOT EXISTS bot_prompts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                funnel_slug VARCHAR(100) NOT NULL UNIQUE,
                content LONGTEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_prompts_funnel (funnel_slug)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 7. Create knowledge_files table (Oracle-Core module) ──
        await db.raw(`
            CREATE TABLE IF NOT EXISTS knowledge_files (
                id INT AUTO_INCREMENT PRIMARY KEY,
                funnel_slug VARCHAR(100) NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                file_size_kb INT DEFAULT NULL,
                file_type VARCHAR(50) DEFAULT NULL,
                extracted_text LONGTEXT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_knowledge_funnel (funnel_slug)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 7b. Add extracted_text if table already exists without it ──
        await db.raw(`
            ALTER TABLE knowledge_files
                ADD COLUMN IF NOT EXISTS extracted_text LONGTEXT DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS file_type VARCHAR(50) DEFAULT NULL
        `).catch(() => { /* columns may already exist */ });

        // ── 8b. Create funnel_stages table (per-funnel Kanban mapping) ──
        await db.raw(`
            CREATE TABLE IF NOT EXISTS funnel_stages (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                funnel_id    INT NOT NULL,
                stage_id     INT NOT NULL,
                display_order INT DEFAULT 0,
                is_auto      TINYINT(1) DEFAULT 0 COMMENT '1 = Sofia moves lead here automatically',
                bot_stage_trigger VARCHAR(50) DEFAULT NULL,
                FOREIGN KEY (funnel_id) REFERENCES funnels(id) ON DELETE CASCADE,
                FOREIGN KEY (stage_id)  REFERENCES stages(id)  ON DELETE CASCADE,
                UNIQUE KEY uq_funnel_stage (funnel_id, stage_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 8c. Seed funnel_stages if empty (idempotent) ──
        // Also ensure 'Analise e Espera' stage exists (standardization v3)
        await db.raw(`
            INSERT IGNORE INTO stages (name, slug, display_order)
            VALUES ('Analise e Espera', 'analise_espera', 6)
        `);

        // ── 8c-fix. If funnel_stages still has 'procuracao', rebuild from scratch ──
        const procStage = await db('stages').where({ slug: 'procuracao' }).first() as { id: number } | undefined;
        const hasProcInFunnel = procStage
            ? await db('funnel_stages').where({ stage_id: procStage.id }).first()
            : null;

        const fsCount = await db('funnel_stages').count('id as c').first();
        const funelStageCount = parseInt(String((fsCount as { c: string }).c || '0'), 10);

        if (funelStageCount === 0 || hasProcInFunnel) {
            if (hasProcInFunnel) {
                console.log('[DB] 🔄 Detected deprecated procuracao stage in funnel_stages — rebuilding...');
                await db('funnel_stages').del();
            }

            // Build seed data per funnel using slug lookups
            const funnelDefs: Record<string, Array<{ slug: string; ord: number; auto: number; trig: string | null }>> = {
                geral: [
                    { slug: 'recebido',       ord: 1, auto: 1, trig: 'reception'   },
                    { slug: 'abordagem',      ord: 2, auto: 1, trig: 'approach'    },
                    { slug: 'documentacao',   ord: 3, auto: 1, trig: 'doc_request' },
                    { slug: 'analise_espera', ord: 4, auto: 0, trig: null          },
                    { slug: 'finalizado',     ord: 5, auto: 0, trig: null          },
                ],
                trabalhista: [
                    { slug: 'recebido',       ord: 1, auto: 1, trig: 'reception'   },
                    { slug: 'abordagem',      ord: 2, auto: 1, trig: 'approach'    },
                    { slug: 'documentacao',   ord: 3, auto: 1, trig: 'doc_request' },
                    { slug: 'assinatura',     ord: 4, auto: 0, trig: null          },
                    { slug: 'analise_espera', ord: 5, auto: 0, trig: null          },
                    { slug: 'finalizado',     ord: 6, auto: 0, trig: null          },
                ],
                negativado: [
                    { slug: 'recebido',       ord: 1, auto: 1, trig: 'reception'   },
                    { slug: 'abordagem',      ord: 2, auto: 1, trig: 'approach'    },
                    { slug: 'documentacao',   ord: 3, auto: 1, trig: 'doc_request' },
                    { slug: 'assinatura',     ord: 4, auto: 0, trig: null          },
                    { slug: 'analise_espera', ord: 5, auto: 0, trig: null          },
                    { slug: 'finalizado',     ord: 6, auto: 0, trig: null          },
                ],
                'golpe-cibernetico': [
                    { slug: 'recebido',       ord: 1, auto: 1, trig: 'reception'   },
                    { slug: 'abordagem',      ord: 2, auto: 1, trig: 'approach'    },
                    { slug: 'documentacao',   ord: 3, auto: 1, trig: 'doc_request' },
                    { slug: 'assinatura',     ord: 4, auto: 0, trig: null          },
                    { slug: 'analise_espera', ord: 5, auto: 0, trig: null          },
                    { slug: 'finalizado',     ord: 6, auto: 0, trig: null          },
                ],
                'golpe-pix': [
                    { slug: 'recebido',       ord: 1, auto: 1, trig: 'reception'       },
                    { slug: 'abordagem',      ord: 2, auto: 1, trig: 'approach'        },
                    { slug: 'coleta_info',    ord: 3, auto: 1, trig: 'info_collection' },
                    { slug: 'documentacao',   ord: 4, auto: 1, trig: 'doc_request'     },
                    { slug: 'assinatura',     ord: 5, auto: 0, trig: null              },
                    { slug: 'analise_espera', ord: 6, auto: 0, trig: null              },
                    { slug: 'finalizado',     ord: 7, auto: 0, trig: null              },
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
                            funnel_id: funnel.id,
                            stage_id: stage.id,
                            display_order: def.ord,
                            is_auto: def.auto,
                            bot_stage_trigger: def.trig,
                        })
                        .onConflict(['funnel_id', 'stage_id'])
                        .ignore()
                        .catch(() => { /* duplicate — safe to ignore */ });
                }
            }
            console.log('[DB] Seeded funnel_stages mappings');
        }

        // ── 8d. Ensure 'geral' funnel always has its stages (idempotent) ──
        // This runs independently so adding 'geral' to an existing DB is safe.
        const geralFunnel = await db('funnels').where({ slug: 'geral' }).first() as { id: number } | undefined;
        if (geralFunnel) {
            const geralStageCount = await db('funnel_stages').where({ funnel_id: geralFunnel.id }).count('id as c').first();
            const geralCount = parseInt(String((geralStageCount as { c: string }).c || '0'), 10);
            if (geralCount === 0) {
                console.log('[DB] ➕ Seeding funnel_stages for "geral" funnel...');
                const geralDefs = [
                    { slug: 'recebido',       ord: 1, auto: 1, trig: 'reception'   },
                    { slug: 'abordagem',      ord: 2, auto: 1, trig: 'approach'    },
                    { slug: 'documentacao',   ord: 3, auto: 1, trig: 'doc_request' },
                    { slug: 'analise_espera', ord: 4, auto: 0, trig: null          },
                    { slug: 'finalizado',     ord: 5, auto: 0, trig: null          },
                ];
                for (const def of geralDefs) {
                    const stage = await db('stages').where({ slug: def.slug }).first() as { id: number } | undefined;
                    if (!stage) continue;
                    await db('funnel_stages')
                        .insert({ funnel_id: geralFunnel.id, stage_id: stage.id, display_order: def.ord, is_auto: def.auto, bot_stage_trigger: def.trig })
                        .onConflict(['funnel_id', 'stage_id']).ignore()
                        .catch(() => { /* duplicate — safe */ });
                }
                console.log('[DB] ✅ funnel_stages for "geral" seeded successfully');
            }
        }

        // ── 8. Seed initial bot memory patterns (if empty) ───────
        const count = await db('bot_memory').count('id as c').first();
        const memoryCount = parseInt(String((count as { c: string }).c || '0'), 10);

        if (memoryCount === 0) {
            await db('bot_memory').insert([
                {
                    category: 'objection',
                    trigger_pattern: 'é golpe|piramide|desconfio|não confio|tenho medo de golpe',
                    successful_response: 'Eu entendo sua insegurança! Mas te garanto: nosso serviço é sério. Se fosse um golpista, estaria te cobrando R$100 agora. Trabalhamos só com êxito — sem ganhar, você não paga NADA 🙏',
                    legal_area: null,
                    lead_converted: 1,
                    confidence_score: 90,
                },
                {
                    category: 'question',
                    trigger_pattern: 'quanto custa|tem taxa|cobra quanto|valor|honorário|é de graça',
                    successful_response: 'Não cobramos nada adiantado. Trabalhamos em cima de resultado: se ganharmos, você paga os honorários. Caso contrário, você não paga NADA 👍',
                    legal_area: null,
                    lead_converted: 1,
                    confidence_score: 95,
                },
                {
                    category: 'question',
                    trigger_pattern: 'quanto tempo|quando fica pronto|prazo|demora quanto|quando termina',
                    successful_response: 'O prazo depende do juiz responsável pelo seu caso. Assim que tivermos atualizações, entraremos em contato direto! 🙏',
                    legal_area: null,
                    lead_converted: 1,
                    confidence_score: 85,
                },
                {
                    category: 'case_type_signal',
                    trigger_pattern: 'demitido|demissão|mandado embora|aviso prévio|horas extras|fgts|assédio|carteira de trabalho',
                    successful_response: null,
                    legal_area: 'trabalhista',
                    lead_converted: 0,
                    confidence_score: 90,
                },
                {
                    category: 'case_type_signal',
                    trigger_pattern: 'copasa|cemig|cobrança indevida|negativado|serasa|spc|faculdade|curso',
                    successful_response: null,
                    legal_area: 'consumidor',
                    lead_converted: 0,
                    confidence_score: 88,
                },
                {
                    category: 'case_type_signal',
                    trigger_pattern: 'whatsapp hackeado|conta invadida|clonaram|dados roubados|phishing|fraude online',
                    successful_response: null,
                    legal_area: 'cibernetico',
                    lead_converted: 0,
                    confidence_score: 92,
                },
                {
                    category: 'case_type_signal',
                    trigger_pattern: 'pix|caí em golpe|fui enganado|falso vendedor|boleto falso|estelionato',
                    successful_response: null,
                    legal_area: 'pix',
                    lead_converted: 0,
                    confidence_score: 92,
                },
            ]);
            console.log('[DB] Seeded initial bot_memory patterns (7 patterns)');
        }

        // ── PHC-1. Create phc_lawyers table ─────────────────────────────
        await db.raw(`
            CREATE TABLE IF NOT EXISTS phc_lawyers (
                id               INT AUTO_INCREMENT PRIMARY KEY,
                name             VARCHAR(255) NOT NULL,
                oab              VARCHAR(50)  NOT NULL,
                cpf              VARCHAR(20)  DEFAULT NULL,
                email            VARCHAR(150) DEFAULT NULL,
                phone            VARCHAR(30)  DEFAULT NULL,
                address          VARCHAR(255) DEFAULT NULL,
                city             VARCHAR(100) DEFAULT NULL,
                state            CHAR(2)      DEFAULT NULL,
                additional_info  TEXT         DEFAULT NULL,
                created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
                updated_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_lawyers_name (name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── PHC-2. Create phc_documents table ────────────────────────────
        await db.raw(`
            CREATE TABLE IF NOT EXISTS phc_documents (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                lead_id      INT NOT NULL,
                lawyer_id    INT NOT NULL,
                doc_type     ENUM('procuracao','declaracao_hipo','contrato') NOT NULL,
                funnel_slug  VARCHAR(100) DEFAULT NULL,
                status       ENUM('rascunho','salvo','baixado') DEFAULT 'rascunho',
                notes        TEXT DEFAULT NULL,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (lead_id)   REFERENCES leads(id)        ON DELETE CASCADE,
                FOREIGN KEY (lawyer_id) REFERENCES phc_lawyers(id)  ON DELETE RESTRICT,
                INDEX idx_phc_lead   (lead_id),
                INDEX idx_phc_lawyer (lawyer_id),
                INDEX idx_phc_funnel (funnel_slug)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── DOC-1. Add file_path column to documents table ─────────────
        await db.raw(`
            ALTER TABLE documents
                ADD COLUMN IF NOT EXISTS file_path VARCHAR(500) DEFAULT NULL AFTER file_url,
                ADD COLUMN IF NOT EXISTS file_url VARCHAR(500) DEFAULT NULL AFTER file_type
        `).catch(() => { /* columns may already exist or different order — safe */ });

        // ── LEAD-PHC. Add legal/juridical data fields to leads table ───
        // Required for generating procuração, declaração de hipossuficiência and contrato
        await db.raw(`
            ALTER TABLE leads
                ADD COLUMN IF NOT EXISTS address     VARCHAR(255) DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS city        VARCHAR(100) DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS state       CHAR(2)      DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS rg          VARCHAR(30)  DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS marital_status ENUM('solteiro','casado','divorciado','viuvo','outro') DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS nationality VARCHAR(50)  DEFAULT 'brasileiro(a)',
                ADD COLUMN IF NOT EXISTS birthdate   DATE         DEFAULT NULL
        `).catch(() => { /* columns may already exist */ });

        // ── PHC-3. Add file_path to phc_documents for PDF caching ──────
        await db.raw(`
            ALTER TABLE phc_documents
                ADD COLUMN IF NOT EXISTS file_path VARCHAR(500) DEFAULT NULL
        `).catch(() => { /* column may already exist */ });

    } catch (err) {
        console.error('[DB] ❌ Migration error (non-fatal):', err);
        // Don't throw — migrations shouldn't block server startup
    }
}
