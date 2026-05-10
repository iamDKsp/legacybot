"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeads = getLeads;
exports.getLeadById = getLeadById;
exports.createLead = createLead;
exports.updateLead = updateLead;
exports.updateLeadStage = updateLeadStage;
exports.updateLeadStatus = updateLeadStatus;
exports.getLeadChecklist = getLeadChecklist;
exports.toggleBotStatus = toggleBotStatus;
exports.deleteLead = deleteLead;
exports.getLeadNotes = getLeadNotes;
exports.createLeadNote = createLeadNote;
exports.getLeadDocuments = getLeadDocuments;
exports.createLeadDocument = createLeadDocument;
exports.downloadDocument = downloadDocument;
exports.getFunnels = getFunnels;
exports.getStages = getStages;
const zod_1 = require("zod");
const database_1 = require("../config/database");
const activity_service_1 = require("../services/activity.service");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
// ── Document requirements per funnel (mirrors webhook.controller.ts) ──────────
const DOCS_REQUIRED_BY_AREA = {
    trabalhista: ['RG', 'Comprovante de Residência', 'Holerite', 'Carteira de Trabalho'],
    negativado: ['RG', 'Comprovante de Residência'],
    'golpe-cibernetico': ['RG', 'Comprovante de Residência', 'Prints de Fraude'],
    'golpe-pix': ['RG', 'Comprovante de Residência', 'Comprovante Pix'],
    default: ['RG', 'Comprovante de Residência'],
};
const IDENTITY_DOCS = ['RG', 'CNH'];
function satisfySlot(received, required) {
    // Normalize: strip suffixes like "(frente)", "(verso)", "[Ilegível]" etc.
    const base = received.replace(/\s*[\(\[].*[\)\]]$/, '').trim();
    if (base === required)
        return true;
    if (IDENTITY_DOCS.includes(base) && IDENTITY_DOCS.includes(required))
        return true;
    return false;
}
const createLeadSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
    phone: zod_1.z.string().min(10, 'Telefone inválido'),
    email: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
    cpf: zod_1.z.string().optional(),
    origin: zod_1.z.enum(['whatsapp', 'manual', 'instagram', 'site']).default('manual'),
    funnel_id: zod_1.z.number().int().positive(),
    stage_id: zod_1.z.number().int().positive().optional(),
    description: zod_1.z.string().optional(),
    assigned_to: zod_1.z.number().int().positive().optional(),
});
// Update schema also accepts PHC/juridical complement fields (not required on create)
const updateLeadSchema = createLeadSchema.partial().extend({
    address: zod_1.z.string().optional(),
    city: zod_1.z.string().optional(),
    state: zod_1.z.string().max(2).optional(),
    rg: zod_1.z.string().optional(),
    marital_status: zod_1.z.enum(['solteiro', 'casado', 'divorciado', 'viuvo', 'outro']).optional(),
    nationality: zod_1.z.string().optional(),
    birthdate: zod_1.z.string().optional(), // ISO date string "YYYY-MM-DD"
});
async function getLeads(req, res) {
    try {
        const { funnel_id, stage_id, status, search, assigned_to, page = '1', limit = '100', } = req.query;
        let query = (0, database_1.db)('leads as l')
            .select('l.*', 'f.name as funnel_name', 'f.slug as funnel_slug', 'f.color as funnel_color', 's.name as stage_name', 's.slug as stage_slug', 's.display_order as stage_order', 'u.name as assigned_user_name', 'u.email as assigned_user_email')
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .leftJoin('stages as s', 'l.stage_id', 's.id')
            .leftJoin('users as u', 'l.assigned_to', 'u.id')
            .orderBy('l.updated_at', 'desc');
        if (funnel_id)
            query = query.where('l.funnel_id', Number(funnel_id));
        if (stage_id)
            query = query.where('l.stage_id', Number(stage_id));
        if (status)
            query = query.where('l.status', String(status));
        if (assigned_to)
            query = query.where('l.assigned_to', Number(assigned_to));
        if (search) {
            const term = `%${String(search)}%`;
            query = query.where((builder) => {
                builder
                    .where('l.name', 'ilike', term)
                    .orWhere('l.phone', 'ilike', term)
                    .orWhere('l.cpf', 'ilike', term)
                    .orWhere('l.email', 'ilike', term);
            });
        }
        const pageNum = parseInt(String(page), 10);
        const limitNum = parseInt(String(limit), 10);
        const offset = (pageNum - 1) * limitNum;
        const countQuery = (0, database_1.db)('leads as l').count('l.id as total');
        if (funnel_id)
            countQuery.where('l.funnel_id', Number(funnel_id));
        if (stage_id)
            countQuery.where('l.stage_id', Number(stage_id));
        if (status)
            countQuery.where('l.status', String(status));
        const [countResult] = await countQuery;
        const total = Number(countResult.total || 0);
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
    }
    catch (err) {
        console.error('Get leads error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar leads' });
    }
}
async function getLeadById(req, res) {
    try {
        const { id } = req.params;
        const lead = await (0, database_1.db)('leads as l')
            .select('l.*', 'f.name as funnel_name', 'f.slug as funnel_slug', 'f.color as funnel_color', 's.name as stage_name', 's.slug as stage_slug', 'u.name as assigned_user_name')
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
    }
    catch (err) {
        console.error('Get lead error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar lead' });
    }
}
async function createLead(req, res) {
    const result = createLeadSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos', details: result.error.errors });
        return;
    }
    try {
        // Default stage to "recebido" (id=1) if not provided
        const stageId = result.data.stage_id || 1;
        const [{ id }] = await (0, database_1.db)('leads').insert({
            ...result.data,
            stage_id: stageId,
            email: result.data.email || null,
        }).returning('id');
        const lead = await (0, database_1.db)('leads as l')
            .select('l.*', 'f.name as funnel_name', 'f.color as funnel_color', 's.name as stage_name')
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .leftJoin('stages as s', 'l.stage_id', 's.id')
            .where('l.id', id)
            .first();
        await (0, activity_service_1.logActivity)({
            user_id: req.user?.userId,
            lead_id: id,
            action: 'lead_created',
            entity_type: 'lead',
            entity_id: id,
            new_value: lead,
        });
        res.status(201).json({ success: true, data: lead });
    }
    catch (err) {
        const error = err;
        if (error.code === '23505') {
            res.status(409).json({ success: false, error: 'Já existe um lead com este telefone' });
            return;
        }
        console.error('Create lead error:', err);
        res.status(500).json({ success: false, error: 'Erro ao criar lead' });
    }
}
async function updateLead(req, res) {
    const result = updateLeadSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos', details: result.error.errors });
        return;
    }
    const { id } = req.params;
    try {
        const existing = await (0, database_1.db)('leads').where({ id: Number(id) }).first();
        if (!existing) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }
        await (0, database_1.db)('leads').where({ id: Number(id) }).update(result.data);
        const updated = await (0, database_1.db)('leads as l')
            .select('l.*', 'f.name as funnel_name', 'f.color as funnel_color', 's.name as stage_name')
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .leftJoin('stages as s', 'l.stage_id', 's.id')
            .where('l.id', Number(id))
            .first();
        await (0, activity_service_1.logActivity)({
            user_id: req.user?.userId,
            lead_id: Number(id),
            action: 'lead_updated',
            entity_type: 'lead',
            entity_id: Number(id),
            old_value: existing,
            new_value: result.data,
        });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        console.error('Update lead error:', err);
        res.status(500).json({ success: false, error: 'Erro ao atualizar lead' });
    }
}
async function updateLeadStage(req, res) {
    const schema = zod_1.z.object({ stage_id: zod_1.z.number().int().positive() });
    const result = schema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'stage_id inválido' });
        return;
    }
    const { id } = req.params;
    try {
        const existing = await (0, database_1.db)('leads').where({ id: Number(id) }).first();
        if (!existing) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }
        const stage = await (0, database_1.db)('stages').where({ id: result.data.stage_id }).first();
        if (!stage) {
            res.status(400).json({ success: false, error: 'Estágio inválido' });
            return;
        }
        await (0, database_1.db)('leads').where({ id: Number(id) }).update({ stage_id: result.data.stage_id });
        await (0, activity_service_1.logActivity)({
            user_id: req.user?.userId,
            lead_id: Number(id),
            action: 'stage_changed',
            entity_type: 'lead',
            entity_id: Number(id),
            old_value: { stage_id: existing.stage_id },
            new_value: { stage_id: result.data.stage_id, stage_name: stage.name },
        });
        res.json({ success: true, message: `Lead movido para: ${stage.name}` });
    }
    catch (err) {
        console.error('Update stage error:', err);
        res.status(500).json({ success: false, error: 'Erro ao atualizar estágio' });
    }
}
async function updateLeadStatus(req, res) {
    const schema = zod_1.z.object({
        status: zod_1.z.enum(['active', 'approved', 'rejected', 'archived']),
        verdict_notes: zod_1.z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos' });
        return;
    }
    const { id } = req.params;
    try {
        const existing = await (0, database_1.db)('leads').where({ id: Number(id) }).first();
        if (!existing) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }
        await (0, database_1.db)('leads').where({ id: Number(id) }).update(result.data);
        await (0, activity_service_1.logActivity)({
            user_id: req.user?.userId,
            lead_id: Number(id),
            action: 'status_changed',
            entity_type: 'lead',
            entity_id: Number(id),
            old_value: { status: existing.status },
            new_value: result.data,
        });
        res.json({ success: true, message: 'Status atualizado com sucesso' });
    }
    catch (err) {
        console.error('Update status error:', err);
        res.status(500).json({ success: false, error: 'Erro ao atualizar status' });
    }
}
// ── Funnel display labels ────────────────────────────────────────────────────
const FUNNEL_LABELS = {
    trabalhista: 'Trabalhista',
    negativado: 'Cliente Negativado',
    'golpe-pix': 'Golpe do Pix',
    'golpe-cibernetico': 'Golpe Cibernético',
    default: 'Geral',
};
// ── Checklist: document collection progress per lead ─────────────────────────
async function getLeadChecklist(req, res) {
    const { id } = req.params;
    try {
        const lead = await (0, database_1.db)('leads as l')
            .select('l.id', 'l.name', 'l.phone', 'l.cpf', 'l.address', 'f.slug as funnel_slug')
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .where('l.id', Number(id))
            .first();
        if (!lead) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }
        const funnelSlug = lead.funnel_slug ?? 'default';
        // ── Section 1: Standard fields (all funnels) ─────────────────────────
        const hasRealName = lead.name && !/^\d+$/.test(String(lead.name).trim()) && lead.name !== lead.phone;
        const standardFields = [
            { key: 'phone', label: 'Telefone', value: lead.phone || null, filled: !!lead.phone },
            { key: 'name', label: 'Nome', value: hasRealName ? lead.name : null, filled: !!hasRealName },
            { key: 'cpf', label: 'CPF', value: lead.cpf || null, filled: !!lead.cpf },
            { key: 'address', label: 'Endereço', value: lead.address || null, filled: !!lead.address },
        ];
        // ── Section 2: Flow-specific documents ───────────────────────────────
        const required = DOCS_REQUIRED_BY_AREA[funnelSlug] ?? DOCS_REQUIRED_BY_AREA['default'];
        const approvedDocs = await (0, database_1.db)('documents')
            .where({ lead_id: Number(id), status: 'aprovado' })
            .select('name');
        const received = approvedDocs.map(d => d.name).filter(Boolean);
        const flowItems = required.map(req => ({
            name: req,
            received: received.some(rec => satisfySlot(rec, req)),
        }));
        const receivedCount = flowItems.filter(i => i.received).length;
        const totalCount = flowItems.length;
        const complete = receivedCount === totalCount && standardFields.every(f => f.filled);
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
    }
    catch (err) {
        console.error('Get checklist error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar checklist' });
    }
}
async function toggleBotStatus(req, res) {
    const { id } = req.params;
    try {
        const lead = await (0, database_1.db)('leads').where({ id: Number(id) }).first();
        if (!lead) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }
        const newValue = !lead.bot_active;
        await (0, database_1.db)('leads').where({ id: Number(id) }).update({ bot_active: newValue });
        res.json({ success: true, data: { bot_active: newValue } });
    }
    catch (err) {
        console.error('Toggle bot error:', err);
        res.status(500).json({ success: false, error: 'Erro ao alterar status do bot' });
    }
}
async function deleteLead(req, res) {
    const { id } = req.params;
    try {
        const existing = await (0, database_1.db)('leads').where({ id: Number(id) }).first();
        if (!existing) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }
        // Soft delete — marcar como arquivado ao invés de deletar
        await (0, database_1.db)('leads').where({ id: Number(id) }).update({ status: 'archived' });
        await (0, activity_service_1.logActivity)({
            user_id: req.user?.userId,
            lead_id: Number(id),
            action: 'lead_archived',
            entity_type: 'lead',
            entity_id: Number(id),
        });
        res.json({ success: true, message: 'Lead arquivado com sucesso' });
    }
    catch (err) {
        console.error('Delete lead error:', err);
        res.status(500).json({ success: false, error: 'Erro ao arquivar lead' });
    }
}
// Notes for a specific lead
async function getLeadNotes(req, res) {
    const { id } = req.params;
    try {
        const notes = await (0, database_1.db)('notes as n')
            .select('n.*', 'u.name as author_name')
            .leftJoin('users as u', 'n.author_user_id', 'u.id')
            .where('n.lead_id', Number(id))
            .orderBy('n.created_at', 'asc');
        res.json({ success: true, data: notes });
    }
    catch (err) {
        console.error('Get notes error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar notas' });
    }
}
async function createLeadNote(req, res) {
    const schema = zod_1.z.object({ content: zod_1.z.string().min(1, 'Conteúdo é obrigatório') });
    const result = schema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Conteúdo é obrigatório' });
        return;
    }
    const { id } = req.params;
    try {
        const [{ id: noteId }] = await (0, database_1.db)('notes').insert({
            lead_id: Number(id),
            author_type: 'user',
            author_user_id: req.user.userId,
            content: result.data.content,
        }).returning('id');
        const note = await (0, database_1.db)('notes as n')
            .select('n.*', 'u.name as author_name')
            .leftJoin('users as u', 'n.author_user_id', 'u.id')
            .where('n.id', noteId)
            .first();
        res.status(201).json({ success: true, data: note });
    }
    catch (err) {
        console.error('Create note error:', err);
        res.status(500).json({ success: false, error: 'Erro ao criar nota' });
    }
}
// Documents for a specific lead
async function getLeadDocuments(req, res) {
    const { id } = req.params;
    try {
        const docs = await (0, database_1.db)('documents').where({ lead_id: Number(id) }).orderBy('created_at', 'desc');
        // Build public download URL for each doc
        const protocol = req.protocol;
        const host = req.get('host') || 'localhost:3001';
        const baseUrl = `${protocol}://${host}`;
        const enriched = docs.map((doc) => ({
            ...doc,
            // Generate correct download URL (includes lead_id for routing)
            file_url: doc.file_url
                ? doc.file_url
                : doc.file_path
                    ? `${baseUrl}/api/leads/${doc.lead_id}/documents/${doc.id}/download`
                    : null,
        }));
        res.json({ success: true, data: enriched });
    }
    catch (err) {
        console.error('Get documents error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar documentos' });
    }
}
async function createLeadDocument(req, res) {
    const schema = zod_1.z.object({
        name: zod_1.z.string().min(1),
        file_type: zod_1.z.string().optional(),
        file_url: zod_1.z.string().url().optional(),
        status: zod_1.z.enum(['pendente', 'recebido', 'aprovado', 'rejeitado']).default('pendente'),
        notes: zod_1.z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ success: false, error: 'Dados inválidos' });
        return;
    }
    const { id } = req.params;
    try {
        const [{ id: docId }] = await (0, database_1.db)('documents').insert({
            lead_id: Number(id),
            uploaded_by: req.user?.userId,
            ...result.data,
        }).returning('id');
        const doc = await (0, database_1.db)('documents').where({ id: docId }).first();
        res.status(201).json({ success: true, data: doc });
    }
    catch (err) {
        console.error('Create document error:', err);
        res.status(500).json({ success: false, error: 'Erro ao criar documento' });
    }
}
// Download a document file by doc ID (/:leadId/documents/:docId/download)
// Supports Auth via Bearer header OR ?token= query param (for <a href> / <img src> links)
async function downloadDocument(req, res) {
    // ── Auth: accept token via query param as fallback ──────────
    if (!req.headers.authorization) {
        const qToken = req.query.token;
        if (qToken) {
            try {
                const secret = env_1.config.jwt.secret;
                const decoded = jsonwebtoken_1.default.verify(qToken, secret);
                if (typeof decoded !== 'string') {
                    req.user = decoded;
                }
            }
            catch {
                res.status(401).json({ success: false, error: 'Token inválido' });
                return;
            }
        }
        else {
            res.status(401).json({ success: false, error: 'Não autenticado' });
            return;
        }
    }
    const { docId } = req.params;
    try {
        const doc = await (0, database_1.db)('documents').where({ id: Number(docId) }).first();
        if (!doc) {
            res.status(404).json({ success: false, error: 'Documento não encontrado' });
            return;
        }
        const filePath = doc.file_path;
        const fileData = doc.file_data;
        const docMimeType = doc.file_type;
        // Use dynamic import to avoid top-level fs import
        const fs = await Promise.resolve().then(() => __importStar(require('fs')));
        const path = await Promise.resolve().then(() => __importStar(require('path')));
        const docName = doc.name || 'documento';
        // Try disk first, fall back to DB BYTEA (Railway-safe)
        if (filePath && fs.existsSync(filePath)) {
            const ext = path.extname(filePath).replace('.', '').toLowerCase();
            const mimeTypes = {
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
    }
    catch (err) {
        console.error('Download document error:', err);
        res.status(500).json({ success: false, error: 'Erro ao baixar documento' });
    }
}
async function getFunnels(req, res) {
    try {
        const funnels = await (0, database_1.db)('funnels as f')
            .leftJoin('leads as l', 'f.id', 'l.funnel_id')
            .where('f.is_active', true)
            .groupBy('f.id')
            .orderBy('f.display_order')
            .select('f.*', database_1.db.raw('COUNT(l.id) as lead_count'));
        res.json({ success: true, data: funnels });
    }
    catch (err) {
        console.error('Get funnels error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar funis' });
    }
}
async function getStages(req, res) {
    try {
        const { funnel_slug } = req.query;
        let stages;
        if (funnel_slug) {
            stages = await (0, database_1.db)('stages as s')
                .join('funnel_stages as fs', 's.id', 'fs.stage_id')
                .join('funnels as f', 'fs.funnel_id', 'f.id')
                .where('f.slug', funnel_slug)
                .select('s.*')
                .orderBy('fs.display_order', 'asc');
        }
        else {
            stages = await (0, database_1.db)('stages').orderBy('display_order');
        }
        res.json({ success: true, data: stages });
    }
    catch (err) {
        console.error('Get stages error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar estágios' });
    }
}
//# sourceMappingURL=leads.controller.js.map