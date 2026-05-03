import { Router } from 'express';
import {
    getPrompt,
    savePrompt,
    getKnowledgeFiles,
    addKnowledgeFile,
    deleteKnowledgeFile,
    getCollectedLeads,
    getVerifiedDocuments,
    knowledgeUpload,
} from '../controllers/database.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// All database routes require authentication
router.use(authMiddleware);

// ── Bot Prompts (per funnel) ──────────────────────────────────
router.get('/prompts/:funnel', getPrompt);
router.put('/prompts/:funnel', savePrompt);

// ── Knowledge Base (per funnel) ───────────────────────────────
router.get('/knowledge/:funnel', getKnowledgeFiles);
// Accept multipart/form-data file uploads OR plain JSON (backward compat)
router.post('/knowledge/:funnel', knowledgeUpload.single('file'), addKnowledgeFile);
router.delete('/knowledge/:id', deleteKnowledgeFile);

// ── Collected Leads (CollectedData tab) ──────────────────────
router.get('/leads', getCollectedLeads);

// ── Verified Documents (VerifiedDocuments tab) ────────────────
router.get('/verified-docs', getVerifiedDocuments);

export default router;
