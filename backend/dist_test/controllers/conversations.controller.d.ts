import { Request, Response } from 'express';
export declare function handleWebhook(req: Request, res: Response): Promise<void>;
export declare function connectWhatsApp(req: Request, res: Response): Promise<void>;
export declare function disconnectWhatsApp(_req: Request, res: Response): Promise<void>;
export declare function getQRCode(_req: Request, res: Response): Promise<void>;
export declare function getConnectionStatus(_req: Request, res: Response): Promise<void>;
/** PATCH /api/leads/:id/bot — toggle bot on/off for a specific lead */
export declare function toggleLeadBot(req: Request, res: Response): Promise<void>;
/** GET /api/bot/memory — list all bot memory patterns */
export declare function getBotMemory(req: Request, res: Response): Promise<void>;
/** POST /api/bot/memory — manually add a memory pattern */
export declare function addBotMemory(req: Request, res: Response): Promise<void>;
/** DELETE /api/bot/memory/:id — disable a memory pattern */
export declare function deleteBotMemory(req: Request, res: Response): Promise<void>;
/** GET /api/bot/handoffs — list pending handoffs for assessors */
export declare function getHandoffs(req: Request, res: Response): Promise<void>;
/** PATCH /api/bot/handoffs/:id/acknowledge — mark handoff as seen */
export declare function acknowledgeHandoff(req: Request, res: Response): Promise<void>;
/** POST /api/webhook/whatsapp/test — send a test WhatsApp message */
export declare function sendTestMessage(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=conversations.controller.d.ts.map