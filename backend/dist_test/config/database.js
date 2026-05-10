"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.testConnection = testConnection;
const knex_1 = __importDefault(require("knex"));
const env_1 = require("./env");
// Railway injeta DATABASE_URL — tem prioridade absoluta sobre vars individuais
const connection = env_1.config.db.url
    ? env_1.config.db.url
    : {
        host: env_1.config.db.host,
        port: env_1.config.db.port,
        database: env_1.config.db.name,
        user: env_1.config.db.user,
        password: env_1.config.db.password,
        // SSL obrigatório no Railway PostgreSQL
        ssl: env_1.config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
    };
exports.db = (0, knex_1.default)({
    client: 'pg',
    connection,
    pool: {
        min: 1, // Railway free tier: conservar conexões
        max: 5, // Railway free tier: máximo seguro
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        idleTimeoutMillis: 600000, // 10min: fecha conexões ociosas
    },
    debug: env_1.config.nodeEnv === 'development',
});
async function testConnection() {
    try {
        await exports.db.raw('SELECT 1');
        console.log('✅ Database (PostgreSQL) connected successfully');
    }
    catch (error) {
        console.error('❌ Database connection failed:', error);
        throw error;
    }
}
//# sourceMappingURL=database.js.map