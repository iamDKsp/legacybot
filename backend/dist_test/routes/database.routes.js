"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_controller_1 = require("../controllers/database.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// All database routes require authentication
router.use(auth_1.authMiddleware);
// ── Bot Prompts (per funnel) ──────────────────────────────────
router.get('/prompts/:funnel', database_controller_1.getPrompt);
router.put('/prompts/:funnel', database_controller_1.savePrompt);
// ── Knowledge Base (per funnel) ───────────────────────────────
router.get('/knowledge/:funnel', database_controller_1.getKnowledgeFiles);
// Accept multipart/form-data file uploads OR plain JSON (backward compat)
router.post('/knowledge/:funnel', database_controller_1.knowledgeUpload.single('file'), database_controller_1.addKnowledgeFile);
router.delete('/knowledge/:id', database_controller_1.deleteKnowledgeFile);
// ── Collected Leads (CollectedData tab) ──────────────────────
router.get('/leads', database_controller_1.getCollectedLeads);
// ── Verified Documents (VerifiedDocuments tab) ────────────────
router.get('/verified-docs', database_controller_1.getVerifiedDocuments);
exports.default = router;
//# sourceMappingURL=database.routes.js.map