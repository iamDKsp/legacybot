import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { JwtPayload } from '../types';

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query.token && typeof req.query.token === 'string') {
        token = req.query.token;
    }

    if (!token) {
        res.status(401).json({ success: false, error: 'Token de autenticação não fornecido' });
        return;
    }

    try {
        const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
        req.user = decoded;
        next();
    } catch {
        res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
    }
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!req.user || req.user.role !== 'admin') {
        res.status(403).json({ success: false, error: 'Acesso restrito a administradores' });
        return;
    }
    next();
}
