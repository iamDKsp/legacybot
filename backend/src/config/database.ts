import knex, { Knex } from 'knex';
import { config } from './env';

// Railway injeta DATABASE_URL — tem prioridade absoluta sobre vars individuais
const connection: string | Knex.PgConnectionConfig = config.db.url
    ? config.db.url
    : {
        host: config.db.host,
        port: config.db.port,
        database: config.db.name,
        user: config.db.user,
        password: config.db.password,
        // SSL obrigatório no Railway PostgreSQL
        ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
    };

export const db = knex({
    client: 'pg',
    connection,
    pool: {
        min: 1,   // Railway free tier: conservar conexões
        max: 5,   // Railway free tier: máximo seguro
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        idleTimeoutMillis: 600000,   // 10min: fecha conexões ociosas
    },
    debug: config.nodeEnv === 'development',
});

export async function testConnection(): Promise<void> {
    try {
        await db.raw('SELECT 1');
        console.log('✅ Database (PostgreSQL) connected successfully');
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        throw error;
    }
}
