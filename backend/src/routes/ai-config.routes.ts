import { Router } from 'express';
import { getAIConfig, updateAIConfig, getAILogs } from '../controllers/ai-config.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// GET  /api/ai-config — Read all humanization settings
router.get('/', authMiddleware, getAIConfig);

// PUT  /api/ai-config — Update humanization settings
router.put('/', authMiddleware, updateAIConfig);

// GET  /api/ai-config/logs — Get AI error logs
router.get('/logs', authMiddleware, getAILogs);

export default router;
