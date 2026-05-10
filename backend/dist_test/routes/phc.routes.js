"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const phc_controller_1 = require("../controllers/phc.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// All PHC routes require authentication
router.use(auth_1.authMiddleware);
// ── Lawyers ──────────────────────────────────────────────────
router.get('/lawyers', phc_controller_1.getLawyers);
router.post('/lawyers', phc_controller_1.createLawyer);
router.put('/lawyers/:id', phc_controller_1.updateLawyer);
router.delete('/lawyers/:id', phc_controller_1.deleteLawyer);
// ── PHC Documents ─────────────────────────────────────────────
router.get('/documents', phc_controller_1.getPhcDocuments);
router.post('/documents', phc_controller_1.createPhcDocument);
router.get('/documents/:id/pdf', phc_controller_1.downloadPhcPdf);
router.get('/documents/:id', phc_controller_1.getPhcDocumentById);
router.patch('/documents/:id/status', phc_controller_1.updatePhcStatus);
router.delete('/documents/:id', phc_controller_1.deletePhcDocument);
exports.default = router;
//# sourceMappingURL=phc.routes.js.map