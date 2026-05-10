"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const socket_io_1 = require("socket.io");
const env_1 = require("./config/env");
const database_1 = require("./config/database");
const auto_migrate_1 = require("./config/auto-migrate");
const websocket_service_1 = require("./services/websocket.service");
const errorHandler_1 = require("./middleware/errorHandler");
// Routes
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const leads_routes_1 = __importDefault(require("./routes/leads.routes"));
const tasks_routes_1 = __importDefault(require("./routes/tasks.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const webhook_routes_1 = __importDefault(require("./routes/webhook.routes"));
const database_routes_1 = __importDefault(require("./routes/database.routes"));
const ai_config_routes_1 = __importDefault(require("./routes/ai-config.routes"));
const users_routes_1 = __importDefault(require("./routes/users.routes"));
const phc_routes_1 = __importDefault(require("./routes/phc.routes"));
// ============================================================
// Express App Setup
// ============================================================
const app = (0, express_1.default)();
exports.app = app;
const server = http_1.default.createServer(app);
exports.server = server;
// Railway / Vercel rodam atrás de reverse proxy — necessário para rate-limit e IPs corretos
app.set('trust proxy', 1);
// ============================================================
// CORS — allowed origins (production + dev)
// ============================================================
const allowedOrigins = [
    env_1.config.frontendUrl,
    'http://localhost',
    'http://localhost:80',
    'http://127.0.0.1',
    'http://localhost:8080',
    'http://localhost:5173',
    'http://localhost:3000',
].filter(Boolean);
// ============================================================
// Socket.IO Setup
// ============================================================
const io = new socket_io_1.Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
    },
});
(0, websocket_service_1.initWebSocketServer)(io);
// ============================================================
// Security Middleware
// ============================================================
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use((0, cors_1.default)({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    message: { success: false, error: 'Muitas requisições. Tente novamente em 15 minutos.' },
    skip: (req) => req.originalUrl.startsWith('/api/webhook'),
});
app.use('/api/', limiter);
// Webhook gets a higher rate limit (WhatsApp sends many messages)
const webhookLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 5000, // increased drastically for testing
    message: { success: false, error: 'Webhook Limit Exceeded' }
});
app.use('/api/webhook', webhookLimiter);
// ============================================================
// Body Parsing
// ============================================================
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// ============================================================
// Logging
// ============================================================
if (env_1.config.nodeEnv !== 'test') {
    app.use((0, morgan_1.default)(env_1.config.nodeEnv === 'development' ? 'dev' : 'combined'));
}
// ============================================================
// Health Check
// ============================================================
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'Legacy CRM API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: env_1.config.nodeEnv,
    });
});
// ============================================================
// API Routes
// ============================================================
app.use('/api/auth', auth_routes_1.default);
app.use('/api/leads', leads_routes_1.default);
app.use('/api/tasks', tasks_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.use('/api/webhook', webhook_routes_1.default);
app.use('/api/database', database_routes_1.default);
app.use('/api/ai-config', ai_config_routes_1.default);
app.use('/api/users', users_routes_1.default);
app.use('/api/phc', phc_routes_1.default);
// ============================================================
// 404 Handler
// ============================================================
app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Rota não encontrada' });
});
// ============================================================
// Global Error Handler
// ============================================================
app.use(errorHandler_1.errorHandler);
// ============================================================
// Server Start — escuta ANTES de conectar ao banco
// O healthcheck do Railway precisa responder enquanto o banco inicializa
// ============================================================
async function start() {
    // 1. Sobe o servidor HTTP imediatamente (healthcheck responde)
    server.listen(env_1.config.port, () => {
        console.log('\n🚀 Legacy CRM Backend Running!');
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`  📡 API:       http://localhost:${env_1.config.port}/api`);
        console.log(`  ❤️  Health:   http://localhost:${env_1.config.port}/health`);
        console.log(`  🌐 Frontend: ${env_1.config.frontendUrl}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    });
    // 2. Conecta ao banco com retry — sem travar o startup
    let retries = 5;
    while (retries > 0) {
        try {
            await (0, database_1.testConnection)();
            await (0, auto_migrate_1.runAutoMigrations)();
            console.log('✅ Database pronto. Servidor totalmente operacional.');
            return;
        }
        catch (error) {
            retries--;
            if (retries === 0) {
                console.error('❌ Falha ao conectar ao banco após 5 tentativas:', error);
                console.error('⚠️  Verifique se DATABASE_URL está configurado no Railway.');
                // Não mata o processo — permite healthcheck continuar respondendo
                // O Railway vai mostrar o erro nos logs mas o container sobrevive
            }
            else {
                console.warn(`⏳ Banco indisponível. Tentando novamente em 5s... (${retries} tentativas restantes)`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
}
start();
//# sourceMappingURL=server.js.map