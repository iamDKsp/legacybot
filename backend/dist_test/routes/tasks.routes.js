"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tasks_controller_1 = require("../controllers/tasks.controller");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
router.get('/', tasks_controller_1.getTasks);
router.post('/', tasks_controller_1.createTask);
router.put('/:id', tasks_controller_1.updateTask);
router.patch('/:id/toggle', tasks_controller_1.toggleTaskStatus);
router.delete('/:id', tasks_controller_1.deleteTask);
exports.default = router;
//# sourceMappingURL=tasks.routes.js.map