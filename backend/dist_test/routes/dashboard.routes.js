"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboard_controller_1 = require("../controllers/dashboard.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
router.get('/stats', dashboard_controller_1.getStats);
router.get('/charts', dashboard_controller_1.getCharts);
exports.default = router;
//# sourceMappingURL=dashboard.routes.js.map