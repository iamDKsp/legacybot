import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../config/database';

// ── Validation Schemas ────────────────────────────────────────
const createUserSchema = z.object({
    name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
    email: z.string().email('E-mail inválido'),
    password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
    role: z.enum(['admin', 'assessor']).default('assessor'),
});

const updateUserSchema = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
    role: z.enum(['admin', 'assessor']).optional(),
    is_active: z.union([z.boolean(), z.number()]).optional(),
});

// ── List all users ────────────────────────────────────────────
export async function listUsers(_req: Request, res: Response): Promise<void> {
    try {
        const users = await db('users')
            .select('id', 'name', 'email', 'role', 'avatar_url', 'is_active', 'created_at', 'updated_at')
            .orderBy('created_at', 'desc');

        res.json({ success: true, data: users });
    } catch (err) {
        console.error('List users error:', err);
        res.status(500).json({ success: false, error: 'Erro ao listar usuários' });
    }
}

// ── Create user ───────────────────────────────────────────────
export async function createUser(req: Request, res: Response): Promise<void> {
    const result = createUserSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos', details: result.error.errors });
        return;
    }

    const { name, email, password, role } = result.data;

    try {
        // Check if email already exists
        const existing = await db('users').where('email', email).first();
        if (existing) {
            res.status(409).json({ success: false, error: 'Já existe um usuário com este e-mail' });
            return;
        }

        const password_hash = await bcrypt.hash(password, 10);

        const [id] = await db('users').insert({
            name,
            email,
            password_hash,
            role,
            is_active: 1,
        });

        const user = await db('users')
            .select('id', 'name', 'email', 'role', 'avatar_url', 'is_active', 'created_at')
            .where('id', id)
            .first();

        res.status(201).json({ success: true, data: user });
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ success: false, error: 'Erro ao criar usuário' });
    }
}

// ── Update user ───────────────────────────────────────────────
export async function updateUser(req: Request, res: Response): Promise<void> {
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
        const user = await db('users').where('id', userId).first();
        if (!user) {
            res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            return;
        }

        // Prevent admin from deactivating themselves
        if (updates.is_active !== undefined && !updates.is_active && userId === req.user!.userId) {
            res.status(400).json({ success: false, error: 'Você não pode desativar sua própria conta' });
            return;
        }

        // Build the update payload
        const payload: Record<string, unknown> = {};
        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.email !== undefined) {
            // Check duplicate email
            const existing = await db('users').where('email', updates.email).whereNot('id', userId).first();
            if (existing) {
                res.status(409).json({ success: false, error: 'Já existe outro usuário com este e-mail' });
                return;
            }
            payload.email = updates.email;
        }
        if (updates.role !== undefined) payload.role = updates.role;
        if (updates.is_active !== undefined) payload.is_active = updates.is_active ? 1 : 0;
        if (updates.password) {
            payload.password_hash = await bcrypt.hash(updates.password, 10);
        }

        if (Object.keys(payload).length > 0) {
            await db('users').where('id', userId).update(payload);
        }

        const updated = await db('users')
            .select('id', 'name', 'email', 'role', 'avatar_url', 'is_active', 'created_at', 'updated_at')
            .where('id', userId)
            .first();

        res.json({ success: true, data: updated });
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ success: false, error: 'Erro ao atualizar usuário' });
    }
}

// ── Delete user (soft delete) ─────────────────────────────────
export async function deleteUser(req: Request, res: Response): Promise<void> {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) {
        res.status(400).json({ success: false, error: 'ID inválido' });
        return;
    }

    try {
        // Prevent self-deletion
        if (userId === req.user!.userId) {
            res.status(400).json({ success: false, error: 'Você não pode excluir sua própria conta' });
            return;
        }

        const user = await db('users').where('id', userId).first();
        if (!user) {
            res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            return;
        }

        // Soft delete
        await db('users').where('id', userId).update({ is_active: 0 });

        res.json({ success: true, message: 'Usuário desativado com sucesso' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ success: false, error: 'Erro ao excluir usuário' });
    }
}
