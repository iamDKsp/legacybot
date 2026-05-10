"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Try multiple .env locations (dev: Legacy/.env, Docker: env vars are injected)
const envPaths = [
    path_1.default.resolve(__dirname, '../../../.env'), // From src/config/ → Legacy/.env (dev with ts-node)
    path_1.default.resolve(__dirname, '../../.env'), // From dist/config/ → Legacy/.env (compiled)
];
let envLoaded = false;
for (const p of envPaths) {
    if (fs_1.default.existsSync(p)) {
        dotenv_1.default.config({ path: p });
        console.log(`[ENV] ✅ Loaded .env from: ${p}`);
        envLoaded = true;
        break;
    }
}
if (!envLoaded) {
    // In Docker, env vars are injected directly — this is expected
    dotenv_1.default.config(); // Try default .env in cwd
    console.log('[ENV] ⚠️  No .env file found — using process environment variables');
}
exports.config = {
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8080',
    db: {
        // Railway injeta DATABASE_URL automaticamente — tem prioridade sobre as vars individuais
        url: process.env.DATABASE_URL || '',
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        name: process.env.DB_NAME || 'legacy',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },
    googleAi: {
        apiKey: process.env.GOOGLE_AI_API_KEY || '',
        model: process.env.GOOGLE_AI_MODEL || 'gemini-3.1-flash-lite-preview',
        mediaModel: process.env.GOOGLE_AI_MEDIA_MODEL || process.env.GOOGLE_AI_MODEL || 'gemini-2.5-flash',
    },
    whatsapp: {
        apiUrl: process.env.WHATSAPP_API_URL || 'http://localhost:8081',
        apiKey: process.env.WHATSAPP_API_KEY || process.env.EVOLUTION_API_KEY || '',
        instance: process.env.WHATSAPP_INSTANCE || 'legacy-crm',
    },
    webhookSecret: process.env.WEBHOOK_SECRET || 'webhook-secret',
};
// Startup diagnostics
console.log(`[ENV] Config loaded: model=${exports.config.googleAi.model}, mediaModel=${exports.config.googleAi.mediaModel}, apiKey=${exports.config.googleAi.apiKey ? '✅ SET' : '❌ MISSING'}, whatsappApiKey=${exports.config.whatsapp.apiKey ? '✅ SET' : '❌ MISSING'}, whatsappUrl=${exports.config.whatsapp.apiUrl}`);
//# sourceMappingURL=env.js.map