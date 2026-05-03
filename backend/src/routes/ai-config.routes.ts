import { Router } from 'express';
import { getAIConfig, updateAIConfig } from '../controllers/ai-config.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// GET  /api/ai-config — Read all humanization settings
router.get('/', authMiddleware, getAIConfig);

// PUT  /api/ai-config — Update humanization settings
router.put('/', authMiddleware, updateAIConfig);

export default router;
