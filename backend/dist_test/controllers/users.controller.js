"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUsers = listUsers;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const database_1 = require("../config/database");
// ── Validation Schemas ────────────────────────────────────────
const createUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
    email: zod_1.z.string().email('E-mail inválido'),
    password: zod_1.z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
    role: zod_1.z.enum(['admin', 'assessor']).default('assessor'),
});
const updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).optional(),
    email: zod_1.z.string().email().optional(),
    password: zod_1.z.string().min(6).optional(),
    role: zod_1.z.enum(['admin', 'assessor']).optional(),
    is_active: zod_1.z.union([zod_1.z.boolean(), zod_1.z.number()]).optional(),
});
// ── List all users ────────────────────────────────────────────
async function listUsers(_req, res) {
    try {
        const users = await (0, database_1.db)('users')
            .select('id', 'name', 'email', 'role', 'avatar_url', 'is_active', 'created_at', 'updated_at')
            .orderBy('created_at', 'desc');
        res.json({ success: true, data: users });
    }
    catch (err) {
        console.error('List users error:', err);
        res.status(500).json({ success: false, error: 'Erro ao listar usuários' });
    }
}
// ── Create user ───────────────────────────────────────────────
async function createUser(req, res) {
    const result = createUserSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos', details: result.error.errors });
        return;
    }
    const { name, email, password, role } = result.data;
    try {
        // Check if email already exists
        const existing = await (0, database_1.db)('users').where('email', email).first();
        if (existing) {
            res.status(409).json({ success: false, error: 'Já existe um usuário com este e-mail' });
            return;
        }
        const password_hash = await bcryptjs_1.default.hash(password, 10);
        const [{ id }] = await (0, database_1.db)('users').insert({
            name,
            email,
            password_hash,
            role,
            is_active: true,
        }).returning('id');
        const user = await (0, database_1.db)('users')
            .select('id', 'name', 'email', 'role', 'avatar_url', 'is_active', 'created_at')
            .where('id', id)
            .first();
        res.status(201).json({ success: true, data: user });
    }
    catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ success: false, error: 'Erro ao criar usuário' });
    }
}
// ── Update user ───────────────────────────────────────────────
async function updateUser(req, res) {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
        res.status(400).json({ success: false, error: 'ID inválido' });
        return;
    }
    const result = updateUserSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos', details: result.error.errors });
        return;
    }
    const updates = result.data;
    try {
        const user = await (0, database_1.db)('users').where('id', userId).first();
        if (!user) {
            res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            return;
        }
        // Prevent admin from deactivating themselves
        if (updates.is_active !== undefined && !updates.is_active && userId === req.user.userId) {
            res.status(400).json({ success: false, error: 'Você não pode desativar sua própria conta' });
            return;
        }
        // Build the update payload
        const payload = {};
        if (updates.name !== undefined)
            payload.name = updates.name;
        if (updates.email !== undefined) {
            // Check duplicate email
            const existing = await (0, database_1.db)('users').where('email', updates.email).whereNot('id', userId).first();
            if (existing) {
                res.status(409).json({ success: false, error: 'Já existe outro usuário com este e-mail' });
                return;
            }
            payload.email = updates.email;
        }
        if (updates.role !== undefined)
            payload.role = updates.role;
        if (updates.is_active !== undefined)
            payload.is_active = Boolean(updates.is_active);
        if (updates.password) {
            payload.password_hash = await bcryptjs_1.default.hash(updates.password, 10);
        }
        if (Object.keys(payload).length > 0) {
            await (0, database_1.db)('users').where('id', userId).update(payload);
        }
        const updated = await (0, database_1.db)('users')
            .select('id', 'name', 'email', 'role', 'avatar_url', 'is_active', 'created_at', 'updated_at')
            .where('id', userId)
            .first();
        res.json({ success: true, data: updated });
    }
    catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ success: false, error: 'Erro ao atualizar usuário' });
    }
}
// ── Delete user (soft delete) ─────────────────────────────────
async function deleteUser(req, res) {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
        res.status(400).json({ success: false, error: 'ID inválido' });
        return;
    }
    try {
        // Prevent self-deletion
        if (userId === req.user.userId) {
            res.status(400).json({ success: false, error: 'Você não pode excluir sua própria conta' });
            return;
        }
        const user = await (0, database_1.db)('users').where('id', userId).first();
        if (!user) {
            res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            return;
        }
        // Soft delete
        await (0, database_1.db)('users').where('id', userId).update({ is_active: false });
        res.json({ success: true, message: 'Usuário desativado com sucesso' });
    }
    catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ success: false, error: 'Erro ao excluir usuário' });
    }
}
//# sourceMappingURL=users.controller.js.map