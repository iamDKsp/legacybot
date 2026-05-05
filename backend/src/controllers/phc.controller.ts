import { Request, Response } from 'express';
import { db } from '../config/database';
import { generatePhcPdfBuffer } from '../services/phc-pdf.service';

// ============================================================
// PHC Lawyers — CRUD
// ============================================================

export const getLawyers = async (_req: Request, res: Response): Promise<void> => {
    try {
        const lawyers = await db('phc_lawyers').orderBy('name', 'asc');
        res.json({ success: true, data: lawyers });
    } catch (err) {
        console.error('[PHC] getLawyers error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar advogados' });
    }
};

export const createLawyer = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, oab, cpf, email, phone, address, city, state, additional_info } = req.body;

        if (!name || !oab) {
            res.status(400).json({ success: false, error: 'Nome e OAB são obrigatórios' });
            return;
        }

        const [{ id }] = await db('phc_lawyers').insert({ name, oab, cpf, email, phone, address, city, state, additional_info }).returning('id');
        const lawyer = await db('phc_lawyers').where({ id }).first();
        res.status(201).json({ success: true, data: lawyer });
    } catch (err) {
        console.error('[PHC] createLawyer error:', err);
        res.status(500).json({ success: false, error: 'Erro ao criar advogado' });
    }
};

export const updateLawyer = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id, 10);
        const { name, oab, cpf, email, phone, address, city, state, additional_info } = req.body;

        await db('phc_lawyers').where({ id }).update({ name, oab, cpf, email, phone, address, city, state, additional_info });
        const lawyer = await db('phc_lawyers').where({ id }).first();

        if (!lawyer) {
            res.status(404).json({ success: false, error: 'Advogado não encontrado' });
            return;
        }

        res.json({ success: true, data: lawyer });
    } catch (err) {
        console.error('[PHC] updateLawyer error:', err);
        res.status(500).json({ success: false, error: 'Erro ao atualizar advogado' });
    }
};

export const deleteLawyer = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id, 10);

        // Verify no PHC docs reference this lawyer
        const docCount = await db('phc_documents').where({ lawyer_id: id }).count('id as c').first() as { c: string };
        if (parseInt(docCount.c, 10) > 0) {
            res.status(409).json({ success: false, error: 'Este advogado possui PHCs vinculados e não pode ser removido' });
            return;
        }

        await db('phc_lawyers').where({ id }).delete();
        res.json({ success: true, message: 'Advogado removido' });
    } catch (err) {
        console.error('[PHC] deleteLawyer error:', err);
        res.status(500).json({ success: false, error: 'Erro ao remover advogado' });
    }
};

// ============================================================
// PHC Documents — CRUD
// ============================================================

export const getPhcDocuments = async (req: Request, res: Response): Promise<void> => {
    try {
        const { lead_id, funnel_slug, status } = req.query;

        let query = db('phc_documents as pd')
            .join('leads as l', 'pd.lead_id', 'l.id')
            .join('phc_lawyers as pl', 'pd.lawyer_id', 'pl.id')
            .select(
                'pd.*',
                'l.name as lead_name',
                'l.phone as lead_phone',
                'l.cpf as lead_cpf',
                'l.address as lead_address',
                'l.city as lead_city',
                'l.state as lead_state',
                'pl.name as lawyer_name',
                'pl.oab as lawyer_oab'
            )
            .orderBy('pd.created_at', 'desc');

        if (lead_id) query = query.where('pd.lead_id', lead_id);
        if (funnel_slug) query = query.where('pd.funnel_slug', funnel_slug);
        if (status) query = query.where('pd.status', status);

        const docs = await query;
        res.json({ success: true, data: docs });
    } catch (err) {
        console.error('[PHC] getPhcDocuments error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar PHCs' });
    }
};

export const getPhcDocumentById = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id, 10);

        const doc = await db('phc_documents as pd')
            .join('leads as l', 'pd.lead_id', 'l.id')
            .join('phc_lawyers as pl', 'pd.lawyer_id', 'pl.id')
            .join('funnels as f', 'l.funnel_id', 'f.id')
            .select(
                'pd.*',
                // Lead — all fields needed for PDF generation
                'l.name as lead_name', 'l.phone as lead_phone', 'l.cpf as lead_cpf',
                'l.email as lead_email', 'l.description as lead_description',
                'l.address as lead_address', 'l.city as lead_city', 'l.state as lead_state',
                'l.rg as lead_rg', 'l.marital_status as lead_marital_status',
                'l.nationality as lead_nationality', 'l.birthdate as lead_birthdate',
                // Funnel
                'f.name as funnel_name', 'f.slug as funnel_slug',
                // Lawyer — all fields needed for PDF generation
                'pl.name as lawyer_name', 'pl.oab as lawyer_oab', 'pl.cpf as lawyer_cpf',
                'pl.email as lawyer_email', 'pl.phone as lawyer_phone',
                'pl.address as lawyer_address', 'pl.city as lawyer_city',
                'pl.state as lawyer_state', 'pl.additional_info as lawyer_additional_info'
            )
            .where('pd.id', id)
            .first();

        if (!doc) {
            res.status(404).json({ success: false, error: 'PHC não encontrado' });
            return;
        }

        res.json({ success: true, data: doc });
    } catch (err) {
        console.error('[PHC] getPhcDocumentById error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar PHC' });
    }
};

export const createPhcDocument = async (req: Request, res: Response): Promise<void> => {
    try {
        const { lead_id, lawyer_id, doc_type, funnel_slug, notes } = req.body;

        if (!lead_id || !lawyer_id || !doc_type) {
            res.status(400).json({ success: false, error: 'lead_id, lawyer_id e doc_type são obrigatórios' });
            return;
        }

        const [{ id }] = await db('phc_documents').insert({
            lead_id,
            lawyer_id,
            doc_type,
            funnel_slug,
            notes,
            status: 'rascunho',
        }).returning('id');

        const doc = await db('phc_documents as pd')
            .join('leads as l', 'pd.lead_id', 'l.id')
            .join('phc_lawyers as pl', 'pd.lawyer_id', 'pl.id')
            .select('pd.*', 'l.name as lead_name', 'pl.name as lawyer_name')
            .where('pd.id', id)
            .first();

        res.status(201).json({ success: true, data: doc });
    } catch (err) {
        console.error('[PHC] createPhcDocument error:', err);
        res.status(500).json({ success: false, error: 'Erro ao criar PHC' });
    }
};

export const updatePhcStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id, 10);
        const { status } = req.body;

        const allowed = ['rascunho', 'salvo', 'baixado'];
        if (!allowed.includes(status)) {
            res.status(400).json({ success: false, error: 'Status inválido' });
            return;
        }

        await db('phc_documents').where({ id }).update({ status });
        const doc = await db('phc_documents').where({ id }).first();

        res.json({ success: true, data: doc });
    } catch (err) {
        console.error('[PHC] updatePhcStatus error:', err);
        res.status(500).json({ success: false, error: 'Erro ao atualizar status do PHC' });
    }
};

export const deletePhcDocument = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseInt(req.params.id, 10);
        await db('phc_documents').where({ id }).delete();
        res.json({ success: true, message: 'PHC removido' });
    } catch (err) {
        console.error('[PHC] deletePhcDocument error:', err);
        res.status(500).json({ success: false, error: 'Erro ao remover PHC' });
    }
};

// ============================================================
// PHC Documents — PDF Generation & Download
// ============================================================

export const downloadPhcPdf = async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10);

    try {
        // Fetch full document with all lead and lawyer data
        const doc = await db('phc_documents as pd')
            .join('leads as l', 'pd.lead_id', 'l.id')
            .join('phc_lawyers as pl', 'pd.lawyer_id', 'pl.id')
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .select(
                'pd.id', 'pd.doc_type', 'pd.status', 'pd.notes', 'pd.file_path',
                // Lead data
                'l.name as lead_name', 'l.phone as lead_phone', 'l.cpf as lead_cpf',
                'l.email as lead_email', 'l.description as lead_description',
                'l.address as lead_address', 'l.city as lead_city', 'l.state as lead_state',
                'l.rg as lead_rg', 'l.marital_status as lead_marital_status',
                'l.nationality as lead_nationality', 'l.birthdate as lead_birthdate',
                // Funnel
                'f.name as funnel_name',
                // Lawyer data
                'pl.name as lawyer_name', 'pl.oab as lawyer_oab', 'pl.cpf as lawyer_cpf',
                'pl.address as lawyer_address', 'pl.city as lawyer_city',
                'pl.state as lawyer_state', 'pl.additional_info as lawyer_additional_info'
            )
            .where('pd.id', id)
            .first() as Record<string, unknown> | undefined;

        if (!doc) {
            res.status(404).json({ success: false, error: 'PHC não encontrado' });
            return;
        }

        const lead = {
            name:           String(doc.lead_name || ''),
            cpf:            doc.lead_cpf            as string | null,
            rg:             doc.lead_rg             as string | null,
            marital_status: doc.lead_marital_status as string | null,
            nationality:    doc.lead_nationality    as string | null,
            address:        doc.lead_address        as string | null,
            city:           doc.lead_city           as string | null,
            state:          doc.lead_state          as string | null,
            phone:          doc.lead_phone          as string | null,
            email:          doc.lead_email          as string | null,
            description:    doc.lead_description    as string | null,
            funnel_name:    doc.funnel_name         as string | null,
            birthdate:      doc.lead_birthdate      as string | null,
        };

        const lawyer = {
            name:            String(doc.lawyer_name || ''),
            oab:             String(doc.lawyer_oab  || ''),
            cpf:             doc.lawyer_cpf             as string | null,
            address:         doc.lawyer_address         as string | null,
            city:            doc.lawyer_city            as string | null,
            state:           doc.lawyer_state           as string | null,
            additional_info: doc.lawyer_additional_info as string | null,
        };

        // Gera PDF em memória — sem salvar em disco (Railway filesystem é efêmero)
        const pdfBuffer = await generatePhcPdfBuffer(
            doc.doc_type as 'procuracao' | 'declaracao_hipo' | 'contrato',
            lead,
            lawyer,
            doc.notes as string | null
        );

        // Marca como 'baixado'
        await db('phc_documents').where({ id }).update({ status: 'baixado' });

        const docTypeLabels: Record<string, string> = {
            procuracao:      'Procuracao',
            declaracao_hipo: 'Declaracao_Hipossuficiencia',
            contrato:        'Contrato_Honorarios',
        };
        const label    = docTypeLabels[String(doc.doc_type)] ?? 'Documento';
        const leadName = String(doc.lead_name || 'cliente').replace(/\s+/g, '_');
        const filename = `PHC_${label}_${leadName}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length.toString());
        res.setHeader('Cache-Control', 'private, no-cache');
        res.end(pdfBuffer);
    } catch (err) {
        console.error('[PHC] downloadPhcPdf error:', err);
        res.status(500).json({ success: false, error: 'Erro ao gerar ou baixar o PDF do PHC' });
    }
};
