"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
// ── webhook.controller: handler principal (horário comercial, detecção emocional,
//    pipeline de documentos completo por funil, normalização robusta de payload)
const webhook_controller_1 = require("../controllers/webhook.controller");
// ── conversations.controller: WhatsApp management, bot memory, handoffs
const conversations_controller_1 = require("../controllers/conversations.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// ── Webhook endpoint — no auth (Evolution API / Baileys Bridge sends here) ──
// Uses the advanced handler: business hours, emotional state, full doc pipeline
router.post('/whatsapp', webhook_controller_1.handleWebhook);
// ── WhatsApp Management — requires CRM auth ──────────────────
router.post('/whatsapp/connect', auth_1.authMiddleware, conversations_controller_1.connectWhatsApp);
router.get('/whatsapp/qr', auth_1.authMiddleware, conversations_controller_1.getQRCode);
router.get('/whatsapp/status', auth_1.authMiddleware, conversations_controller_1.getConnectionStatus);
router.post('/whatsapp/test', auth_1.authMiddleware, conversations_controller_1.sendTestMessage);
router.delete('/whatsapp/disconnect', auth_1.authMiddleware, conversations_controller_1.disconnectWhatsApp);
// ── Bot Memory (Learning) ─────────────────────────────────────
router.get('/bot/memory', auth_1.authMiddleware, conversations_controller_1.getBotMemory);
router.post('/bot/memory', auth_1.authMiddleware, conversations_controller_1.addBotMemory);
router.delete('/bot/memory/:id', auth_1.authMiddleware, conversations_controller_1.deleteBotMemory);
// ── Bot Handoffs ──────────────────────────────────────────────
router.get('/bot/handoffs', auth_1.authMiddleware, conversations_controller_1.getHandoffs);
router.patch('/bot/handoffs/:id/acknowledge', auth_1.authMiddleware, conversations_controller_1.acknowledgeHandoff);
exports.default = router;
//# sourceMappingURL=webhook.routes.js.map