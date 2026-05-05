import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../config/database';
import { config } from '../config/env';

const loginSchema = z.object({
    email: z.string().email('E-mail inválido'),
    password: z.string().min(1, 'Senha é obrigatória'),
});

export async function login(req: Request, res: Response): Promise<void> {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos', details: result.error.errors });
        return;
    }

    const { email, password } = result.data;

    try {
        const user = await db('users')
            .where('email', email)
            .where('is_active', true)
            .first();

        if (!user) {
            res.status(401).json({ success: false, error: 'E-mail ou senha incorretos' });
            return;
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            res.status(401).json({ success: false, error: 'E-mail ou senha incorretos' });
            return;
        }

        const payload = { userId: user.id, email: user.email, role: user.role };
        const token = jwt.sign(payload, config.jwt.secret, {
            expiresIn: '7d',
        });

        res.json({
            success: true,
            data: {
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    avatar_url: user.avatar_url,
                },
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: 'Erro ao realizar login' });
    }
}

export async function me(req: Request, res: Response): Promise<void> {
    try {
        const user = await db('users')
            .select('id', 'name', 'email', 'role', 'avatar_url', 'created_at')
            .where('id', req.user!.userId)
            .first();

        if (!user) {
            res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            return;
        }

        res.json({ success: true, data: user });
    } catch (err) {
        console.error('Me error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar usuário' });
    }
}

export async function changePassword(req: Request, res: Response): Promise<void> {
    const schema = z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos', details: result.error.errors });
        return;
    }

    const { currentPassword, newPassword } = result.data;

    try {
        const user = await db('users').where('id', req.user!.userId).first();
        if (!user) {
            res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            return;
        }

        const isValid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isValid) {
            res.status(400).json({ success: false, error: 'Senha atual incorreta' });
            return;
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await db('users').where('id', req.user!.userId).update({ password_hash: newHash });

        res.json({ success: true, message: 'Senha alterada com sucesso' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ success: false, error: 'Erro ao alterar senha' });
    }
}
