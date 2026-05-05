import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

export function errorHandler(
    err: Error & { status?: number; code?: string },
    req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: NextFunction
): void {
    const isDev = config.nodeEnv === 'development';

    console.error('[Error]', {
        message: err.message,
        stack: isDev ? err.stack : undefined,
        path: req.path,
        method: req.method,
    });

    // PostgreSQL unique violation (equivalente ao ER_DUP_ENTRY do MySQL)
    if (err.code === '23505' || err.code === 'ER_DUP_ENTRY') {
        res.status(409).json({
            success: false,
            error: 'Registro duplicado. Verifique os dados informados.',
        });
        return;
    }

    // PostgreSQL foreign key violation (equivalente ao ER_NO_REFERENCED_ROW_2 do MySQL)
    if (err.code === '23503' || err.code === 'ER_NO_REFERENCED_ROW_2') {
        res.status(400).json({
            success: false,
            error: 'Referência inválida. Verifique os dados informados.',
        });
        return;
    }

    const status = err.status || 500;
    res.status(status).json({
        success: false,
        error: err.message || 'Erro interno do servidor',
        ...(isDev && { stack: err.stack }),
    });
}
