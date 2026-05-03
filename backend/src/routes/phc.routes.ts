import { Router } from 'express';
import {
    getLawyers,
    createLawyer,
    updateLawyer,
    deleteLawyer,
    getPhcDocuments,
    getPhcDocumentById,
    createPhcDocument,
    updatePhcStatus,
    deletePhcDocument,
    downloadPhcPdf,
} from '../controllers/phc.controller';
import { authMiddleware } from '../middleware/auth';


const router = Router();

// All PHC routes require authentication
router.use(authMiddleware);

// ── Lawyers ──────────────────────────────────────────────────
router.get('/lawyers', getLawyers);
router.post('/lawyers', createLawyer);
router.put('/lawyers/:id', updateLawyer);
router.delete('/lawyers/:id', deleteLawyer);

// ── PHC Documents ─────────────────────────────────────────────
router.get('/documents', getPhcDocuments);
router.post('/documents', createPhcDocument);
router.get('/documents/:id/pdf', downloadPhcPdf);
router.get('/documents/:id', getPhcDocumentById);
router.patch('/documents/:id/status', updatePhcStatus);
router.delete('/documents/:id', deletePhcDocument);


export default router;
