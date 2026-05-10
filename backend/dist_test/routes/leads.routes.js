"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const leads_controller_1 = require("../controllers/leads.controller");
const webhook_controller_1 = require("../controllers/webhook.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// All lead routes require authentication
router.use(auth_1.authMiddleware);
// Funnels and stages (reference data)
router.get('/funnels', leads_controller_1.getFunnels);
router.get('/stages', leads_controller_1.getStages);
// Lead CRUD
router.get('/', leads_controller_1.getLeads);
router.post('/', leads_controller_1.createLead);
router.get('/:id', leads_controller_1.getLeadById);
router.put('/:id', leads_controller_1.updateLead);
router.delete('/:id', leads_controller_1.deleteLead);
// Lead actions
router.patch('/:id/stage', leads_controller_1.updateLeadStage);
router.patch('/:id/status', leads_controller_1.updateLeadStatus);
router.patch('/:id/bot', leads_controller_1.toggleBotStatus);
// Lead notes
router.get('/:id/notes', leads_controller_1.getLeadNotes);
router.post('/:id/notes', leads_controller_1.createLeadNote);
// Lead documents
router.get('/:id/documents', leads_controller_1.getLeadDocuments);
router.post('/:id/documents', leads_controller_1.createLeadDocument);
router.get('/:id/documents/:docId/download', leads_controller_1.downloadDocument);
// Lead checklist (document collection progress)
router.get('/:id/checklist', leads_controller_1.getLeadChecklist);
// Lead conversations (WhatsApp messages)
router.get('/:lead_id/conversations', webhook_controller_1.getConversations);
router.post('/:lead_id/messages', webhook_controller_1.sendMessage);
exports.default = router;
//# sourceMappingURL=leads.routes.js.map