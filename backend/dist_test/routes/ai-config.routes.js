"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ai_config_controller_1 = require("../controllers/ai-config.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET  /api/ai-config — Read all humanization settings
router.get('/', auth_1.authMiddleware, ai_config_controller_1.getAIConfig);
// PUT  /api/ai-config — Update humanization settings
router.put('/', auth_1.authMiddleware, ai_config_controller_1.updateAIConfig);
exports.default = router;
//# sourceMappingURL=ai-config.routes.js.map