/**
 * migrate_parent_lead.js
 * Adiciona parent_lead_id na tabela leads e garante que activity_logs existe com todos os campos.
 * Uso: node scripts/migrate_parent_lead.js
 */

const path = require('path');
const fs   = require('fs');

// ── Carregar .env ──────────────────────────────────────────────
const envPaths = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
];
for (const p of envPaths) {
    if (fs.existsSync(p)) {
        require('dotenv').config({ path: p });
        console.log(`[ENV] Loaded: ${p}`);
        break;
    }
}

// ── Conexão ────────────────────────────────────────────────────
const knex = require('knex');

const connection = process.env.DATABASE_URL
    ? process.env.DATABASE_URL
    : {
        host:     process.env.DB_HOST || '127.0.0.1',
        port:     parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'legacy',
        user:     process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    };

const db = knex({ client: 'pg', connection });

// ── Migration ──────────────────────────────────────────────────
async function run() {
    console.log('\n🔄 Iniciando migration: parent_lead_id + activity_logs...\n');

    try {
        await db.raw('SELECT 1'); // ping
        console.log('✅ Banco conectado\n');

        // ── 1. Coluna parent_lead_id na tabela leads ──────────────
        const leadsColumns = await db('information_schema.columns')
            .where('table_name', 'leads')
            .whereIn('column_name', ['parent_lead_id'])
            .select('column_name');

        if (leadsColumns.length === 0) {
            // Adicionar via raw para poder criar o FOREIGN KEY corretamente
            await db.raw(`
                ALTER TABLE leads
                ADD COLUMN parent_lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL
            `);
            console.log('  ➕ Coluna adicionada: leads.parent_lead_id');

            await db.raw(`
                CREATE INDEX IF NOT EXISTS idx_leads_parent_lead_id ON leads(parent_lead_id)
            `);
            console.log('  ➕ Index criado: idx_leads_parent_lead_id');
        } else {
            console.log('  ✅ leads.parent_lead_id já existe — pulando');
        }

        // ── 2. Tabela activity_logs ───────────────────────────────
        const tableExists = await db.schema.hasTable('activity_logs');
        if (!tableExists) {
            await db.schema.createTable('activity_logs', (t) => {
                t.increments('id').primary();
                t.integer('user_id').references('id').inTable('users').onDelete('SET NULL').nullable();
                t.integer('lead_id').references('id').inTable('leads').onDelete('CASCADE').nullable();
                t.string('action', 100).notNullable();
                t.string('entity_type', 50).nullable();
                t.integer('entity_id').nullable();
                t.jsonb('old_value').nullable();
                t.jsonb('new_value').nullable();
                t.string('ip_address', 45).nullable();
                t.text('user_agent').nullable();
                t.timestamp('created_at').defaultTo(db.fn.now());
            });
            console.log('  ➕ Tabela criada: activity_logs');

            await db.raw(`CREATE INDEX IF NOT EXISTS idx_activity_logs_lead_id ON activity_logs(lead_id)`);
            await db.raw(`CREATE INDEX IF NOT EXISTS idx_activity_logs_action   ON activity_logs(action)`);
            await db.raw(`CREATE INDEX IF NOT EXISTS idx_activity_logs_created  ON activity_logs(created_at DESC)`);
            console.log('  ➕ Indexes criados: activity_logs');
        } else {
            console.log('  ✅ Tabela activity_logs já existe — verificando colunas extras...');

            // Garantir colunas que podem estar faltando em tabelas antigas
            const alogs = await db('information_schema.columns')
                .where('table_name', 'activity_logs')
                .select('column_name');
            const alogCols = alogs.map(r => r.column_name);

            if (!alogCols.includes('ip_address')) {
                await db.raw(`ALTER TABLE activity_logs ADD COLUMN ip_address VARCHAR(45)`);
                console.log('  ➕ Coluna adicionada: activity_logs.ip_address');
            }
            if (!alogCols.includes('user_agent')) {
                await db.raw(`ALTER TABLE activity_logs ADD COLUMN user_agent TEXT`);
                console.log('  ➕ Coluna adicionada: activity_logs.user_agent');
            }
            if (!alogCols.includes('old_value')) {
                await db.raw(`ALTER TABLE activity_logs ADD COLUMN old_value TEXT`);
                console.log('  ➕ Coluna adicionada: activity_logs.old_value');
            }
            if (!alogCols.includes('new_value')) {
                await db.raw(`ALTER TABLE activity_logs ADD COLUMN new_value TEXT`);
                console.log('  ➕ Coluna adicionada: activity_logs.new_value');
            }
        }

        console.log('\n✅ Migration concluída com sucesso!\n');

    } catch (err) {
        console.error('\n❌ Erro na migration:', err.message);
        process.exit(1);
    } finally {
        await db.destroy();
    }
}

run();
