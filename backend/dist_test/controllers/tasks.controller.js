"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTasks = getTasks;
exports.createTask = createTask;
exports.updateTask = updateTask;
exports.toggleTaskStatus = toggleTaskStatus;
exports.deleteTask = deleteTask;
const zod_1 = require("zod");
const database_1 = require("../config/database");
const activity_service_1 = require("../services/activity.service");
const createTaskSchema = zod_1.z.object({
    lead_id: zod_1.z.number().int().positive(),
    title: zod_1.z.string().min(2, 'Título deve ter no mínimo 2 caracteres'),
    description: zod_1.z.string().optional(),
    category: zod_1.z.enum(['ligacao', 'documento', 'reuniao', 'prazo', 'outro']).default('outro'),
    priority: zod_1.z.enum(['alta', 'media', 'baixa']).default('media'),
    due_date: zod_1.z.string().optional(),
    assigned_to: zod_1.z.number().int().positive().optional(),
});
const updateTaskSchema = zod_1.z.object({
    title: zod_1.z.string().min(2).optional(),
    description: zod_1.z.string().optional(),
    category: zod_1.z.enum(['ligacao', 'documento', 'reuniao', 'prazo', 'outro']).optional(),
    priority: zod_1.z.enum(['alta', 'media', 'baixa']).optional(),
    status: zod_1.z.enum(['pendente', 'em_andamento', 'concluida']).optional(),
    due_date: zod_1.z.string().optional(),
    assigned_to: zod_1.z.number().int().positive().optional(),
});
async function getTasks(req, res) {
    try {
        const { lead_id, status, priority, funnel_id, page = '1', limit = '50' } = req.query;
        let query = (0, database_1.db)('tasks as t')
            .select('t.*', 'l.name as lead_name', 'l.phone as lead_phone', 'f.name as funnel_name', 'f.color as funnel_color', 'u.name as assigned_user_name')
            .leftJoin('leads as l', 't.lead_id', 'l.id')
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .leftJoin('users as u', 't.assigned_to', 'u.id')
            .orderByRaw(`CASE t.priority WHEN 'alta' THEN 1 WHEN 'media' THEN 2 WHEN 'baixa' THEN 3 ELSE 4 END`)
            .orderBy('t.due_date', 'asc')
            .orderBy('t.created_at', 'desc');
        if (lead_id)
            query = query.where('t.lead_id', Number(lead_id));
        if (status)
            query = query.where('t.status', String(status));
        if (priority)
            query = query.where('t.priority', String(priority));
        if (funnel_id)
            query = query.where('l.funnel_id', Number(funnel_id));
        const pageNum = parseInt(String(page), 10);
        const limitNum = parseInt(String(limit), 10);
        const offset = (pageNum - 1) * limitNum;
        const tasks = await query.limit(limitNum).offset(offset);
        res.json({ success: true, data: tasks });
    }
    catch (err) {
        console.error('Get tasks error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar tarefas' });
    }
}
async function createTask(req, res) {
    const result = createTaskSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos', details: result.error.errors });
        return;
    }
    try {
        const [{ id }] = await (0, database_1.db)('tasks').insert({
            ...result.data,
            created_by: req.user.userId,
        }).returning('id');
        const task = await (0, database_1.db)('tasks as t')
            .select('t.*', 'l.name as lead_name', 'f.name as funnel_name', 'f.color as funnel_color')
            .leftJoin('leads as l', 't.lead_id', 'l.id')
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .where('t.id', id)
            .first();
        await (0, activity_service_1.logActivity)({
            user_id: req.user?.userId,
            lead_id: result.data.lead_id,
            action: 'task_created',
            entity_type: 'task',
            entity_id: id,
            new_value: task,
        });
        res.status(201).json({ success: true, data: task });
    }
    catch (err) {
        console.error('Create task error:', err);
        res.status(500).json({ success: false, error: 'Erro ao criar tarefa' });
    }
}
async function updateTask(req, res) {
    const result = updateTaskSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos', details: result.error.errors });
        return;
    }
    const { id } = req.params;
    try {
        const existing = await (0, database_1.db)('tasks').where({ id: Number(id) }).first();
        if (!existing) {
            res.status(404).json({ success: false, error: 'Tarefa não encontrada' });
            return;
        }
        const updateData = {
            ...result.data,
            ...(result.data.status === 'concluida' ? { completed_at: new Date() } : {}),
        };
        await (0, database_1.db)('tasks').where({ id: Number(id) }).update(updateData);
        const updated = await (0, database_1.db)('tasks as t')
            .select('t.*', 'l.name as lead_name', 'f.name as funnel_name', 'f.color as funnel_color')
            .leftJoin('leads as l', 't.lead_id', 'l.id')
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .where('t.id', Number(id))
            .first();
        res.json({ success: true, data: updated });
    }
    catch (err) {
        console.error('Update task error:', err);
        res.status(500).json({ success: false, error: 'Erro ao atualizar tarefa' });
    }
}
async function toggleTaskStatus(req, res) {
    const { id } = req.params;
    try {
        const task = await (0, database_1.db)('tasks').where({ id: Number(id) }).first();
        if (!task) {
            res.status(404).json({ success: false, error: 'Tarefa não encontrada' });
            return;
        }
        const newStatus = task.status === 'concluida' ? 'pendente' : 'concluida';
        await (0, database_1.db)('tasks').where({ id: Number(id) }).update({
            status: newStatus,
            completed_at: newStatus === 'concluida' ? new Date() : null,
        });
        res.json({ success: true, data: { status: newStatus } });
    }
    catch (err) {
        console.error('Toggle task error:', err);
        res.status(500).json({ success: false, error: 'Erro ao alterar status da tarefa' });
    }
}
async function deleteTask(req, res) {
    const { id } = req.params;
    try {
        const deleted = await (0, database_1.db)('tasks').where({ id: Number(id) }).delete();
        if (!deleted) {
            res.status(404).json({ success: false, error: 'Tarefa não encontrada' });
            return;
        }
        res.json({ success: true, message: 'Tarefa excluída com sucesso' });
    }
    catch (err) {
        console.error('Delete task error:', err);
        res.status(500).json({ success: false, error: 'Erro ao excluir tarefa' });
    }
}
//# sourceMappingURL=tasks.controller.js.map