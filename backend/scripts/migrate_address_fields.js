/**
 * migrate_address_fields.js
 * Executa a migration dos campos de endereço separados.
 * Uso: node scripts/migrate_address_fields.js
 *
 * Lê DATABASE_URL (Railway) ou as variáveis DB_* do .env
 */

const path = require('path');
const fs = require('fs');

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
    console.log('\n🔄 Iniciando migration: campos de endereço...\n');

    try {
        await db.raw('SELECT 1'); // ping
        console.log('✅ Banco conectado\n');

        // Verificar colunas que já existem
        const existing = await db('information_schema.columns')
            .where('table_name', 'leads')
            .whereIn('column_name', ['street', 'number', 'neighborhood', 'zip_code'])
            .select('column_name');

        const existingNames = existing.map(r => r.column_name);
        console.log('Colunas já existentes:', existingNames.length ? existingNames.join(', ') : 'nenhuma');

        const toAdd = [
            { col: 'street',       type: 'VARCHAR(255)' },
            { col: 'number',       type: 'VARCHAR(20)'  },
            { col: 'neighborhood', type: 'VARCHAR(100)' },
            { col: 'zip_code',     type: 'VARCHAR(10)'  },
        ].filter(c => !existingNames.includes(c.col));

        if (toAdd.length === 0) {
            console.log('\n✅ Todas as colunas já existem — migration dispensada.\n');
        } else {
            for (const { col, type } of toAdd) {
                await db.schema.table('leads', (t) => {
                    t.specificType(col, type).nullable().defaultTo(null);
                });
                console.log(`  ➕ Coluna adicionada: leads.${col} ${type}`);
            }
            console.log('\n✅ Migration concluída com sucesso!\n');
        }
    } catch (err) {
        console.error('\n❌ Erro na migration:', err.message);
        process.exit(1);
    } finally {
        await db.destroy();
    }
}

run();
