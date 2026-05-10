"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const env_1 = require("../config/env");
function errorHandler(err, req, res, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
_next) {
    const isDev = env_1.config.nodeEnv === 'development';
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
//# sourceMappingURL=errorHandler.js.map