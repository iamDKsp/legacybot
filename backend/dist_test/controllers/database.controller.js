"use strict";
/**
 * database.controller.ts
 * Handles the Oracle-Core "Database" module endpoints:
 *   - Bot Prompts (per funnel)
 *   - Knowledge Base files (per funnel) — with REAL file text extraction
 *   - Collected Leads data
 *   - Verified Documents (media analyses from bot notes)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.knowledgeUpload = void 0;
exports.getPrompt = getPrompt;
exports.savePrompt = savePrompt;
exports.getKnowledgeFiles = getKnowledgeFiles;
exports.addKnowledgeFile = addKnowledgeFile;
exports.deleteKnowledgeFile = deleteKnowledgeFile;
exports.getCollectedLeads = getCollectedLeads;
exports.getVerifiedDocuments = getVerifiedDocuments;
const database_1 = require("../config/database");
const ai_service_1 = require("../services/ai.service");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
// ============================================================
// Multer — memoryStorage (Railway não tem filesystem persistente)
// ============================================================
exports.knowledgeUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
    fileFilter: (_req, file, cb) => {
        const allowed = ['application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'];
        if (allowed.includes(file.mimetype) || /\.(pdf|docx?|txt)$/i.test(file.originalname)) {
            cb(null, true);
        }
        else {
            cb(new Error('Tipo de arquivo não suportado. Use PDF, DOCX ou TXT.'));
        }
    },
});
// ============================================================
// Extract text from uploaded buffer (memoryStorage)
// ============================================================
async function extractTextFromBuffer(buffer, mimeType, originalName) {
    try {
        const ext = path_1.default.extname(originalName).toLowerCase();
        if (mimeType === 'text/plain' || ext === '.txt') {
            return buffer.toString('utf-8').slice(0, 50000);
        }
        if (mimeType === 'application/pdf' || ext === '.pdf') {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pdfParse = require('pdf-parse');
            const pdfData = await pdfParse(buffer);
            return (pdfData.text || '').slice(0, 50000);
        }
        if (mimeType.includes('wordprocessingml') || ext === '.docx' || mimeType === 'application/msword' || ext === '.doc') {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ buffer });
            return (result.value || '').slice(0, 50000);
        }
        return '';
    }
    catch (err) {
        console.error('[Knowledge] Text extraction error:', err?.message);
        return '';
    }
}
// ============================================================
// Default prompts per funnel (fallback when DB is empty)
// ============================================================
const DEFAULT_PROMPTS = {
    trabalhista: ai_service_1.BOT_SYSTEM_PROMPT,
    negativado: `Você é Sofia, assistente jurídica da Legacy especializada em Cliente Negativado.
Tom empático, coloquial. Ajude o cliente a entender que podemos limpar o nome.
NUNCA peça dados bancários. NUNCA dê parecer jurídico definitivo.`,
    'golpe-cibernetico': `Você é Sofia, assistente jurídica da Legacy especializada em Golpes Cibernéticos.
Tom acolhedor — a vítima pode estar abalada. Esclareça o que aconteceu e colete informações.
NUNCA peça dados bancários. NUNCA garanta recuperação de conta.`,
    'golpe-pix': `Você é Sofia, assistente jurídica da Legacy especializada em Golpe do Pix.
Extremamente empático — vítima pode estar em pânico. Tranquilize primeiro, colete informações depois.
NUNCA prometa recuperação do valor. NUNCA peça dados bancários.`,
};
// ============================================================
// GET /api/database/prompts/:funnel
// ============================================================
async function getPrompt(req, res) {
    const { funnel } = req.params;
    try {
        let row = await (0, database_1.db)('bot_prompts').where('funnel_slug', funnel).first();
        if (!row) {
            const content = DEFAULT_PROMPTS[funnel] ?? DEFAULT_PROMPTS['trabalhista'];
            await (0, database_1.db)('bot_prompts').insert({ funnel_slug: funnel, content });
            row = await (0, database_1.db)('bot_prompts').where('funnel_slug', funnel).first();
        }
        res.json({ success: true, data: row });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message });
    }
}
// ============================================================
// PUT /api/database/prompts/:funnel
// ============================================================
async function savePrompt(req, res) {
    const { funnel } = req.params;
    const { content } = req.body;
    if (!content) {
        res.status(400).json({ success: false, error: 'content é obrigatório' });
        return;
    }
    try {
        const existing = await (0, database_1.db)('bot_prompts').where('funnel_slug', funnel).first();
        if (existing) {
            await (0, database_1.db)('bot_prompts').where('funnel_slug', funnel).update({ content });
        }
        else {
            await (0, database_1.db)('bot_prompts').insert({ funnel_slug: funnel, content });
        }
        res.json({ success: true, message: 'Prompt salvo com sucesso' });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message });
    }
}
// ============================================================
// GET /api/database/knowledge/:funnel
// ============================================================
async function getKnowledgeFiles(req, res) {
    const { funnel } = req.params;
    try {
        const files = await (0, database_1.db)('knowledge_files')
            .where('funnel_slug', funnel)
            .orderBy('created_at', 'desc')
            .select('id', 'original_name', 'file_size_kb', 'file_type', 'created_at');
        res.json({ success: true, data: files });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message });
    }
}
// ============================================================
// POST /api/database/knowledge/:funnel
// Accepts multipart/form-data with a "file" field.
// Extracts text from PDF/DOCX/TXT and stores in knowledge_files.
// ============================================================
async function addKnowledgeFile(req, res) {
    const { funnel } = req.params;
    // Support both real file upload (multipart) and legacy metadata-only body
    if (req.file) {
        // ── Real file upload path (memoryStorage) ──
        const file = req.file;
        const originalName = file.originalname;
        const sizeKb = Math.round(file.size / 1024);
        const ext = path_1.default.extname(originalName).toLowerCase().replace('.', '');
        try {
            console.log(`[Knowledge] Extracting text from ${originalName} (${sizeKb}KB, ${file.mimetype})`);
            const extractedText = await extractTextFromBuffer(file.buffer, file.mimetype, originalName);
            console.log(`[Knowledge] Extracted ${extractedText.length} chars from ${originalName}`);
            const [{ id }] = await (0, database_1.db)('knowledge_files').insert({
                funnel_slug: funnel,
                original_name: originalName,
                file_size_kb: sizeKb,
                file_type: ext,
                extracted_text: extractedText || null,
            }).returning('id');
            const fileRow = await (0, database_1.db)('knowledge_files').where('id', id).first();
            res.status(201).json({
                success: true,
                data: fileRow,
                chars_extracted: extractedText.length,
            });
        }
        catch (err) {
            const error = err;
            res.status(500).json({ success: false, error: error.message });
        }
    }
    else {
        // ── Legacy metadata-only path (backward compat) ──
        const { original_name, file_size_kb } = req.body;
        if (!original_name) {
            res.status(400).json({ success: false, error: 'original_name é obrigatório' });
            return;
        }
        try {
            const [{ id }] = await (0, database_1.db)('knowledge_files').insert({
                funnel_slug: funnel,
                original_name,
                file_size_kb: file_size_kb || null,
            }).returning('id');
            const file = await (0, database_1.db)('knowledge_files').where('id', id).first();
            res.status(201).json({ success: true, data: file });
        }
        catch (err) {
            const error = err;
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
// ============================================================
// DELETE /api/database/knowledge/:id
// ============================================================
async function deleteKnowledgeFile(req, res) {
    const { id } = req.params;
    try {
        await (0, database_1.db)('knowledge_files').where('id', id).delete();
        res.json({ success: true, message: 'Arquivo removido' });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message });
    }
}
// ============================================================
// GET /api/database/leads
// CollectedData: leads captured by the bot with full context
// ============================================================
async function getCollectedLeads(req, res) {
    const { search, funnel } = req.query;
    try {
        let query = (0, database_1.db)('leads')
            .leftJoin('funnels', 'leads.funnel_id', 'funnels.id')
            .leftJoin('stages', 'leads.stage_id', 'stages.id')
            .select('leads.id', 'leads.name', 'leads.phone', 'leads.email', 'leads.cpf', 'leads.status', 'leads.origin', 'leads.bot_stage', 'leads.bot_active', 'leads.created_at', 'leads.updated_at', 'funnels.name as funnel_name', 'funnels.slug as funnel_slug', 'stages.name as stage_name')
            .orderBy('leads.created_at', 'desc');
        if (search) {
            query = query.where((q) => {
                q.where('leads.name', 'ilike', `%${search}%`)
                    .orWhere('leads.phone', 'ilike', `%${search}%`)
                    .orWhere('leads.email', 'ilike', `%${search}%`);
            });
        }
        if (funnel)
            query = query.where('funnels.slug', funnel);
        const leads = await query.limit(100);
        const leadsWithCounts = await Promise.all(leads.map(async (lead) => {
            const msgRow = await (0, database_1.db)('messages')
                .where('lead_id', lead.id)
                .count('id as count')
                .first();
            return { ...lead, message_count: parseInt(msgRow?.count || '0', 10) };
        }));
        res.json({ success: true, data: leadsWithCounts });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message });
    }
}
// ============================================================
// GET /api/database/verified-docs
// ============================================================
async function getVerifiedDocuments(req, res) {
    const { search } = req.query;
    try {
        let query = (0, database_1.db)('documents as d')
            .join('leads as l', 'd.lead_id', 'l.id')
            .leftJoin('funnels as f', 'l.funnel_id', 'f.id')
            .where('d.status', 'aprovado')
            .select('d.id', 'd.name as doc_type', 'd.notes as description', 'd.file_type', 'd.file_path', 'd.file_url', 'd.created_at as verified_at', 'l.name as lead_name', 'l.phone as lead_phone', 'l.id as lead_id', 'f.name as funnel_name', 'f.slug as funnel_slug', 'f.color as funnel_color')
            .orderBy('d.created_at', 'desc')
            .limit(200);
        if (search) {
            query = query.where((q) => {
                q.where('l.name', 'ilike', `%${search}%`)
                    .orWhere('d.name', 'ilike', `%${search}%`);
            });
        }
        const docs = await query;
        // Build download url for docs that have a file_path but no file_url
        const protocol = req.protocol;
        const host = req.get('host') || 'localhost:3001';
        const baseUrl = `${protocol}://${host}`;
        const enriched = docs.map((doc) => ({
            ...doc,
            file_url: doc.file_url
                ? doc.file_url
                : doc.file_path
                    ? `${baseUrl}/api/documents/${doc.id}/download`
                    : null,
        }));
        res.json({ success: true, data: enriched });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message });
    }
}
//# sourceMappingURL=database.controller.js.map