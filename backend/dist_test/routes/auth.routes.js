"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.post('/login', auth_controller_1.login);
router.get('/me', auth_1.authMiddleware, auth_controller_1.me);
router.put('/change-password', auth_1.authMiddleware, auth_controller_1.changePassword);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map