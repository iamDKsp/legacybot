import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config/env';
import { testConnection } from './config/database';
import { runAutoMigrations } from './config/auto-migrate';
import { initWebSocketServer } from './services/websocket.service';
import { errorHandler } from './middleware/errorHandler';

// Routes
import authRoutes from './routes/auth.routes';
import leadsRoutes from './routes/leads.routes';
import tasksRoutes from './routes/tasks.routes';
import dashboardRoutes from './routes/dashboard.routes';
import webhookRoutes from './routes/webhook.routes';
import databaseRoutes from './routes/database.routes';
import aiConfigRoutes from './routes/ai-config.routes';
import usersRoutes from './routes/users.routes';
import phcRoutes from './routes/phc.routes';

// ============================================================
// Express App Setup
// ============================================================
const app = express();
const server = http.createServer(app);

// ============================================================
// CORS — allowed origins (production + dev)
// ============================================================
const allowedOrigins = [
    config.frontendUrl,
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
const io = new SocketIOServer(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
    },
});
initWebSocketServer(io);

// ============================================================
// Security Middleware
// ============================================================
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    message: { success: false, error: 'Muitas requisições. Tente novamente em 15 minutos.' },
    skip: (req) => req.originalUrl.startsWith('/api/webhook'),
});
app.use('/api/', limiter);

// Webhook gets a higher rate limit (WhatsApp sends many messages)
const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 5000, // increased drastically for testing
    message: { success: false, error: 'Webhook Limit Exceeded' }
});
app.use('/api/webhook', webhookLimiter);

// ============================================================
// Body Parsing
// ============================================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================
// Logging
// ============================================================
if (config.nodeEnv !== 'test') {
    app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
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
        environment: config.nodeEnv,
    });
});

// ============================================================
// API Routes
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/database', databaseRoutes);
app.use('/api/ai-config', aiConfigRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/phc', phcRoutes);

// ============================================================
// 404 Handler
// ============================================================
app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Rota não encontrada' });
});

// ============================================================
// Global Error Handler
// ============================================================
app.use(errorHandler);

// ============================================================
// Server Start
// ============================================================
async function start(): Promise<void> {
    try {
        await testConnection();
        await runAutoMigrations();

        server.listen(config.port, () => {
            console.log('\n🚀 Legacy CRM Backend Running!');
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`  📡 API:       http://localhost:${config.port}/api`);
            console.log(`  ❤️  Health:   http://localhost:${config.port}/health`);
            console.log(`  🌐 Frontend: ${config.frontendUrl}`);
            console.log(`  🗄️  Database: ${config.db.name}@${config.db.host}:${config.db.port}`);
            console.log(`  🤖 AI:       ${config.googleAi.apiKey !== 'your-google-cloud-api-key-here' ? '✅ Configured' : '⚠️  Not configured (using fallback)'}`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

start();

export { app, server };
