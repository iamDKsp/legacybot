"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.me = me;
exports.changePassword = changePassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const database_1 = require("../config/database");
const env_1 = require("../config/env");
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('E-mail inválido'),
    password: zod_1.z.string().min(1, 'Senha é obrigatória'),
});
async function login(req, res) {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos', details: result.error.errors });
        return;
    }
    const { email, password } = result.data;
    try {
        const user = await (0, database_1.db)('users')
            .where('email', email)
            .where('is_active', true)
            .first();
        if (!user) {
            res.status(401).json({ success: false, error: 'E-mail ou senha incorretos' });
            return;
        }
        const isValidPassword = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isValidPassword) {
            res.status(401).json({ success: false, error: 'E-mail ou senha incorretos' });
            return;
        }
        const payload = { userId: user.id, email: user.email, role: user.role };
        const token = jsonwebtoken_1.default.sign(payload, env_1.config.jwt.secret, {
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
    }
    catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: 'Erro ao realizar login' });
    }
}
async function me(req, res) {
    try {
        const user = await (0, database_1.db)('users')
            .select('id', 'name', 'email', 'role', 'avatar_url', 'created_at')
            .where('id', req.user.userId)
            .first();
        if (!user) {
            res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            return;
        }
        res.json({ success: true, data: user });
    }
    catch (err) {
        console.error('Me error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar usuário' });
    }
}
async function changePassword(req, res) {
    const schema = zod_1.z.object({
        currentPassword: zod_1.z.string().min(1),
        newPassword: zod_1.z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos', details: result.error.errors });
        return;
    }
    const { currentPassword, newPassword } = result.data;
    try {
        const user = await (0, database_1.db)('users').where('id', req.user.userId).first();
        if (!user) {
            res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            return;
        }
        const isValid = await bcryptjs_1.default.compare(currentPassword, user.password_hash);
        if (!isValid) {
            res.status(400).json({ success: false, error: 'Senha atual incorreta' });
            return;
        }
        const newHash = await bcryptjs_1.default.hash(newPassword, 10);
        await (0, database_1.db)('users').where('id', req.user.userId).update({ password_hash: newHash });
        res.json({ success: true, message: 'Senha alterada com sucesso' });
    }
    catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ success: false, error: 'Erro ao alterar senha' });
    }
}
//# sourceMappingURL=auth.controller.js.map