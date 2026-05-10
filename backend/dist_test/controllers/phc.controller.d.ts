import { Request, Response } from 'express';
export declare const getLawyers: (_req: Request, res: Response) => Promise<void>;
export declare const createLawyer: (req: Request, res: Response) => Promise<void>;
export declare const updateLawyer: (req: Request, res: Response) => Promise<void>;
export declare const deleteLawyer: (req: Request, res: Response) => Promise<void>;
export declare const getPhcDocuments: (req: Request, res: Response) => Promise<void>;
export declare const getPhcDocumentById: (req: Request, res: Response) => Promise<void>;
export declare const createPhcDocument: (req: Request, res: Response) => Promise<void>;
export declare const updatePhcStatus: (req: Request, res: Response) => Promise<void>;
export declare const deletePhcDocument: (req: Request, res: Response) => Promise<void>;
export declare const downloadPhcPdf: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=phc.controller.d.ts.map