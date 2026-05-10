import { Request, Response, NextFunction } from 'express';
export declare function errorHandler(err: Error & {
    status?: number;
    code?: string;
}, req: Request, res: Response, _next: NextFunction): void;
//# sourceMappingURL=errorHandler.d.ts.map