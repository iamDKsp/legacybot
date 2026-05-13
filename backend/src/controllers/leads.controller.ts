import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { Lead } from '../types';
import { logActivity } from '../services/activity.service';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { analyzeImage, DocumentType } from '../services/ai.service';
import { extractCPF, extractName } from '../services/learning.service';
import * as fs from 'fs';
import * as path from 'path';

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
    // Legacy single address field (filled by bot via OCR)
    address:        z.string().optional(),
    // Granular address fields (filled manually by assessor)
    street:         z.string().optional(),
    number:         z.string().optional(),
    neighborhood:   z.string().optional(),
    zip_code:       z.string().optional(),
    city:           z.string().optional(),
    state:          z.string().max(2).optional(),
    rg:             z.string().optional(),
    org_emissor:    z.string().optional(),
    uf_emissor:     z.string().max(2).optional(),
    marital_status: z.enum(['solteiro','casado','divorciado','viuvo','outro']).optional(),
    nationality:    z.string().optional(),
    birthdate:      z.string().optional(), // ISO date string "YYYY-MM-DD"
    gender:         z.enum(['M','F']).optional(),
    occupation:     z.string().optional(),
    status:         z.string().optional(),
});


export async function getLeads(req: Request, res: Response): Promise<void> {
    try {
        const {
            funnel_id,
            stage_id,
            status,
            exclude_status,
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
        // status='all' → sem filtro de status (mostra tudo)
        // exclude_status → exclui um status específico (ex: archived)
        if (status && String(status) !== 'all') {
            query = query.where('l.status', String(status));
        } else if (exclude_status) {
            query = query.whereNot('l.status', String(exclude_status));
        }
        if (assigned_to) query = query.where('l.assigned_to', Number(assigned_to));

        if (search) {
            const term = `%${String(search)}%`;
            query = query.where((builder) => {
                builder
                    .where('l.name',  'ilike', term)
                    .orWhere('l.phone', 'ilike', term)
                    .orWhere('l.cpf',   'ilike', term)
                    .orWhere('l.email', 'ilike', term);
            });
        }

        const pageNum = parseInt(String(page), 10);
        const limitNum = parseInt(String(limit), 10);
        const offset = (pageNum - 1) * limitNum;

        const countQuery = db('leads as l').count('l.id as total');
        if (funnel_id) countQuery.where('l.funnel_id', Number(funnel_id));
        if (stage_id) countQuery.where('l.stage_id', Number(stage_id));
        if (status && String(status) !== 'all') countQuery.where('l.status', String(status));
        else if (exclude_status) (countQuery as any).whereNot('l.status', String(exclude_status));

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

        // ── Audit: obter IP do requisitante ────────────────────────────────
        const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
            ?? req.socket?.remoteAddress
            ?? 'unknown';
        const userAgent = req.headers['user-agent'] ?? 'unknown';

        console.log(`[Lead.Create] 🆕 user_id=${req.user?.userId ?? 'anon'} ip=${ipAddress} | Criando lead: ${JSON.stringify(result.data)}`);

        const [{ id }] = await db('leads').insert({
            ...result.data,
            stage_id: stageId,
            email: result.data.email || null,
        }).returning('id');

        const lead = await db('leads as l')
            .select('l.*', 'f.name as funnel_name', 'f.color as funnel_color', 's.name as stage_name')
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .leftJoin('stages as s', 'l.stage_id', 's.id')
            .where('l.id', id)
            .first();

        console.log(`[Lead.Create] ✅ Lead #${id} criado com status='${lead?.status ?? 'unknown'}' | funnel_id=${result.data.funnel_id} stage_id=${stageId}`);

        // Salvar IP no log de atividade para rastrear quem criou
        await db('activity_logs').insert({
            user_id: req.user?.userId ?? null,
            lead_id: id,
            action: 'lead_created',
            entity_type: 'lead',
            entity_id: id,
            new_value: JSON.stringify(lead),
            ip_address: ipAddress,
            user_agent: userAgent,
        }).catch((e: Error) => console.warn('[Lead.Create] activity_log insert failed:', e.message));

        res.status(201).json({ success: true, data: lead });
    } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code === '23505') {
            console.warn(`[Lead.Create] ❌ 23505 Conflito de telefone: ${JSON.stringify(req.body)}`);
            res.status(409).json({ success: false, error: 'Já existe um lead com este telefone' });
            return;
        }
        console.error('[Lead.Create] ❌ Erro inesperado:', err);
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

        // Mover manualmente → desabilitar Sofia automaticamente
        await db('leads').where({ id: Number(id) }).update({
            stage_id: result.data.stage_id,
            bot_active: false,
        });

        const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? 'unknown';
        console.log(`[Lead.StageMove] 🔀 Lead #${id} movido manualmente de stage_id=${existing.stage_id} → stage_id=${result.data.stage_id} (${stage.name}) por user=${req.user?.userId} ip=${ipAddress}. Sofia desabilitada.`);

        await db('activity_logs').insert({
            user_id: req.user?.userId ?? null,
            lead_id: Number(id),
            action: 'stage_changed_manual',
            entity_type: 'lead',
            entity_id: Number(id),
            old_value: JSON.stringify({ stage_id: existing.stage_id, bot_active: existing.bot_active }),
            new_value: JSON.stringify({ stage_id: result.data.stage_id, stage_name: stage.name, bot_active: false }),
            ip_address: ipAddress,
        }).catch((e: Error) => console.warn('[Lead.StageMove] activity_log insert failed:', e.message));

        res.json({ success: true, message: `Lead movido para: ${stage.name}. Sofia desabilitada.` });
    } catch (err) {
        console.error('Update stage error:', err);
        res.status(500).json({ success: false, error: 'Erro ao atualizar estágio' });
    }
}

// PATCH /api/leads/:id/funnel — mover lead para outro funil manualmente
export async function updateLeadFunnel(req: Request, res: Response): Promise<void> {
    const schema = z.object({ funnel_id: z.number().int().positive() });
    const result = schema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'funnel_id inválido' });
        return;
    }

    const { id } = req.params;
    try {
        const existing = await db<Lead>('leads').where({ id: Number(id) }).first();
        if (!existing) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }

        const funnel = await db('funnels').where({ id: result.data.funnel_id }).first();
        if (!funnel) {
            res.status(400).json({ success: false, error: 'Funil inválido' });
            return;
        }

        // Determinar o primeiro estágio do novo funil
        const firstStage = await db('stages as s')
            .join('funnel_stages as fs', 's.id', 'fs.stage_id')
            .where('fs.funnel_id', result.data.funnel_id)
            .orderBy('fs.display_order', 'asc')
            .select('s.id', 's.name', 's.slug')
            .first();

        // Mover para novo funil + primeiro estágio do funil + desabilitar Sofia
        await db('leads').where({ id: Number(id) }).update({
            funnel_id: result.data.funnel_id,
            stage_id: firstStage?.id ?? existing.stage_id,
            bot_active: false,
            // Reset bot_stage para Sofia revisar o contexto ao ser reativada
            bot_stage: 'reception',
        });

        const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? 'unknown';
        console.log(`[Lead.FunnelMove] 🔀 Lead #${id} movido manualmente de funnel_id=${existing.funnel_id} → funnel_id=${result.data.funnel_id} (${funnel.name}) por user=${req.user?.userId} ip=${ipAddress}. Sofia desabilitada. bot_stage resetado para 'reception'.`);

        await db('activity_logs').insert({
            user_id: req.user?.userId ?? null,
            lead_id: Number(id),
            action: 'funnel_changed_manual',
            entity_type: 'lead',
            entity_id: Number(id),
            old_value: JSON.stringify({ funnel_id: existing.funnel_id, stage_id: existing.stage_id, bot_active: existing.bot_active }),
            new_value: JSON.stringify({ funnel_id: result.data.funnel_id, funnel_name: funnel.name, stage_id: firstStage?.id, bot_active: false, bot_stage: 'reception' }),
            ip_address: ipAddress,
        }).catch((e: Error) => console.warn('[Lead.FunnelMove] activity_log insert failed:', e.message));

        res.json({ success: true, message: `Lead movido para funil: ${funnel.name}. Sofia desabilitada. Habilite Sofia quando o lead estiver pronto.` });
    } catch (err) {
        console.error('Update funnel error:', err);
        res.status(500).json({ success: false, error: 'Erro ao mover lead de funil' });
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
        const updatePayload: Record<string, unknown> = { bot_active: newValue };

        // Ao REATIVAR Sofia — garantir que bot_stage seja 'approach' ou superior
        // para que ela releia o contexto do funil atual e cheque docs faltantes.
        // Se estava em 'reception' (valor de reset), avança para 'approach'.
        if (newValue === true) {
            const currentStage = (lead as unknown as Record<string, unknown>).bot_stage as string | undefined;
            if (!currentStage || currentStage === 'reception') {
                updatePayload.bot_stage = 'approach';
                console.log(`[Bot.Toggle] 🤖 Sofia reativada para lead #${id} — bot_stage forçado para 'approach' (era '${currentStage ?? 'nulo'}').`);
            } else {
                console.log(`[Bot.Toggle] 🤖 Sofia reativada para lead #${id} — mantendo bot_stage='${currentStage}'.`);
            }
        } else {
            console.log(`[Bot.Toggle] 🤖 Sofia desabilitada para lead #${id} por user=${req.user?.userId}.`);
        }

        await db('leads').where({ id: Number(id) }).update(updatePayload);

        const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? 'unknown';
        await db('activity_logs').insert({
            user_id: req.user?.userId ?? null,
            lead_id: Number(id),
            action: newValue ? 'bot_enabled' : 'bot_disabled',
            entity_type: 'lead',
            entity_id: Number(id),
            old_value: JSON.stringify({ bot_active: lead.bot_active }),
            new_value: JSON.stringify(updatePayload),
            ip_address: ipAddress,
        }).catch((e: Error) => console.warn('[Bot.Toggle] activity_log insert failed:', e.message));

        res.json({ success: true, data: { bot_active: newValue, bot_stage: updatePayload.bot_stage } });
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
        const [{ id: noteId }] = await db('notes').insert({
            lead_id: Number(id),
            author_type: 'user',
            author_user_id: req.user!.userId,
            content: result.data.content,
        }).returning('id');

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
        const [{ id: docId }] = await db('documents').insert({
            lead_id: Number(id),
            uploaded_by: req.user?.userId,
            ...result.data,
        }).returning('id');

        const doc = await db('documents').where({ id: docId }).first();
        res.status(201).json({ success: true, data: doc });
    } catch (err) {
        console.error('Create document error:', err);
        res.status(500).json({ success: false, error: 'Erro ao criar documento' });
    }
}

// ============================================================
// DELETE /api/leads/:id/documents/:docId
// Remove um documento do lead (para atualização cadastral)
// ============================================================
export async function deleteLeadDocument(req: Request, res: Response): Promise<void> {
    const leadId = Number(req.params.id);
    const docId  = Number(req.params.docId);

    if (isNaN(leadId) || isNaN(docId)) {
        res.status(400).json({ success: false, error: 'IDs inválidos' });
        return;
    }

    try {
        const doc = await db('documents').where({ id: docId, lead_id: leadId }).first() as Record<string, unknown> | undefined;
        if (!doc) {
            res.status(404).json({ success: false, error: 'Documento não encontrado' });
            return;
        }

        // Remove arquivo do disco se existir
        const filePath = doc.file_path as string | null;
        if (filePath) {
            try {
                const fsMod = await import('fs');
                if (fsMod.existsSync(filePath)) fsMod.unlinkSync(filePath);
            } catch (fsErr) {
                console.warn('[DeleteDoc] Could not remove file from disk:', (fsErr as Error).message);
            }
        }

        await db('documents').where({ id: docId }).delete();

        await logActivity({
            user_id:     req.user?.userId,
            lead_id:     leadId,
            action:      'document_deleted',
            entity_type: 'document',
            entity_id:   docId,
            old_value:   { name: doc.name, doc_type: doc.doc_type, status: doc.status },
        });

        console.log(`[Doc] 🗑️  Documento ${docId} (${doc.name}) excluído do lead ${leadId} por user ${req.user?.userId}`);
        res.json({ success: true, message: `Documento "${doc.name}" excluído com sucesso` });
    } catch (err) {
        console.error('Delete document error:', err);
        res.status(500).json({ success: false, error: 'Erro ao excluir documento' });
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
        const fileData = doc.file_data as Buffer | null;
        const docMimeType = doc.file_type as string | null;

        // Use dynamic import to avoid top-level fs import
        const fs = await import('fs');
        const path = await import('path');

        const docName = (doc.name as string) || 'documento';

        // Try disk first, fall back to DB BYTEA (Railway-safe)
        if (filePath && fs.existsSync(filePath)) {
            const ext = path.extname(filePath).replace('.', '').toLowerCase();
            const mimeTypes: Record<string, string> = {
                jpg: 'image/jpeg', jpeg: 'image/jpeg',
                png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
            };
            const mimeType = mimeTypes[ext] || docMimeType || 'application/octet-stream';
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', `inline; filename="${docName}.${ext}"`);
            res.setHeader('Cache-Control', 'private, max-age=3600');
            fs.createReadStream(filePath).pipe(res);
            return;
        }

        // Disk file missing (e.g. Railway restart) — serve from DB BYTEA
        if (fileData && fileData.length > 0) {
            const ext = docMimeType?.includes('png') ? 'png' : docMimeType?.includes('webp') ? 'webp' : 'jpg';
            const mimeType = docMimeType || 'image/jpeg';
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', `inline; filename="${docName}.${ext}"`);
            res.setHeader('Cache-Control', 'private, max-age=3600');
            res.setHeader('Content-Length', String(fileData.length));
            res.end(fileData);
            return;
        }

        res.status(404).json({ success: false, error: 'Arquivo não disponível' });
    } catch (err) {
        console.error('Download document error:', err);
        res.status(500).json({ success: false, error: 'Erro ao baixar documento' });
    }
}


export async function getFunnels(req: Request, res: Response): Promise<void> {
    try {
        // COUNT apenas leads ATIVOS — alinha com o que o Kanban exibe
        const funnels = await db('funnels as f')
            .leftJoin('leads as l', function(this: any) {
                this.on('f.id', '=', 'l.funnel_id').andOnVal('l.status', '=', 'active');
            })
            .where('f.is_active', true)
            .groupBy('f.id')
            .orderBy('f.display_order')
            .select('f.*', db.raw('COUNT(l.id) as lead_count'));
            
        res.json({ success: true, data: funnels });
    } catch (err) {
        console.error('Get funnels error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar funis' });
    }
}

// GET /api/leads/:id/activity — log de auditoria do lead
export async function getLeadActivityLog(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
        const logs = await db('activity_logs as a')
            .leftJoin('users as u', 'a.user_id', 'u.id')
            .where('a.lead_id', Number(id))
            .orderBy('a.created_at', 'desc')
            .limit(100)
            .select(
                'a.id', 'a.action', 'a.entity_type', 'a.old_value', 'a.new_value',
                'a.ip_address', 'a.created_at',
                'u.name as user_name', 'u.email as user_email'
            );

        res.json({ success: true, data: logs });
    } catch (err) {
        console.error('Get activity log error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar log de atividade' });
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

// Helper to save image to disk and buffer
async function saveImageAndPersistLocal(
    leadId: number,
    base64: string,
    mimeType: string,
    docLabel: string
): Promise<{ filePath: string | null; fileData: Buffer | null }> {
    const fileData = Buffer.from(base64, 'base64');
    let filePath: string | null = null;
    try {
        const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
        const dirPath = path.join(process.cwd(), 'uploads', 'documents', String(leadId));
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
        const safeName = docLabel.replace(/[^a-z0-9_\-]/gi, '_').slice(0, 40);
        const filename = `${safeName}_${Date.now()}.${ext}`;
        const fullPath = path.join(dirPath, filename);
        fs.writeFileSync(fullPath, fileData);
        filePath = fullPath;
    } catch (err) {
        console.warn('[Doc Local] Disk save failed (will use DB only):', (err as Error).message);
    }
    return { filePath, fileData };
}

export async function uploadAndExtractDocument(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const schema = z.object({
        fileBase64: z.string().min(1),
        mimeType: z.string().min(1),
        docType: z.string().min(1),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos para o upload.' });
        return;
    }

    const { fileBase64, mimeType, docType } = result.data;

    try {
        const lead = await db('leads').where({ id: Number(id) }).first();
        if (!lead) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }

        // 1. Analyze image via AI
        const context = `O usuário está anexando um documento do tipo "${docType}". Valide se a imagem corresponde e extraia as informações essenciais.`;
        const analysis = await analyzeImage(fileBase64, mimeType, context);
        
        if (!analysis.isLegible) {
            res.status(400).json({ 
                success: false, 
                error: 'Imagem ilegível ou inválida',
                details: analysis.issues 
            });
            return;
        }

        // 2. Extract data based on docType
        const textData = analysis.extractedText || '';
        const updates: Record<string, string> = {};
        
        if (docType === 'RG' || docType === 'CNH') {
            const extractedCpf = extractCPF(textData);
            const extractedName = extractName(textData);

            if (extractedCpf && !lead.cpf) updates.cpf = extractedCpf;
            
            const currentName = String(lead.name || '');
            if (extractedName && (!/^[A-Za-záàãâéêíóôõúüçÁÀÃÂÉÊÍÓÔÕÚÜÇ\s]+$/.test(currentName.trim()) || currentName === String(lead.phone) || currentName.startsWith('Lead '))) {
                updates.name = extractedName;
            }
        } else if (docType === 'Comprovante de Residência') {
            const roughAddress = textData.split('\n').slice(0, 4).join(', ').trim().substring(0, 200);
            if (roughAddress && roughAddress.length >= 10 && !lead.address) {
                updates.address = roughAddress;
            }
        }

        // 3. Update lead if any extraction succeeded
        if (Object.keys(updates).length > 0) {
            await db('leads').where({ id: Number(id) }).update({ ...updates, updated_at: new Date() });
            
            // Log update
            await logActivity({
                user_id: req.user?.userId,
                lead_id: Number(id),
                action: 'lead_updated',
                entity_type: 'lead',
                entity_id: Number(id),
                new_value: { updates, source: 'ai_extraction_manual_upload' }
            });
        }

        // 4. Save the document
        const { filePath, fileData } = await saveImageAndPersistLocal(Number(id), fileBase64, mimeType, docType);
        
        const [{ id: docId }] = await db('documents').insert({
            lead_id: Number(id),
            name: docType,
            file_type: mimeType,
            file_path: filePath,
            file_data: fileData,
            status: 'aprovado',
            notes: textData,
            uploaded_by: req.user?.userId
        }).returning('id');

        const doc = await db('documents').where({ id: docId }).first();

        // Include download URL
        const protocol = req.protocol;
        const host = req.get('host') || 'localhost:3001';
        const baseUrl = `${protocol}://${host}`;
        doc.file_url = `${baseUrl}/api/leads/${id}/documents/${docId}/download`;

        res.json({ 
            success: true, 
            data: doc, 
            extracted: updates 
        });

    } catch (err) {
        console.error('Upload document error:', err);
        res.status(500).json({ success: false, error: 'Erro ao fazer upload e extração do documento' });
    }
}

// ── GET /api/leads/:id/location — Returns the exact funnel & stage of a lead ─
// Useful for finding leads that are "in limbo" (invisible in the Kanban board)
export async function getLeadLocation(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
        const lead = await db('leads as l')
            .select(
                'l.id',
                'l.name',
                'l.phone',
                'l.status',
                'l.bot_active',
                'l.bot_stage',
                'l.funnel_id',
                'l.stage_id',
                'f.name as funnel_name',
                'f.slug as funnel_slug',
                'f.is_active as funnel_is_active',
                's.name as stage_name',
                's.slug as stage_slug',
            )
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .leftJoin('stages as s', 'l.stage_id', 's.id')
            .where('l.id', Number(id))
            .first();

        if (!lead) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }

        // Detect why the lead might be invisible
        const issues: string[] = [];
        if (!lead.funnel_id) issues.push('Sem funil atribuído');
        if (!lead.stage_id)  issues.push('Sem etapa atribuída');
        if (lead.funnel_is_active === false) issues.push('Funil está inativo');
        if (lead.status === 'archived') issues.push('Lead está arquivado');

        res.json({
            success: true,
            data: {
                lead_id:         lead.id,
                lead_name:       lead.name,
                lead_status:     lead.status,
                bot_active:      lead.bot_active,
                bot_stage:       lead.bot_stage,
                funnel_id:       lead.funnel_id,
                funnel_name:     lead.funnel_name  || '(funil desconhecido)',
                funnel_slug:     lead.funnel_slug  || null,
                funnel_is_active: lead.funnel_is_active,
                stage_id:        lead.stage_id,
                stage_name:      lead.stage_name   || '(etapa desconhecida)',
                stage_slug:      lead.stage_slug   || null,
                issues,
                is_visible_in_kanban: issues.length === 0,
            },
        });
    } catch (err) {
        console.error('Get lead location error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar localização do lead' });
    }
}

// ============================================================
// POST /api/leads/:id/documents/:docId/extract
// Re-runs AI extraction on a saved document and fills lead fields.
// Uses cached extractedData from document notes if available,
// otherwise re-analyzes the image via Gemini.
// ============================================================
export async function extractDocumentData(req: Request, res: Response) {
    try {
        const leadId = Number(req.params.id);
        const docId  = Number(req.params.docId);
        if (isNaN(leadId) || isNaN(docId)) return res.status(400).json({ success: false, error: 'ID inválido' });

        const [lead, doc] = await Promise.all([
            db('leads').where({ id: leadId }).first(),
            db('documents').where({ id: docId, lead_id: leadId }).first(),
        ]);
        if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });
        if (!doc)  return res.status(404).json({ success: false, error: 'Documento não encontrado' });

        // ── Try to read cached extractedData from notes JSON ──
        let extractedData: Record<string, string> | null = null;
        if (doc.notes) {
            try {
                const parsed = JSON.parse(doc.notes);
                if (parsed.extractedData && Object.keys(parsed.extractedData).length > 0) {
                    const cached = parsed.extractedData as Record<string, string>;
                    const docName = (doc.doc_type || doc.name || '').toString().toUpperCase();
                    const isRG = docName.includes('RG');
                    const isComprovante = docName.includes('COMPROVANTE') || docName.includes('RESID');

                    // Se já foi analisado fresco, aceita o cache sem bypass (evita loop infinito)
                    if (parsed.analyzed_fresh) {
                        extractedData = cached;
                        console.log(`[Extract] Using cache (already fresh-analyzed) for doc ${docId}`);
                    } else {
                        // Bypass cache se RG falta org_emissor/uf_emissor (cache antigo)
                        const missingRgFields = isRG && (!cached.org_emissor && !cached.uf_emissor);
                        // Bypass cache se Comprovante falta campos granulares
                        const missingAddressFields = isComprovante && (!cached.street && !cached.zip_code && !cached.neighborhood);

                        if (!missingRgFields && !missingAddressFields) {
                            extractedData = cached;
                            console.log(`[Extract] Using cached extractedData for doc ${docId}`);
                        } else {
                            console.log(`[Extract] Cache bypass — missing fields for doc ${docId} (isRG:${isRG} isComprovante:${isComprovante}) — re-analyzing`);
                        }
                    }
                }
            } catch { /* notes is plain text — fall through to re-analysis */ }
        }

        // ── If no cache, re-analyze the image ──
        if (!extractedData && doc.file_data) {
            console.log(`[Extract] No cached data — re-analyzing doc ${docId} with Gemini`);
            const fileBase64 = Buffer.isBuffer(doc.file_data)
                ? doc.file_data.toString('base64')
                : String(doc.file_data);
            const mimeType   = (doc.file_type as string) || 'image/jpeg';
            const docLabel   = (doc.name || doc.doc_type || 'documento') as string;
            const isRgDoc    = docLabel.toUpperCase().includes('RG') || docLabel.toUpperCase().includes('IDENTIDADE');
            const context    = isRgDoc
                ? `Documento: "${docLabel}". EXTRAIA COM PRIORIDADE: org_emissor (abreviatura do órgão emissor: SSP, DETRAN, PC, IFP — geralmente impresso no rodapé ou canto do RG) e uf_emissor (UF do estado emissor em 2 letras — NÃO confundir com naturalidade). RGs emitidos até 2010 frequentemente exibem esses dados em fonte menor no cabeçalho ou rodapé. Extraia todos os outros campos visíveis.`
                : `Documento do tipo "${docLabel}". Extraia TODOS os dados pessoais e de endereço visíveis com máxima precisão.`;
            const analysis   = await analyzeImage(fileBase64, mimeType, context);
            console.log(`[Extract] Gemini extractedData for doc ${docId}:`, JSON.stringify(analysis.extractedData));
            if (analysis.extractedData && Object.keys(analysis.extractedData).length > 0) {
                extractedData = analysis.extractedData as Record<string, string>;
                // Salva com flag analyzed_fresh=true para evitar loop infinito de re-análise
                const newNotes = JSON.stringify({ extractedText: analysis.extractedText, extractedData, analyzed_fresh: true });
                await db('documents').where({ id: docId }).update({ notes: newNotes });
            }
        }

        if (!extractedData || Object.keys(extractedData).length === 0) {
            return res.status(422).json({ success: false, error: 'Não foi possível extrair dados deste documento' });
        }

        // ── Apply extracted fields to lead — ALWAYS overwrite (manual admin action) ──
        const updates: Record<string, string> = {};
        const currentName = String(lead.name || '');
        const phone       = String(lead.phone || '');
        const isGenericName = !currentName || currentName === phone || currentName.startsWith('Lead ') || /^\d+$/.test(currentName.trim());

        // Name: always overwrite if we extracted a real name (protect against clearing with blank)
        if (extractedData.name) updates.name = extractedData.name;
        if (extractedData.cpf)         updates.cpf           = extractedData.cpf;
        if (extractedData.rg)          updates.rg            = extractedData.rg;
        // birthdate: convert DD/MM/YYYY → YYYY-MM-DD for PostgreSQL
        if (extractedData.birth_date) {
            const raw = String(extractedData.birth_date).trim();
            const ddmmyyyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            updates.birthdate = ddmmyyyy
                ? `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`
                : raw;
        }
        if (extractedData.gender)      updates.gender        = extractedData.gender;
        if (extractedData.nationality) updates.nationality   = extractedData.nationality;
        if (extractedData.mother)      updates.mother        = extractedData.mother;
        if (extractedData.father)      updates.father        = extractedData.father;
        if (extractedData.org_emissor) updates.org_emissor   = extractedData.org_emissor;
        if (extractedData.uf_emissor)  updates.uf_emissor    = extractedData.uf_emissor;
        if (extractedData.street)      updates.street        = extractedData.street;
        if (extractedData.number)      updates.number        = extractedData.number;
        if (extractedData.neighborhood) updates.neighborhood = extractedData.neighborhood;
        if (extractedData.city)        updates.city          = extractedData.city;
        if (extractedData.state)       updates.state         = extractedData.state;
        if (extractedData.zip_code)    updates.zip_code      = extractedData.zip_code;

        // CPF: formatar 11 dígitos → 000.000.000-00
        // Se tiver número errado de dígitos, descarta (evita varchar(14) overflow)
        if (updates.cpf) {
            const digits = updates.cpf.replace(/\D/g, '');
            if (digits.length === 11) {
                updates.cpf = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
            } else {
                console.warn(`[Extract] CPF inválido descartado (${digits.length} dígitos): ${updates.cpf}`);
                delete updates.cpf; // não salva CPF com dígito errado
            }
        }

        // Limpar o campo legado "address" (texto bruto do bot) quando campos granulares são preenchidos
        // Isso remove o banner amarelo "Extraído pelo bot" do front-end
        const hasAddressFields = extractedData.street || extractedData.number || extractedData.neighborhood || extractedData.city;
        if (hasAddressFields) {
            updates.address = '';  // limpa o texto bruto para não confundir o assessor
        }

        if (Object.keys(updates).length > 0) {
            // ── Split updates: safe core fields vs extended fields that might not exist yet ──
            // Core fields are guaranteed to exist in all DB versions
            const CORE_FIELDS = ['name', 'cpf', 'rg', 'birthdate', 'gender', 'nationality'];
            const coreUpdates: Record<string, string> = {};
            const extendedUpdates: Record<string, string> = {};

            for (const [k, v] of Object.entries(updates)) {
                if (CORE_FIELDS.includes(k)) {
                    coreUpdates[k] = v;
                } else {
                    extendedUpdates[k] = v;
                }
            }

            // Always apply core fields (these NEVER fail)
            if (Object.keys(coreUpdates).length > 0) {
                await db('leads').where({ id: leadId }).update(coreUpdates);
            }

            // Apply extended fields one-by-one so a missing column doesn't kill the whole request
            for (const [col, val] of Object.entries(extendedUpdates)) {
                try {
                    await db('leads').where({ id: leadId }).update({ [col]: val });
                } catch (colErr) {
                    console.warn(`[Extract] ⚠️  Column "${col}" not found in DB — skipping (run migration to add it):`, (colErr as Error).message?.split('\n')[0]);
                    // Remove from reported updates so UI doesn't show it as filled
                    delete updates[col];
                }
            }

            await db('notes').insert({
                lead_id:     leadId,
                author_type: 'bot',
                content:     `[Extração manual] ✅ Dados preenchidos via botão "Extrair": ${Object.keys(updates).join(', ')}`,
            });
            console.log(`[Extract] Filled lead ${leadId} fields:`, updates);
        }

        const updatedLead = await db('leads').where({ id: leadId }).first();
        return res.json({ success: true, updated: updates, lead: updatedLead, extractedData });

    } catch (err) {
        console.error('extractDocumentData error:', err);
        res.status(500).json({ success: false, error: 'Erro ao extrair dados do documento' });
    }
}
