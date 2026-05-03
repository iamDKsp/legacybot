import { Router } from 'express';
import {
    getLeads,
    getLeadById,
    createLead,
    updateLead,
    updateLeadStage,
    updateLeadStatus,
    toggleBotStatus,
    deleteLead,
    getLeadNotes,
    createLeadNote,
    getLeadDocuments,
    createLeadDocument,
    downloadDocument,
    getFunnels,
    getStages,
    getLeadChecklist,
} from '../controllers/leads.controller';
import { getConversations, sendMessage } from '../controllers/webhook.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// All lead routes require authentication
router.use(authMiddleware);

// Funnels and stages (reference data)
router.get('/funnels', getFunnels);
router.get('/stages', getStages);

// Lead CRUD
router.get('/', getLeads);
router.post('/', createLead);
router.get('/:id', getLeadById);
router.put('/:id', updateLead);
router.delete('/:id', deleteLead);

// Lead actions
router.patch('/:id/stage', updateLeadStage);
router.patch('/:id/status', updateLeadStatus);
router.patch('/:id/bot', toggleBotStatus);

// Lead notes
router.get('/:id/notes', getLeadNotes);
router.post('/:id/notes', createLeadNote);

// Lead documents
router.get('/:id/documents', getLeadDocuments);
router.post('/:id/documents', createLeadDocument);
router.get('/:id/documents/:docId/download', downloadDocument);

// Lead checklist (document collection progress)
router.get('/:id/checklist', getLeadChecklist);

// Lead conversations (WhatsApp messages)
router.get('/:lead_id/conversations', getConversations);
router.post('/:lead_id/messages', sendMessage);

export default router;

