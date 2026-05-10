/**
 * database.controller.ts
 * Handles the Oracle-Core "Database" module endpoints:
 *   - Bot Prompts (per funnel)
 *   - Knowledge Base files (per funnel) — with REAL file text extraction
 *   - Collected Leads data
 *   - Verified Documents (media analyses from bot notes)
 */
import { Request, Response } from 'express';
import multer from 'multer';
export declare const knowledgeUpload: multer.Multer;
export declare function getPrompt(req: Request, res: Response): Promise<void>;
export declare function savePrompt(req: Request, res: Response): Promise<void>;
export declare function getKnowledgeFiles(req: Request, res: Response): Promise<void>;
export declare function addKnowledgeFile(req: Request, res: Response): Promise<void>;
export declare function deleteKnowledgeFile(req: Request, res: Response): Promise<void>;
export declare function getCollectedLeads(req: Request, res: Response): Promise<void>;
export declare function getVerifiedDocuments(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=database.controller.d.ts.map