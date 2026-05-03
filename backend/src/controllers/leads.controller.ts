import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { Lead } from '../types';
import { logActivity } from '../services/activity.service';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

// ── Document requirements per funnel (mirrors webhook.controller.ts) ──────────
const DOCS_REQUIRED_BY_AREA: Record<string, string[]> = {
    trabalhista:         ['RG', 'Comprovante de Residência', 'Holerite', 'Carteira de Trabalho'],
    negativado:          ['RG', 'Comprovante de Residência'],
    'golpe-cibernetico': ['RG', 'Comprovante de Residência', 'Prints de Fraude'],
    'golpe-pix':         ['RG', 'Comprovante de Residência', 'Comprovante Pix'],
    default:             ['RG', 'Comprovante de Residência'],
};
const IDENTITY_DOCS = ['RG', 'CNH'];
function satisfySlot(received: string, required: string): boolean {
    // Normalize: strip suffixes like "(frente)", "(verso)", "[Ilegível]" etc.
    const base = received.replace(/\s*[\(\[].*[\)\]]$/, '').trim();
    if (base === required) return true;
    if (IDENTITY_DOCS.includes(base) && IDENTITY_DOCS.includes(required)) return true;
    return false;
}

const createLeadSchema = z.object({
    name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
    phone: z.string().min(10, 'Telefone inválido'),
    email: z.string().email().optional().or(z.literal('')),
    cpf: z.string().optional(),
    origin: z.enum(['whatsapp', 'manual', 'instagram', 'site']).default('manual'),
    funnel_id: z.number().int().positive(),
    stage_id: z.number().int().positive().optional(),
    description: z.string().optional(),
    assigned_to: z.number().int().positive().optional(),
});

// Update schema also accepts PHC/juridical complement fields (not required on create)
const updateLeadSchema = createLeadSchema.partial().extend({
    address:        z.string().optional(),
    city:           z.string().optional(),
    state:          z.string().max(2).optional(),
    rg:             z.string().optional(),
    marital_status: z.enum(['solteiro','casado','divorciado','viuvo','outro']).optional(),
    nationality:    z.string().optional(),
    birthdate:      z.string().optional(), // ISO date string "YYYY-MM-DD"
});


export async function getLeads(req: Request, res: Response): Promise<void> {
    try {
        const {
            funnel_id,
            stage_id,
            status,
            search,
            assigned_to,
            page = '1',
            limit = '100',
        } = req.query;

        let query = db('leads as l')
            .select(
                'l.*',
                'f.name as funnel_name',
                'f.slug as funnel_slug',
                'f.color as funnel_color',
                's.name as stage_name',
                's.slug as stage_slug',
                's.display_order as stage_order',
                'u.name as assigned_user_name',
                'u.email as assigned_user_email'
            )
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .leftJoin('stages as s', 'l.stage_id', 's.id')
            .leftJoin('users as u', 'l.assigned_to', 'u.id')
            .orderBy('l.updated_at', 'desc');

        if (funnel_id) query = query.where('l.funnel_id', Number(funnel_id));
        if (stage_id) query = query.where('l.stage_id', Number(stage_id));
        if (status) query = query.where('l.status', String(status));
        if (assigned_to) query = query.where('l.assigned_to', Number(assigned_to));

        if (search) {
            const term = `%${String(search)}%`;
            query = query.where((builder) => {
                builder
                    .where('l.name',  'like', term)
                    .orWhere('l.phone', 'like', term)
                    .orWhere('l.cpf',   'like', term)
                    .orWhere('l.email', 'like', term);
            });
        }



        const pageNum = parseInt(String(page), 10);
        const limitNum = parseInt(String(limit), 10);
        const offset = (pageNum - 1) * limitNum;

        const countQuery = db('leads as l').count('l.id as total');
        if (funnel_id) countQuery.where('l.funnel_id', Number(funnel_id));
        if (stage_id) countQuery.where('l.stage_id', Number(stage_id));
        if (status) countQuery.where('l.status', String(status));

        const [countResult] = await countQuery;
        const total = Number((countResult as Record<string, unknown>).total || 0);

        const leads = await query.limit(limitNum).offset(offset);

        res.json({
            success: true,
            data: leads,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (err) {
        console.error('Get leads error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar leads' });
    }
}

export async function getLeadById(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;

        const lead = await db('leads as l')
            .select(
                'l.*',
                'f.name as funnel_name',
                'f.slug as funnel_slug',
                'f.color as funnel_color',
                's.name as stage_name',
                's.slug as stage_slug',
                'u.name as assigned_user_name'
            )
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .leftJoin('stages as s', 'l.stage_id', 's.id')
            .leftJoin('users as u', 'l.assigned_to', 'u.id')
            .where('l.id', Number(id))
            .first();

        if (!lead) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }

        res.json({ success: true, data: lead });
    } catch (err) {
        console.error('Get lead error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar lead' });
    }
}

export async function createLead(req: Request, res: Response): Promise<void> {
    const result = createLeadSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos', details: result.error.errors });
        return;
    }

    try {
        // Default stage to "recebido" (id=1) if not provided
        const stageId = result.data.stage_id || 1;

        const [id] = await db('leads').insert({
            ...result.data,
            stage_id: stageId,
            email: result.data.email || null,
        });

        const lead = await db('leads as l')
            .select('l.*', 'f.name as funnel_name', 'f.color as funnel_color', 's.name as stage_name')
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .leftJoin('stages as s', 'l.stage_id', 's.id')
            .where('l.id', id)
            .first();

        await logActivity({
            user_id: req.user?.userId,
            lead_id: id,
            action: 'lead_created',
            entity_type: 'lead',
            entity_id: id,
            new_value: lead,
        });

        res.status(201).json({ success: true, data: lead });
    } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ success: false, error: 'Já existe um lead com este telefone' });
            return;
        }
        console.error('Create lead error:', err);
        res.status(500).json({ success: false, error: 'Erro ao criar lead' });
    }
}

export async function updateLead(req: Request, res: Response): Promise<void> {
    const result = updateLeadSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos', details: result.error.errors });
        return;
    }

    const { id } = req.params;

    try {
        const existing = await db<Lead>('leads').where({ id: Number(id) }).first();
        if (!existing) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }

        await db('leads').where({ id: Number(id) }).update(result.data);

        const updated = await db('leads as l')
            .select('l.*', 'f.name as funnel_name', 'f.color as funnel_color', 's.name as stage_name')
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .leftJoin('stages as s', 'l.stage_id', 's.id')
            .where('l.id', Number(id))
            .first();

        await logActivity({
            user_id: req.user?.userId,
            lead_id: Number(id),
            action: 'lead_updated',
            entity_type: 'lead',
            entity_id: Number(id),
            old_value: existing,
            new_value: result.data,
        });

        res.json({ success: true, data: updated });
    } catch (err) {
        console.error('Update lead error:', err);
        res.status(500).json({ success: false, error: 'Erro ao atualizar lead' });
    }
}

export async function updateLeadStage(req: Request, res: Response): Promise<void> {
    const schema = z.object({ stage_id: z.number().int().positive() });
    const result = schema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'stage_id inválido' });
        return;
    }

    const { id } = req.params;
    try {
        const existing = await db<Lead>('leads').where({ id: Number(id) }).first();
        if (!existing) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }

        const stage = await db('stages').where({ id: result.data.stage_id }).first();
        if (!stage) {
            res.status(400).json({ success: false, error: 'Estágio inválido' });
            return;
        }

        await db('leads').where({ id: Number(id) }).update({ stage_id: result.data.stage_id });

        await logActivity({
            user_id: req.user?.userId,
            lead_id: Number(id),
            action: 'stage_changed',
            entity_type: 'lead',
            entity_id: Number(id),
            old_value: { stage_id: existing.stage_id },
            new_value: { stage_id: result.data.stage_id, stage_name: stage.name },
        });

        res.json({ success: true, message: `Lead movido para: ${stage.name}` });
    } catch (err) {
        console.error('Update stage error:', err);
        res.status(500).json({ success: false, error: 'Erro ao atualizar estágio' });
    }
}

export async function updateLeadStatus(req: Request, res: Response): Promise<void> {
    const schema = z.object({
        status: z.enum(['active', 'approved', 'rejected', 'archived']),
        verdict_notes: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos' });
        return;
    }

    const { id } = req.params;
    try {
        const existing = await db<Lead>('leads').where({ id: Number(id) }).first();
        if (!existing) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }

        await db('leads').where({ id: Number(id) }).update(result.data);

        await logActivity({
            user_id: req.user?.userId,
            lead_id: Number(id),
            action: 'status_changed',
            entity_type: 'lead',
            entity_id: Number(id),
            old_value: { status: existing.status },
            new_value: result.data,
        });

        res.json({ success: true, message: 'Status atualizado com sucesso' });
    } catch (err) {
        console.error('Update status error:', err);
        res.status(500).json({ success: false, error: 'Erro ao atualizar status' });
    }
}

// ── Funnel display labels ────────────────────────────────────────────────────
const FUNNEL_LABELS: Record<string, string> = {
    trabalhista:         'Trabalhista',
    negativado:          'Cliente Negativado',
    'golpe-pix':         'Golpe do Pix',
    'golpe-cibernetico': 'Golpe Cibernético',
    default:             'Geral',
};

// ── Checklist: document collection progress per lead ─────────────────────────
export async function getLeadChecklist(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
        const lead = await db('leads as l')
            .select(
                'l.id', 'l.name', 'l.phone', 'l.cpf', 'l.address',
                'f.slug as funnel_slug'
            )
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .where('l.id', Number(id))
            .first() as {
                id: number;
                name: string | null;
                phone: string | null;
                cpf: string | null;
                address: string | null;
                funnel_slug: string | null;
            } | undefined;

        if (!lead) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }

        const funnelSlug = lead.funnel_slug ?? 'default';

        // ── Section 1: Standard fields (all funnels) ─────────────────────────
        const hasRealName = lead.name && !/^\d+$/.test(String(lead.name).trim()) && lead.name !== lead.phone;
        const standardFields = [
            { key: 'phone',   label: 'Telefone', value: lead.phone   || null, filled: !!lead.phone },
            { key: 'name',    label: 'Nome',     value: hasRealName ? lead.name : null, filled: !!hasRealName },
            { key: 'cpf',     label: 'CPF',      value: lead.cpf     || null, filled: !!lead.cpf },
            { key: 'address', label: 'Endereço', value: lead.address || null, filled: !!lead.address },
        ];

        // ── Section 2: Flow-specific documents ───────────────────────────────
        const required = DOCS_REQUIRED_BY_AREA[funnelSlug] ?? DOCS_REQUIRED_BY_AREA['default'];

        const approvedDocs = await db('documents')
            .where({ lead_id: Number(id), status: 'aprovado' })
            .select('name') as Array<{ name: string }>;

        const received = approvedDocs.map(d => d.name).filter(Boolean);

        const flowItems = required.map(req => ({
            name: req,
            received: received.some(rec => satisfySlot(rec, req)),
        }));

        const receivedCount = flowItems.filter(i => i.received).length;
        const totalCount    = flowItems.length;
        const complete      = receivedCount === totalCount && standardFields.every(f => f.filled);

        res.json({
            success: true,
            data: {
                standardFields,
                funnelSlug,
                funnelLabel: FUNNEL_LABELS[funnelSlug] ?? funnelSlug,
                flowItems,
                receivedCount,
                totalCount,
                complete,
            },
        });
    } catch (err) {
        console.error('Get checklist error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar checklist' });
    }
}
export async function toggleBotStatus(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
        const lead = await db<Lead>('leads').where({ id: Number(id) }).first();
        if (!lead) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }

        const newValue = !lead.bot_active;
        await db('leads').where({ id: Number(id) }).update({ bot_active: newValue });

        res.json({ success: true, data: { bot_active: newValue } });
    } catch (err) {
        console.error('Toggle bot error:', err);
        res.status(500).json({ success: false, error: 'Erro ao alterar status do bot' });
    }
}

export async function deleteLead(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
        const existing = await db<Lead>('leads').where({ id: Number(id) }).first();
        if (!existing) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }

        // Soft delete — marcar como arquivado ao invés de deletar
        await db('leads').where({ id: Number(id) }).update({ status: 'archived' });

        await logActivity({
            user_id: req.user?.userId,
            lead_id: Number(id),
            action: 'lead_archived',
            entity_type: 'lead',
            entity_id: Number(id),
        });

        res.json({ success: true, message: 'Lead arquivado com sucesso' });
    } catch (err) {
        console.error('Delete lead error:', err);
        res.status(500).json({ success: false, error: 'Erro ao arquivar lead' });
    }
}

// Notes for a specific lead
export async function getLeadNotes(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
        const notes = await db('notes as n')
            .select('n.*', 'u.name as author_name')
            .leftJoin('users as u', 'n.author_user_id', 'u.id')
            .where('n.lead_id', Number(id))
            .orderBy('n.created_at', 'asc');

        res.json({ success: true, data: notes });
    } catch (err) {
        console.error('Get notes error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar notas' });
    }
}

export async function createLeadNote(req: Request, res: Response): Promise<void> {
    const schema = z.object({ content: z.string().min(1, 'Conteúdo é obrigatório') });
    const result = schema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Conteúdo é obrigatório' });
        return;
    }

    const { id } = req.params;
    try {
        const [noteId] = await db('notes').insert({
            lead_id: Number(id),
            author_type: 'user',
            author_user_id: req.user!.userId,
            content: result.data.content,
        });

        const note = await db('notes as n')
            .select('n.*', 'u.name as author_name')
            .leftJoin('users as u', 'n.author_user_id', 'u.id')
            .where('n.id', noteId)
            .first();

        res.status(201).json({ success: true, data: note });
    } catch (err) {
        console.error('Create note error:', err);
        res.status(500).json({ success: false, error: 'Erro ao criar nota' });
    }
}

// Documents for a specific lead
export async function getLeadDocuments(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
        const docs = await db('documents').where({ lead_id: Number(id) }).orderBy('created_at', 'desc');

        // Build public download URL for each doc
        const protocol = req.protocol;
        const host = req.get('host') || 'localhost:3001';
        const baseUrl = `${protocol}://${host}`;

        const enriched = docs.map((doc: Record<string, unknown>) => ({
            ...doc,
            // Generate correct download URL (includes lead_id for routing)
            file_url: doc.file_url
                ? doc.file_url
                : doc.file_path
                    ? `${baseUrl}/api/leads/${doc.lead_id}/documents/${doc.id}/download`
                    : null,
        }));

        res.json({ success: true, data: enriched });
    } catch (err) {
        console.error('Get documents error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar documentos' });
    }
}

export async function createLeadDocument(req: Request, res: Response): Promise<void> {
    const schema = z.object({
        name: z.string().min(1),
        file_type: z.string().optional(),
        file_url: z.string().url().optional(),
        status: z.enum(['pendente', 'recebido', 'aprovado', 'rejeitado']).default('pendente'),
        notes: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos' });
        return;
    }

    const { id } = req.params;
    try {
        const [docId] = await db('documents').insert({
            lead_id: Number(id),
            uploaded_by: req.user?.userId,
            ...result.data,
        });

        const doc = await db('documents').where({ id: docId }).first();
        res.status(201).json({ success: true, data: doc });
    } catch (err) {
        console.error('Create document error:', err);
        res.status(500).json({ success: false, error: 'Erro ao criar documento' });
    }
}

// Download a document file by doc ID (/:leadId/documents/:docId/download)
// Supports Auth via Bearer header OR ?token= query param (for <a href> / <img src> links)
export async function downloadDocument(req: Request, res: Response): Promise<void> {
    // ── Auth: accept token via query param as fallback ──────────
    if (!req.headers.authorization) {
        const qToken = req.query.token as string | undefined;
        if (qToken) {
            try {
                const secret = config.jwt.secret;
                const decoded = jwt.verify(qToken, secret);
                if (typeof decoded !== 'string') {
                    (req as Request & { user?: import('../types').JwtPayload }).user = decoded as import('../types').JwtPayload;
                }
            } catch {
                res.status(401).json({ success: false, error: 'Token inválido' });
                return;
            }
        } else {
            res.status(401).json({ success: false, error: 'Não autenticado' });
            return;
        }
    }

    const { docId } = req.params;
    try {
        const doc = await db('documents').where({ id: Number(docId) }).first() as Record<string, unknown> | undefined;
        if (!doc) {
            res.status(404).json({ success: false, error: 'Documento não encontrado' });
            return;
        }

        const filePath = doc.file_path as string | null;
        if (!filePath) {
            res.status(404).json({ success: false, error: 'Arquivo não disponível' });
            return;
        }

        // Use dynamic import to avoid top-level fs import
        const fs = await import('fs');
        const path = await import('path');

        if (!fs.existsSync(filePath)) {
            res.status(404).json({ success: false, error: 'Arquivo não encontrado no servidor' });
            return;
        }

        const ext = path.extname(filePath).replace('.', '').toLowerCase();
        const mimeTypes: Record<string, string> = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
            pdf: 'application/pdf',
        };
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        const docName = (doc.name as string) || 'documento';

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${docName}.${ext}"`);
        // Allow browser to cache images for 1 hour
        res.setHeader('Cache-Control', 'private, max-age=3600');
        fs.createReadStream(filePath).pipe(res);
    } catch (err) {
        console.error('Download document error:', err);
        res.status(500).json({ success: false, error: 'Erro ao baixar documento' });
    }
}


export async function getFunnels(req: Request, res: Response): Promise<void> {
    try {
        const funnels = await db('funnels as f')
            .leftJoin('leads as l', 'f.id', 'l.funnel_id')
            .where('f.is_active', 1)
            .groupBy('f.id')
            .orderBy('f.display_order')
            .select('f.*', db.raw('COUNT(l.id) as lead_count'));
            
        res.json({ success: true, data: funnels });
    } catch (err) {
        console.error('Get funnels error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar funis' });
    }
}

export async function getStages(req: Request, res: Response): Promise<void> {
    try {
        const { funnel_slug } = req.query;
        let stages;

        if (funnel_slug) {
            stages = await db('stages as s')
                .join('funnel_stages as fs', 's.id', 'fs.stage_id')
                .join('funnels as f', 'fs.funnel_id', 'f.id')
                .where('f.slug', funnel_slug as string)
                .select('s.*')
                .orderBy('fs.display_order', 'asc');
        } else {
            stages = await db('stages').orderBy('display_order');
        }

        res.json({ success: true, data: stages });
    } catch (err) {
        console.error('Get stages error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar estágios' });
    }
}
