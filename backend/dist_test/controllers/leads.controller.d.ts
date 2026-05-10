import { Request, Response } from 'express';
export declare function getLeads(req: Request, res: Response): Promise<void>;
export declare function getLeadById(req: Request, res: Response): Promise<void>;
export declare function createLead(req: Request, res: Response): Promise<void>;
export declare function updateLead(req: Request, res: Response): Promise<void>;
export declare function updateLeadStage(req: Request, res: Response): Promise<void>;
export declare function updateLeadStatus(req: Request, res: Response): Promise<void>;
export declare function getLeadChecklist(req: Request, res: Response): Promise<void>;
export declare function toggleBotStatus(req: Request, res: Response): Promise<void>;
export declare function deleteLead(req: Request, res: Response): Promise<void>;
export declare function getLeadNotes(req: Request, res: Response): Promise<void>;
export declare function createLeadNote(req: Request, res: Response): Promise<void>;
export declare function getLeadDocuments(req: Request, res: Response): Promise<void>;
export declare function createLeadDocument(req: Request, res: Response): Promise<void>;
export declare function downloadDocument(req: Request, res: Response): Promise<void>;
export declare function getFunnels(req: Request, res: Response): Promise<void>;
export declare function getStages(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=leads.controller.d.ts.map