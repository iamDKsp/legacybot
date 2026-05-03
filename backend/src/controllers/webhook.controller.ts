import { Request, Response } from 'express';
import { db } from '../config/database';
import { aiService, buildLeadContext, getRelevantMemories, buildCompressedHistory, transcribeAudio, analyzeImage, generateCaseSummary, sendWhatsAppImage, DocumentType } from '../services/ai.service';
import { getWebSocketServer } from '../services/websocket.service';
import { detectEmotionalState, detectLegalArea, extractCPF, extractName } from '../services/learning.service';
import axios from 'axios';
import { config } from '../config/env';
import * as fs from 'fs';
import * as path from 'path';

// ====================================================
// Guide image cache (lazy loaded from public folder)
// Images are next to the frontend, served from /public
// ====================================================
const GUIDE_IMAGE_CACHE: Map<string, string> = new Map();

function getPublicImageBase64(filename: string): string | null {
    if (GUIDE_IMAGE_CACHE.has(filename)) return GUIDE_IMAGE_CACHE.get(filename)!;
    // The frontend public folder is 2 levels up from backend/src/controllers
    const imagePath = path.resolve(__dirname, '..', '..', '..', 'legacy-bot-login', 'public', filename);
    try {
        if (!fs.existsSync(imagePath)) {
            console.warn(`[GuideImage] File not found: ${imagePath}`);
            return null;
        }
        const buffer = fs.readFileSync(imagePath);
        const base64 = buffer.toString('base64');
        GUIDE_IMAGE_CACHE.set(filename, base64);
        console.log(`[GuideImage] Loaded "${filename}" (${Math.round(base64.length * 0.75 / 1024)}KB)`);
        return base64;
    } catch (err) {
        console.error(`[GuideImage] Error loading "${filename}":`, (err as Error).message);
        return null;
    }
}

/** Send guide image for RG/CNH to client */
async function sendRGGuideImage(phone: string) {
    const base64 = getPublicImageBase64('Como tirar foto do RG.png');
    if (!base64) return;
    await sendWhatsAppImage(phone, base64, 'image/png', 'Como tirar a foto do documento para boa leitura 👆');
}

/** Send guide image for Comprovante de Residência to client */
async function sendComprovanteGuideImage(phone: string) {
    const base64 = getPublicImageBase64('Como tirar foto do comprovante de residencia.png');
    if (!base64) return;
    await sendWhatsAppImage(phone, base64, 'image/png', 'Como tirar a foto do comprovante para boa leitura 👆');
}

// ====================================================
// Per-lead document collection state — DB-backed (persistent)
// Reads approved documents from the `documents` table so the
// state survives server restarts, hot-reloads and crashes.
// ====================================================
interface DocState {
    id_front_done: boolean;
    id_back_done: boolean;
    proof_of_address_done: boolean;
}

// Names that indicate the ID front was already collected
const ID_FRONT_NAMES = ['RG (frente)', 'CNH (frente)'];
// Names that indicate the ID back was already collected
const ID_BACK_NAMES  = ['RG (verso)',  'CNH (verso)'];
// Names that indicate proof of address was already collected
const PROOF_NAMES    = ['Comprovante de Residência'];

async function getDocState(leadId: number): Promise<DocState> {
    try {
        const approved = await db('documents')
            .where({ lead_id: leadId, status: 'aprovado' })
            .select('name') as Array<{ name: string }>;

        const names = approved.map(d => String(d.name || ''));

        return {
            id_front_done:        names.some(n => ID_FRONT_NAMES.some(f => n.startsWith(f.split(' ')[0]) && n.includes('frente'))),
            id_back_done:         names.some(n => ID_BACK_NAMES .some(b => n.startsWith(b.split(' ')[0]) && n.includes('verso'))),
            proof_of_address_done: names.some(n => PROOF_NAMES.some(p => n.startsWith(p.split(' ')[0]))),
        };
    } catch (err) {
        console.warn('[DocState] Failed to read doc state from DB — defaulting to all false:', (err as Error).message);
        return { id_front_done: false, id_back_done: false, proof_of_address_done: false };
    }
}

// ============================================================
// Save incoming image bytes to disk for CRM display/download
// ============================================================
function saveImageToDisk(leadId: number, base64: string, mimeType: string, docLabel: string): string | null {
    try {
        const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
        const dirPath = path.join(process.cwd(), 'uploads', 'documents', String(leadId));
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

        const safeName = docLabel.replace(/[^a-z0-9_\-]/gi, '_').slice(0, 40);
        const filename = `${safeName}_${Date.now()}.${ext}`;
        const fullPath = path.join(dirPath, filename);
        fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'));
        console.log(`[Doc] 💾 Saved image: ${fullPath}`);
        return fullPath;
    } catch (err) {
        console.warn('[Doc] Failed to save image to disk:', (err as Error).message);
        return null;
    }
}


// ============================================================
// Per-lead message debounce buffer
// Accumulates rapid-fire messages from a client and waits
// DEBOUNCE_MS after the last one before calling the AI.
// This prevents Sofia from responding to each broken sentence
// separately, making her feel much more human.
// ============================================================
interface LeadBuffer {
    messages: string[];
    lead: Record<string, unknown>;
    conversationId: number;
    phone: string;
    timer: ReturnType<typeof setTimeout>;
}

const _leadBuffers = new Map<string, LeadBuffer>();
const DEBOUNCE_MS = 10_000; // 10 seconds of silence before Sofia responds

// ============================================================
// STOP & RESTART: Per-lead AbortController tracking
// If Sofia is already processing (thinking/sending) for a lead
// and a new message arrives, we abort the current processing
// so she can restart with the full updated context.
// This eliminates 100% of duplicate response issues.
// ============================================================
const _activeProcessing = new Map<string, AbortController>();

function addToBuffer(
    phone: string,
    messageContent: string,
    lead: Record<string, unknown>,
    conversationId: number
): void {
    // 🛑 STOP & RESTART: If Sofia is already processing for this lead, cancel it
    const activeController = _activeProcessing.get(phone);
    if (activeController) {
        activeController.abort();
        _activeProcessing.delete(phone);
        console.log(`[Buffer] 🛑 STOP & RESTART: Cancelled active processing for ${phone} — new message arrived`);
    }

    const existing = _leadBuffers.get(phone);
    if (existing) {
        clearTimeout(existing.timer);
        existing.messages.push(messageContent);
        existing.lead = lead; // always keep the freshest lead snapshot
        existing.timer = setTimeout(() => { flushBuffer(phone).catch(console.error); }, DEBOUNCE_MS);
        console.log(`[Buffer] ➕ Lead ${lead.id} — ${existing.messages.length} messages pending, timer reset`);
    } else {
        _leadBuffers.set(phone, {
            messages: [messageContent],
            lead,
            conversationId,
            phone,
            timer: setTimeout(() => { flushBuffer(phone).catch(console.error); }, DEBOUNCE_MS),
        });
        console.log(`[Buffer] 🆕 Lead ${lead.id} — first message buffered, waiting ${DEBOUNCE_MS / 1000}s`);
    }
}

async function flushBuffer(phone: string): Promise<void> {
    const buf = _leadBuffers.get(phone);
    if (!buf) return;
    _leadBuffers.delete(phone);

    const combined = buf.messages.join('\n').trim();
    if (!combined) return;

    console.log(`[Buffer] 📤 Flushing ${buf.messages.length} msg(s) for ${phone}: "${combined.substring(0, 100)}${combined.length > 100 ? '...' : ''}"`);
    await processAIBotResponse(buf.lead, combined, buf.conversationId, phone);
}

// ============================================================
// Document checklist per legal area / funnel slug
// Universal docs: RG/CNH + Comprovante Residência + CTPS are
// required for ALL funnels (except when aposentado→INSS).
// ============================================================
const DOCS_REQUIRED_BY_AREA: Record<string, DocumentType[]> = {
    trabalhista:         ['RG', 'Comprovante de Residência', 'Holerite', 'Carteira de Trabalho'],
    negativado:          ['RG', 'Comprovante de Residência'],
    'golpe-cibernetico': ['RG', 'Comprovante de Residência', 'Prints de Fraude'],
    'golpe-pix':         ['RG', 'Comprovante de Residência', 'Comprovante Pix'],
    default:             ['RG', 'Comprovante de Residência'],
};

// RG and CNH are interchangeable as proof of identity
const IDENTITY_DOCS: DocumentType[] = ['RG', 'CNH'];

// Returns true if docType satisfies a required doc slot
function satisfiesRequirement(docType: DocumentType, required: DocumentType): boolean {
    // Normalize: strip suffixes like "(frente)", "(verso)", "[Ilegível]" etc.
    const base = String(docType).replace(/\s*[\(\[].*[\)\]]$/, '').trim() as DocumentType;
    if (base === required) return true;
    if (IDENTITY_DOCS.includes(base) && IDENTITY_DOCS.includes(required)) return true;
    return false;
}

// ============================================================
// Bot stage → CRM stage slug mapping per funnel
// Used by advanceBotStage() to auto-move the Kanban card
// ============================================================
const BOT_STAGE_TO_CRM_STAGE: Record<string, Record<string, string>> = {
    negativado: {
        reception:     'recebido',
        approach:      'abordagem',
        doc_request:   'documentacao',
        analysis:      'analise',
    },
    'golpe-pix': {
        reception:       'recebido',
        approach:        'abordagem',
        info_collection: 'coleta_info',
        doc_request:     'documentacao',
        procuracao_docs: 'procuracao',
        analysis:        'analise',
    },
    trabalhista: {
        reception:  'recebido',
        approach:   'abordagem',
        doc_request:'documentacao',
        analysis:   'analise',
    },
    'golpe-cibernetico': {
        reception:  'recebido',
        approach:   'abordagem',
        doc_request:'documentacao',
        analysis:   'analise',
    },
};

// ============================================================
// Advance bot stage + auto-move CRM Kanban stage
// Called whenever the bot determines the convo progressed
// ============================================================
async function advanceBotStage(
    leadId: number,
    funnelSlug: string,
    newBotStage: string,
    conversationId?: number
): Promise<void> {
    try {
        // Update bot_stage on the lead
        await db('leads').where({ id: leadId }).update({
            bot_stage: newBotStage,
            updated_at: new Date(),
        });

        // Determine the corresponding CRM stage slug
        const crmSlug = BOT_STAGE_TO_CRM_STAGE[funnelSlug]?.[newBotStage];
        if (!crmSlug) return;

        // Look up stage_id by slug
        const stage = await db('stages').where({ slug: crmSlug }).first();
        if (!stage) return;

        // Move the Kanban card
        await db('leads').where({ id: leadId }).update({ stage_id: stage.id });

        console.log(`[Bot] 🔀 Lead ${leadId}: bot_stage=${newBotStage} → CRM stage=${crmSlug} (id=${stage.id})`);

        // Notify CRM via WebSocket
        const wss = getWebSocketServer();
        if (wss) {
            wss.emit('stage_changed', {
                lead_id: leadId,
                bot_stage: newBotStage,
                stage_id: stage.id,
                stage_slug: crmSlug,
                conversation_id: conversationId,
            });
        }
    } catch (err) {
        console.error('[Bot] advanceBotStage error:', (err as Error)?.message);
    }
}

// ============================================================
// Detect gender from first name (PT-BR heuristic)
// Used to select procuracao template (masculine / feminine)
// ============================================================
function detectGender(fullName: string): 'masculino' | 'feminino' | 'desconhecido' {
    const first = fullName.trim().split(' ')[0].toLowerCase();
    // Common feminine endings in PT-BR
    const feminineEndings = ['a', 'ane', 'ine', 'ane', 'elly', 'elly', 'iele', 'iane'];
    const masculineEndings = ['o', 'on', 'el', 'er', 'il', 'in', 'uel', 'ão'];
    const feminineNames  = ['maria', 'ana', 'lucia', 'julia', 'amanda', 'jessica', 'camila', 'fernanda', 'patricia', 'beatriz', 'isabella', 'gabriela', 'rafaela', 'bruna', 'leticia', 'adriana', 'cristina', 'sandra', 'rose', 'rita', 'vera', 'tereza', 'livia', 'miriam', 'denise', 'alice', 'bianca', 'eliane', 'marcia', 'silvia'];
    const masculineNames = ['joao', 'jose', 'carlos', 'antonio', 'francisco', 'paulo', 'pedro', 'lucas', 'marcos', 'luis', 'rafael', 'daniel', 'marcelo', 'roberto', 'rodrigo', 'andre', 'eduardo', 'julio', 'Ricardo', 'thiago', 'matheus', 'guilherme', 'vitor', 'leandro', 'igor', 'sergio', 'alex', 'fabio', 'alan', 'diego'];

    if (feminineNames.includes(first)) return 'feminino';
    if (masculineNames.includes(first)) return 'masculino';
    if (feminineEndings.some(e => first.endsWith(e))) return 'feminino';
    if (masculineEndings.some(e => first.endsWith(e))) return 'masculino';
    return 'desconhecido';
}

// ============================================================
// Generate and save case summary note when lead reaches analysis
// ============================================================
async function generateAndSaveCaseSummary(
    lead: Record<string, unknown>,
    conversationId: number,
    funnelSlug: string
): Promise<void> {
    try {
        const leadId = lead.id as number;

        const allMessages = await db('messages')
            .where({ conversation_id: conversationId })
            .orderBy('sent_at', 'asc')
            .limit(30)
            .select('content', 'direction', 'sender') as Array<{ direction: string; content: string; sender: string }>;

        const summary = await generateCaseSummary(
            String(lead.name || ''),
            (lead.cpf as string | null) || null,
            funnelSlug,
            allMessages
        );

        // Save summary as a CRM note
        await db('notes').insert({
            lead_id: leadId,
            author_type: 'bot',
            content: summary,
        });

        // Also update lead.case_summary for quick access
        await db('leads').where({ id: leadId }).update({ case_summary: summary });

        console.log(`[Bot] 📋 Case summary generated and saved for lead ${leadId}`);

        // ── Bug #3/4 Fix: Guard against duplicate task creation ──
        // generateAndSaveCaseSummary can be called from multiple paths;
        // only create the task if one doesn't already exist for this lead.
        const existingTask = await db('tasks')
            .where({ lead_id: leadId, title: 'Análise do caso' })
            .first();

        if (!existingTask) {
            await db('tasks').insert({
                lead_id: leadId,
                title: 'Análise do caso',
                description: `Caso de ${funnelSlug} pronto para análise. Todos os documentos foram coletados pela Sofia. Entrar em contato com o cliente para as próximas etapas.`,
                category: 'outro',
                priority: 'media',
                status: 'pendente',
                created_by: 1, // Default to admin for system-generated tasks
            });
            console.log(`[Bot] 📝 Task "Análise do caso" created automatically for lead ${leadId}`);
        } else {
            console.log(`[Bot] ⏭️ Task "Análise do caso" already exists for lead ${leadId} — skipping duplicate`);
        }

    } catch (err) {
        console.error('[Bot] generateAndSaveCaseSummary error:', (err as Error)?.message);
    }
}

// ============================================================
// Get document checklist for a lead (uses bot_sessions.collected_data)
// ============================================================
async function getDocumentChecklist(leadId: number, funnelSlug: string): Promise<{
    required: DocumentType[];
    received: DocumentType[];
    missing: DocumentType[];
}> {
    const required = DOCS_REQUIRED_BY_AREA[funnelSlug] ?? DOCS_REQUIRED_BY_AREA['default'];

    // Load already-approved docs from the documents table
    const approvedDocs = await db('documents')
        .where({ lead_id: leadId, status: 'aprovado' })
        .select('name') as Array<{ name: string }>;

    const received = approvedDocs
        .map(d => d.name as DocumentType)
        .filter(Boolean);

    // Calculate missing: a required slot is satisfied if any received doc satisfies it
    const missing: DocumentType[] = required.filter(req =>
        !received.some(rec => satisfiesRequirement(rec as DocumentType, req))
    );

    return { required, received, missing };
}

// ============================================================
// Build document context string to inject into Sofia's prompt
// ============================================================
async function buildDocumentContext(leadId: number, funnelSlug: string): Promise<string> {
    try {
        const { required, received, missing } = await getDocumentChecklist(leadId, funnelSlug);
        if (required.length === 0) return '';

        const lines: string[] = ['[Documentos do lead — status atual]:'];
        for (const req of required) {
            const isReceived = received.some(rec => satisfiesRequirement(rec as DocumentType, req));
            lines.push(isReceived ? `✅ ${req} — recebido e aprovado` : `⏳ ${req} — aguardando`);
        }
        if (missing.length === 0) {
            lines.push('[TODOS OS DOCUMENTOS RECEBIDOS — mude a etapa para cpf_collection]');
        } else {
            lines.push(`[Faltam: ${missing.join(', ')}]`);
        }
        return '\n' + lines.join('\n');
    } catch {
        return '';
    }
}

// Map detectLegalArea results → DB funnel slugs
const AREA_TO_FUNNEL_SLUG: Record<string, string> = {
    trabalhista: 'trabalhista',
    consumidor:  'negativado',  // renamed from civel
    cibernetico: 'golpe-cibernetico',
    pix:         'golpe-pix',
};

// Handle incoming WhatsApp webhook messages
export async function handleWebhook(req: Request, res: Response): Promise<void> {
    try {
        // Different WhatsApp providers (Evolution API, Baileys, etc.) send different formats
        // We normalize the incoming payload here
        const body = req.body;

        // Immediately respond 200 to the webhook provider so it doesn't retry
        res.status(200).json({ received: true });

        // Process asynchronously
        await processIncomingMessage(body);
    } catch (err) {
        console.error('Webhook error:', err);
        // Already responded 200 above
    }
}

async function processIncomingMessage(payload: Record<string, unknown>): Promise<void> {
    try {
        // Normalize message from different WhatsApp providers
        const normalized = normalizeWebhookPayload(payload);
        if (!normalized) return;

        let { phone, name, message, whatsappId, chatId, audioBase64, audioMimeType, imageBase64, imageMimeType } = normalized;

        // ── Audio transcription ──
        if (audioBase64 && audioMimeType) {
            console.log(`[Webhook] 🎤 Audio detected | mime: ${audioMimeType} | base64 size: ${audioBase64.length} chars (~${Math.round(audioBase64.length * 0.75 / 1024)}KB)`);
            try {
                const transcription = await transcribeAudio(audioBase64, audioMimeType);
                if (transcription && transcription.trim().length > 0) {
                    message = transcription;
                    console.log(`[Webhook] 🎤 Audio transcribed OK (${transcription.length} chars): ${transcription.substring(0, 80)}`);
                } else {
                    // Empty transcription — set a specific message so the system prompt
                    // anti-hallucination rule kicks in and Sofia asks client to write instead
                    message = '[Áudio recebido — transcrição não disponível]';
                    console.warn('[Webhook] 🎤 Transcription empty — using fallback message for Sofia to handle');
                }
            } catch (err) {
                console.error('[Webhook] 🎤 Audio transcription failed:', err);
                message = '[Áudio recebido — transcrição não disponível]';
            }
        } else if (!audioBase64 && (normalized?.message === '[Áudio]')) {
            // Bridge detected audio but couldn't download it (network/size issue)
            console.warn('[Webhook] 🎤 Audio message detected but no base64 received from bridge — download may have failed');
            message = '[Áudio recebido — transcrição não disponível]';
        }

        // ── Image document handling (only if no audio was detected) ──
        if (!audioBase64 && imageBase64 && imageMimeType) {
            console.log('[Webhook] 🖼️ Image message detected');
            // We store temporarily; processDocumentImage is called after lead is loaded
        }

        // Find or create lead
        let lead = await db('leads').where({ phone }).first();

        if (!lead) {
            // Get default funnel (geral) and default stage (recebido)
            const defaultFunnel = await db('funnels').where({ slug: 'geral' }).first();
            const defaultStage = await db('stages').where({ slug: 'recebido' }).first();

            if (!defaultFunnel || !defaultStage) {
                console.error('Default funnel/stage not found. Please run seed.sql');
                return;
            }

            const [leadId] = await db('leads').insert({
                name: name || phone,
                phone,
                origin: 'whatsapp',
                funnel_id: defaultFunnel.id,
                stage_id: defaultStage.id,
                whatsapp_id: whatsappId,
                bot_active: 1,
            });

            lead = await db('leads').where({ id: leadId }).first();

            // Create bot session
            const sessionToken = `sess_${leadId}_${Date.now()}`;
            await db('bot_sessions').insert({
                lead_id: leadId,
                session_token: sessionToken,
                step: 'greeting',
                is_active: 1,
            });

            await db('leads').where({ id: leadId }).update({ bot_session_id: sessionToken });
        } else if (!lead.whatsapp_id && whatsappId) {
            // Auto-heal missing whatsapp_id for older leads
            await db('leads').where({ id: lead.id }).update({ whatsapp_id: whatsappId });
            lead.whatsapp_id = whatsappId;
            console.log(`[Webhook] 🩹 Auto-healed missing whatsapp_id for lead ${lead.id}`);
        }

        // ── Hard Reset for Testing (!reset command) ──────────────────────
        // Must be checked BEFORE saving to DB so the reset message itself
        // is not stored in history. Also clears the debounce buffer.
        if (message.trim().toLowerCase() === '!reset') {
            console.log(`[Webhook] 🔄 !reset received for lead ${lead.id} — clearing all history and resetting state`);

            // Clear any pending debounce buffer for this lead
            if (_leadBuffers.has(phone)) {
                clearTimeout(_leadBuffers.get(phone)!.timer);
                _leadBuffers.delete(phone);
                console.log(`[Webhook] 🔄 Debounce buffer cleared for ${phone}`);
            }

            // 1. Delete all messages
            await db('messages').where('lead_id', lead.id).del();

            // 1.5 Delete all other related data
            await db('documents').where('lead_id', lead.id).del();
            await db('notes').where('lead_id', lead.id).del();
            await db('tasks').where('lead_id', lead.id).del();
            await db('bot_handoffs').where('lead_id', lead.id).del();

            // 2. Resolve all open conversations
            await db('conversations')
                .where('lead_id', lead.id)
                .where('status', '!=', 'resolved')
                .update({ status: 'resolved', updated_at: new Date() });

            // 3. Reset to 'recebido' stage + default funnel (geral) — lookup by slug
            const recebidoStage = await db('stages').where({ slug: 'recebido' }).first() as { id: number } | undefined;
            const resetStageId = recebidoStage?.id ?? 1;
            const defaultFunnelReset = await db('funnels').where({ slug: 'geral' }).first() as { id: number } | undefined;

            const displayPhone = phone.includes('@') ? phone.split('@')[0] : phone;
            const initialName = name && name.trim().length > 0 ? name : `Lead ${displayPhone.slice(-4)}`;

            await db('leads').where({ id: lead.id }).update({
                name: initialName,
                cpf: null,
                address: null,
                email: null,
                bot_stage: 'reception',
                bot_active: 1,
                stage_id: resetStageId,
                funnel_id: defaultFunnelReset?.id ?? lead.funnel_id, // reset funnel so Sofia doesn't bias toward previous case
                updated_at: new Date(),
            });

            // 4. Notify CRM Kanban in real-time
            const wssReset = getWebSocketServer();
            if (wssReset) wssReset.emit('lead_updated', {
                lead_id: lead.id,
                bot_stage: 'reception',
                bot_active: true,
                stage_id: resetStageId,
                funnel_id: defaultFunnelReset?.id,
            });
            const targetPhone = String(lead.whatsapp_id || phone);
            await aiService.sendWhatsAppMessage(targetPhone, '🔄 *Modo de Teste Iniciado*\n\nHistórico apagado e estágio resetado para o início. Mande um "Oi" para começar do zero!');
            return;
        }

        // Find or create conversation
        let conversation = await db('conversations').where({ lead_id: lead.id }).first();
        if (!conversation) {
            const [convId] = await db('conversations').insert({
                lead_id: lead.id,
                whatsapp_chat_id: chatId || whatsappId,
                channel: 'whatsapp',
                status: 'open',
            });
            conversation = await db('conversations').where({ id: convId }).first();
        }

        // Store the message and image if present
        let mediaType: string | undefined = undefined;
        let imageUrl: string | null = null;
        let documentId: number | undefined = undefined;

        if (imageBase64 && imageMimeType) {
            mediaType = 'image';
            const filePath = saveImageToDisk(lead.id as number, imageBase64, imageMimeType, `midia_${Date.now()}`);
            if (filePath) {
                const [docId] = await db('documents').insert({
                    lead_id: lead.id,
                    name: `Mídia WhatsApp`,
                    file_type: imageMimeType,
                    file_path: filePath,
                    status: 'recebido',
                    notes: 'Em análise...'
                });
                documentId = docId;
                imageUrl = `/api/leads/${lead.id}/documents/${docId}/download`;
            }
        } else if (audioBase64) {
            mediaType = 'audio';
        }

        const [msgId] = await db('messages').insert({
            conversation_id: conversation.id,
            lead_id: lead.id,
            content: message,
            direction: 'inbound',
            sender: 'lead',
            media_type: mediaType,
            image_url: imageUrl
        });

        // Update conversation last message
        await db('conversations').where({ id: conversation.id }).update({
            last_message_at: new Date(),
            unread_count: db.raw('unread_count + 1'),
        });

        // Update lead
        await db('leads').where({ id: lead.id }).update({ updated_at: new Date() });

        // ── Auto-move lead to correct funnel based on detected legal area ──
        // Runs on user message; Sofia's reply will also be checked after generation
        try {
            const detectedArea = detectLegalArea(message);
            if (detectedArea) {
                const targetSlug = AREA_TO_FUNNEL_SLUG[detectedArea];
                if (targetSlug) {
                    const currentFunnel = await db('funnels').where({ id: lead.funnel_id }).first();
                    const targetFunnel = await db('funnels').where({ slug: targetSlug }).first();

                    // Only move if target is different from current
                    if (targetFunnel && currentFunnel && currentFunnel.slug !== targetSlug) {
                        const abordagemStage = await db('stages').where({ slug: 'abordagem' }).first();
                        const stageId = abordagemStage ? abordagemStage.id : 2;

                        await db('leads').where({ id: lead.id }).update({
                            funnel_id: targetFunnel.id,
                            stage_id: stageId,
                            bot_stage: 'approach'
                        });
                        lead.funnel_id = targetFunnel.id;
                        lead.stage_id = stageId;
                        lead.bot_stage = 'approach';
                        
                        console.log(`[Webhook] 🔀 Lead ${lead.id} auto-moved (user msg): ${currentFunnel.slug} → ${targetSlug} (detected: ${detectedArea}) | Stage set to Abordagem`);
                        
                        // Notify CRM
                        const wssMsg = getWebSocketServer();
                        if (wssMsg) {
                            wssMsg.emit('lead_updated', { lead_id: lead.id, funnel_id: targetFunnel.id, stage_id: stageId, bot_stage: 'approach' });
                            wssMsg.emit('stage_changed', { lead_id: lead.id, funnel_slug: targetSlug });
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('[Webhook] Auto-funnel detection failed (non-critical):', err);
        }

        // ── Also try to extract CPF from user's text message ──
        try {
            if (!lead.cpf) {
                const extractedCpf = extractCPF(message);
                if (extractedCpf) {
                    await db('leads').where({ id: lead.id }).update({ cpf: extractedCpf });
                    lead.cpf = extractedCpf;
                    console.log(`[Webhook] 📋 CPF auto-extracted from message: ${extractedCpf} → lead ${lead.id}`);
                }
            }
        } catch (err) {
            console.warn('[Webhook] CPF extraction from message failed (non-critical):', err);
        }

        // ── Auto-extract client name from message and update CRM card ──
        // Fires when: name looks like a phone number, a default 'Lead XXXX',
        // or a WhatsApp display name that may contain emojis.
        try {
            const currentName = String(lead.name || '');
            const currentPhone = String(lead.phone || '');
            const hasEmoji = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/u.test(currentName);
            const isDefaultName =
                currentName === currentPhone ||
                currentName.startsWith('Lead ') ||
                /^\d+$/.test(currentName) ||
                currentName.includes('@lid') ||
                hasEmoji; // WhatsApp display name with emoji (e.g. "🐼 Tarcísio")

            if (isDefaultName) {
                const extractedName = extractName(message);
                if (extractedName) {
                    await db('leads').where({ id: lead.id }).update({ name: extractedName, updated_at: new Date() });
                    lead.name = extractedName;
                    console.log(`[Webhook] 👤 Name extracted: "${extractedName}" → lead ${lead.id}`);
                    // Push name update to CRM Kanban card in real-time
                    const wssName = getWebSocketServer();
                    if (wssName) wssName.emit('lead_updated', { lead_id: lead.id, name: extractedName });
                }
            }
        } catch (err) {
            console.warn('[Webhook] Name extraction from message failed (non-critical):', err);
        }

        // ── Advance stage: reception → approach on first real message ──
        try {
            const currentBotStage = String(lead.bot_stage || 'reception');
            if (currentBotStage === 'reception') {
                const funnel = await db('funnels').where({ id: lead.funnel_id }).first() as { slug: string } | undefined;
                const funnelSlug = funnel?.slug ?? 'trabalhista';
                await advanceBotStage(lead.id as number, funnelSlug, 'approach', conversation?.id);
                lead.bot_stage = 'approach';
                // Detect and save gender when name first arrives
                if (lead.name && typeof lead.name === 'string' && lead.name !== phone) {
                    const gender = detectGender(lead.name as string);
                    await db('leads').where({ id: lead.id }).update({ gender });
                }
            }
        } catch (err) {
            console.warn('[Webhook] Stage advance reception→approach failed (non-critical):', err);
        }

        // Notify CRM via WebSocket (real-time update)
        const wss = getWebSocketServer();
        if (wss) {
            wss.emit('new_message', {
                lead_id: lead.id,
                lead_name: lead.name,
                message: message.substring(0, 100),
                conversation_id: conversation.id,
            });
        }

        // Process AI bot response if bot is active
        if (lead.bot_active) {
            // ── Business hours check (BRT = UTC-3) ──
            // Sofia atende 24h, mas fora do horário comercial (antes das 8h ou
            // depois das 18h) a frase de encerramento dela deve avisar que a
            // equipe entrará em contato amanhã de manhã.
            const now = new Date();
            const brtHour = (now.getUTCHours() - 3 + 24) % 24;
            const isOffHours = brtHour < 8 || brtHour >= 18;
            // Flag is passed to processAIBotResponse via the lead object
            (lead as Record<string, unknown>)._isOffHours = isOffHours;


            // ── Document image validation pipeline ──
            // Runs for ANY image received, regardless of bot_stage.
            // Flush any pending text buffer first so the image has full context.
            if (imageBase64 && imageMimeType) {
                if (_leadBuffers.has(phone)) {
                    console.log(`[Buffer] 🖼️ Image received — flushing pending text for ${phone} before document pipeline`);
                    await flushBuffer(phone);
                }
                await processDocumentImage(
                    lead,
                    conversation.id,
                    imageBase64,
                    imageMimeType,
                    msgId,
                    documentId
                );
                return; // Sofia's response is handled inside processDocumentImage
            }

            // ── Debounce: buffer text/audio messages ─────────────────────
            // Sofia waits for the client to stop typing (10s silence) before
            // responding, so broken sentences are read as a single message.
            addToBuffer(phone, message, lead, conversation.id);
        }
    } catch (err) {
        console.error('Process incoming message error:', err);
    }
}

// ============================================================
// Full document validation pipeline
// Called when lead is in document_request stage and sends an image
// ============================================================
async function processDocumentImage(
    lead: Record<string, unknown>,
    conversationId: number,
    imageBase64: string,
    imageMimeType: string,
    initialMsgId?: number,
    initialDocId?: number
): Promise<void> {
    const leadId = lead.id as number;
    const phone = String(lead.phone || '');
    const targetPhone = String(lead.whatsapp_id || phone);
    // Bug #1 Fix: getDocState is now async and reads from DB (survives restarts)
    const docState = await getDocState(leadId);
    console.log(`[DocState] Lead ${leadId}: id_front=${docState.id_front_done} | id_back=${docState.id_back_done} | proof=${docState.proof_of_address_done}`);

    try {
        await aiService.sendWhatsAppMessage(targetPhone, 'só um minuto por favor ⏳');

        // Get funnel slug for checklist
        const funnel = await db('funnels').where({ id: lead.funnel_id }).first() as { slug: string } | undefined;
        const funnelSlug = funnel?.slug ?? 'default';

        // Build context: tell analyzeImage which doc is currently expected
        const checklist = await getDocumentChecklist(leadId, funnelSlug);
        const nextExpected = checklist.missing[0] ?? null;
        const analysisContext = nextExpected
            ? `O cliente está no processo de coleta de documentos para o funil "${funnelSlug}". O próximo documento esperado é: "${nextExpected}". Se a imagem for compatível com esse tipo de documento, classifique como "${nextExpected}".`
            : `O cliente está no funil "${funnelSlug}" e pode estar enviando qualquer documento relacionado ao caso.`;

        // Analyze image via Gemini Vision
        const analysis = await analyzeImage(imageBase64, imageMimeType, analysisContext);
        const docType = analysis.docType;
        console.log(`[Doc] 🔍 Analysis: isLegible=${analysis.isLegible} | docType=${docType} | issues=${analysis.issues} | extractedText=${(analysis.extractedText || '').substring(0, 80)}`);

        // ── CASE 1: Image is NOT legible ──
        if (!analysis.isLegible) {
            const isTechnicalError = analysis.issues?.startsWith('technical_error:');

            let replyMsg: string;
            let inboundLabel: string;

            if (isTechnicalError) {
                replyMsg = 'Opa, tive um probleminha para processar essa imagem. Pode mandar ela de novo, por favor? 🙏';
                inboundLabel = '[Imagem recebida — erro de processamento]';
                console.warn(`[Doc] ⚠️ Technical error during analysis: ${analysis.issues}`);
            } else {
                const issueMsg = analysis.issues && analysis.issues !== 'nenhum'
                    ? analysis.issues
                    : 'a imagem ficou difícil de ler';
                replyMsg = `Poxa, ${issueMsg}. Consegue mandar essa foto de novo, um pouco mais nítida? Tira com boa iluminação, sem reflexo e sem cortar as bordas do documento 🙏`;
                inboundLabel = '[Imagem recebida — ilegível]';
            }

            // Save the rejected image so the CRM can display it
            let rejDocUrl: string | null = null;
            if (initialDocId) {
                await db('documents').where({ id: initialDocId }).update({ name: `[Ilegível] ${docType}`, status: 'rejeitado', notes: analysis.issues });
                rejDocUrl = `/api/leads/${leadId}/documents/${initialDocId}/download`;
            } else {
                const rejFilePath = saveImageToDisk(leadId, imageBase64, imageMimeType, `recebido_rejeitado_${Date.now()}`);
                const [rejDocId] = await db('documents').insert({ lead_id: leadId, name: `[Ilegível] ${docType}`, file_type: imageMimeType, file_path: rejFilePath, status: 'rejeitado', notes: analysis.issues });
                rejDocUrl = rejFilePath ? `/api/leads/${leadId}/documents/${rejDocId}/download` : null;
            }

            if (initialMsgId) {
                await db('messages').where({ id: initialMsgId }).update({ content: inboundLabel, image_url: rejDocUrl });
            } else {
                await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: inboundLabel, direction: 'inbound', sender: 'lead', media_type: 'image', image_url: rejDocUrl });
            }
            await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: replyMsg, direction: 'outbound', sender: 'bot' });
            await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: isTechnicalError ? `[Análise de mídia] ⚠️ Erro técnico — ${analysis.issues}` : `[Análise de mídia] ❌ Documento rejeitado — ${docType} | Motivo: ${analysis.issues}` });

            const wss = getWebSocketServer();
            if (wss) wss.emit('bot_response', { lead_id: leadId, message: replyMsg });
            await aiService.sendFragmentedMessage(targetPhone, replyMsg);
            return;
        }

        // ── CASE 2: Image IS legible — Enforce data extraction ──
        const isIDDoc = (docType === 'RG' || docType === 'CNH');
        const isComprovante = (docType === 'Comprovante de Residência');
        const textData = analysis.extractedText || '';

        // ── RG/CNH handling: enforce name + CPF extraction ──
        if (isIDDoc) {
            const extractedCpf = extractCPF(textData);
            const extractedName = extractName(textData);

            // If this is the FRONT (name/cpf not yet gotten) we REQUIRE name + CPF extraction
            if (!docState.id_front_done) {
                if (!extractedName && !extractedCpf) {
                    // Extraction failed — reject the document and ask again
                    const rejectMsg = `Recebi a foto, mas não consegui ler os dados do documento com clareza (nome e CPF precisam estar visíveis). Pode tirar uma nova foto da FRENTE do documento com boa iluminação, sem reflexo e preenchendo bem a tela do celular? 🙏`;

                    const contentStr = `[Imagem recebida — ${docType} frente, dados ilegíveis]`;
                    if (initialMsgId) {
                        await db('messages').where({ id: initialMsgId }).update({ content: contentStr });
                    } else {
                        await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: contentStr, direction: 'inbound', sender: 'lead', media_type: 'image' });
                    }
                    if (initialDocId) {
                        await db('documents').where({ id: initialDocId }).update({ name: `[Ilegível] ${docType} frente`, status: 'rejeitado' });
                    }
                    await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: rejectMsg, direction: 'outbound', sender: 'bot' });
                    await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: `[Análise de mídia] ❌ ${docType} frente rejeitada — Nome e CPF não extraíveis` });

                    const wss = getWebSocketServer();
                    if (wss) wss.emit('bot_response', { lead_id: leadId, message: rejectMsg });
                    await aiService.sendFragmentedMessage(targetPhone, rejectMsg);
                    return;
                }

                // Front validated — extract and save data
                const updates: Record<string, string> = {};
                if (extractedCpf && !lead.cpf) {
                    updates.cpf = extractedCpf;
                    console.log(`[Doc] 📋 CPF extracted from ${docType} front: ${extractedCpf}`);
                }
                const currentName = String(lead.name || '');
                if (extractedName && (!/^[A-Za-záàãâéêíóôõúüçÁÀÃÂÉÊÍÓÔÕÚÜÇ\s]+$/.test(currentName.trim()) || currentName === phone || currentName.startsWith('Lead '))) {
                    updates.name = extractedName;
                    console.log(`[Doc] 📋 Name extracted from ${docType} front: ${extractedName}`);
                }
                if (Object.keys(updates).length > 0) {
                    await db('leads').where({ id: leadId }).update(updates);
                    Object.assign(lead, updates);
                    const wssName = getWebSocketServer();
                    if (wssName) wssName.emit('lead_updated', { lead_id: leadId, ...updates });
                }

                // Save document and mark front as done
                let frontDocUrl: string | null = null;
                if (initialDocId) {
                    await db('documents').where({ id: initialDocId }).update({ name: `${docType} (frente)`, status: 'aprovado', notes: textData });
                    frontDocUrl = `/api/leads/${leadId}/documents/${initialDocId}/download`;
                } else {
                    const frontFilePath = saveImageToDisk(leadId, imageBase64, imageMimeType, `${docType}_frente`);
                    const [frontDocId] = await db('documents').insert({ lead_id: leadId, name: `${docType} (frente)`, file_type: imageMimeType, file_path: frontFilePath, status: 'aprovado', notes: textData });
                    frontDocUrl = frontFilePath ? `/api/leads/${leadId}/documents/${frontDocId}/download` : null;
                }
                await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: `[Análise de mídia] ✅ ${docType} frente aprovada | Nome: ${extractedName || 'N/D'} | CPF: ${extractedCpf || 'N/D'}` });
                
                const contentStrFront = `[Imagem recebida — ${docType} frente ✅]`;
                if (initialMsgId) {
                    await db('messages').where({ id: initialMsgId }).update({ content: contentStrFront, image_url: frontDocUrl });
                } else {
                    await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: contentStrFront, direction: 'inbound', sender: 'lead', media_type: 'image', image_url: frontDocUrl });
                }

                docState.id_front_done = true;

                // Ask for the back side
                const askBackMsg = `Perfeito, ${docType} frente validado! ✅\n\nAgora me manda uma foto do VERSO do mesmo documento, por favor.`;
                await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: askBackMsg, direction: 'outbound', sender: 'bot' });
                const wss = getWebSocketServer();
                if (wss) wss.emit('bot_response', { lead_id: leadId, message: askBackMsg });
                if (wss) wss.emit('new_message', { lead_id: leadId, lead_name: lead.name, message: `[${docType} frente validado]`, conversation_id: conversationId });
                await aiService.sendFragmentedMessage(targetPhone, askBackMsg);
                return;

            } else if (!docState.id_back_done) {
                // This is the BACK — just accept it (less strict, just needs legibility)
                let backDocUrl: string | null = null;
                if (initialDocId) {
                    await db('documents').where({ id: initialDocId }).update({ name: `${docType} (verso)`, status: 'aprovado', notes: textData });
                    backDocUrl = `/api/leads/${leadId}/documents/${initialDocId}/download`;
                } else {
                    const backFilePath = saveImageToDisk(leadId, imageBase64, imageMimeType, `${docType}_verso`);
                    const [backDocId] = await db('documents').insert({ lead_id: leadId, name: `${docType} (verso)`, file_type: imageMimeType, file_path: backFilePath, status: 'aprovado', notes: textData });
                    backDocUrl = backFilePath ? `/api/leads/${leadId}/documents/${backDocId}/download` : null;
                }
                await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: `[Análise de mídia] ✅ ${docType} verso aprovado` });
                
                const contentStrBack = `[Imagem recebida — ${docType} verso ✅]`;
                if (initialMsgId) {
                    await db('messages').where({ id: initialMsgId }).update({ content: contentStrBack, image_url: backDocUrl });
                } else {
                    await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: contentStrBack, direction: 'inbound', sender: 'lead', media_type: 'image', image_url: backDocUrl });
                }

                docState.id_back_done = true;

                // Ask for comprovante next — send guide image proactively
                const funnelSlugForAddress = funnelSlug;
                const askComprovanteMsg = `Verso recebido, obrigada! ✅\n\nAgora preciso do seu comprovante de residência atualizado (últimos 2 meses). Pode ser conta de água, luz, gás ou telefone fixo.`;
                await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: askComprovanteMsg, direction: 'outbound', sender: 'bot' });
                const wss = getWebSocketServer();
                if (wss) wss.emit('bot_response', { lead_id: leadId, message: askComprovanteMsg });
                if (wss) wss.emit('new_message', { lead_id: leadId, lead_name: lead.name, message: `[${docType} verso validado]`, conversation_id: conversationId });
                await aiService.sendFragmentedMessage(targetPhone, askComprovanteMsg);
                // Send guide image after the text
                await sendComprovanteGuideImage(targetPhone);
                return;
            }
        }

        // ── Comprovante de Residência: enforce address extraction ──
        if (isComprovante) {
            const roughAddress = textData.split('\n').slice(0, 4).join(', ').trim().substring(0, 200);

            if (!roughAddress || roughAddress.length < 10) {
                // Extraction failed
                const rejectMsg = `Recebi a foto, mas não consegui ler o endereço no comprovante. Pode tirar uma foto mais nítida? O endereço precisa aparecer com clareza, sem cortar e sem reflexo 🙏`;

                const contentStrAddr = '[Imagem recebida — Comprovante, endereço ilegível]';
                if (initialMsgId) {
                    await db('messages').where({ id: initialMsgId }).update({ content: contentStrAddr });
                } else {
                    await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: contentStrAddr, direction: 'inbound', sender: 'lead', media_type: 'image' });
                }
                if (initialDocId) {
                    await db('documents').where({ id: initialDocId }).update({ name: `[Ilegível] Comprovante`, status: 'rejeitado' });
                }
                await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: rejectMsg, direction: 'outbound', sender: 'bot' });
                await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: `[Análise de mídia] ❌ Comprovante de Residência rejeitado — endereço não extraível` });

                const wss = getWebSocketServer();
                if (wss) wss.emit('bot_response', { lead_id: leadId, message: rejectMsg });
                await aiService.sendFragmentedMessage(targetPhone, rejectMsg);
                return;
            }

            // Save extracted address
            if (!lead.address) {
                await db('leads').where({ id: leadId }).update({ address: roughAddress });
                lead.address = roughAddress;
                console.log(`[Doc] 📋 Address extracted from Comprovante: ${roughAddress}`);
                const wss = getWebSocketServer();
                if (wss) getWebSocketServer()?.emit('lead_updated', { lead_id: leadId, address: roughAddress });
            }

            docState.proof_of_address_done = true;
        }

        // ── Generic: save document and check checklist ──
        if (!isIDDoc || docState.id_back_done) {
            // For non-ID docs or after both sides of ID are done, save normally
            const docSavedName = isComprovante ? 'Comprovante de Residência' : docType;

            if (!isIDDoc) {
                // Save doc normally (for Holerite, CTPS, Comprovante Pix, etc.)
                let genericDocUrl: string | null = null;
                if (initialDocId) {
                    await db('documents').where({ id: initialDocId }).update({ name: docSavedName, status: 'aprovado', notes: textData });
                    genericDocUrl = `/api/leads/${leadId}/documents/${initialDocId}/download`;
                } else {
                    const genericFilePath = saveImageToDisk(leadId, imageBase64, imageMimeType, docSavedName.replace(/\s+/g, '_'));
                    const [genericDocId] = await db('documents').insert({ lead_id: leadId, name: docSavedName, file_type: imageMimeType, file_path: genericFilePath, status: 'aprovado', notes: textData });
                    genericDocUrl = genericFilePath ? `/api/leads/${leadId}/documents/${genericDocId}/download` : null;
                }
                await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: `[Análise de mídia] ✅ ${docSavedName} aprovado | Dados: ${textData.substring(0, 100) || 'N/D'}` });
                
                const contentStrGen = `[Imagem recebida — ${docSavedName} ✅]`;
                if (initialMsgId) {
                    await db('messages').where({ id: initialMsgId }).update({ content: contentStrGen, image_url: genericDocUrl });
                } else {
                    await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: contentStrGen, direction: 'inbound', sender: 'lead', media_type: 'image', image_url: genericDocUrl });
                }
            }

            // Recalculate checklist
            const updatedChecklist = await getDocumentChecklist(leadId, funnelSlug);
            const allReceived = updatedChecklist.missing.length === 0;

            let replyMsg: string;

            if (allReceived) {
                const nextBotStage = funnelSlug === 'golpe-pix' ? 'procuracao_docs' : 'analysis';
                await advanceBotStage(leadId, funnelSlug, nextBotStage, conversationId);

                if (nextBotStage === 'analysis') {
                    generateAndSaveCaseSummary(lead, conversationId, funnelSlug).catch(err =>
                        console.error('[Bot] Background summary (docs complete) failed:', err)
                    );
                }

                replyMsg = `${docSavedName} recebido e aprovado! ✅\n\nPerfeito! Já tenho todos os documentos necessários. Um dos nossos assessores vai entrar em contato em breve com as próximas etapas. Fique tranquilo(a)! 🙏`;
            } else {
                // Ask for next missing doc
                const nextMissing = updatedChecklist.missing[0];
                const isNextID = nextMissing === 'RG';
                replyMsg = `${docSavedName} recebido! ✅\n\nAgora preciso ${isNextID ? 'do seu RG ou CNH — pode começar pela FRENTE do documento' : `do(a) ${nextMissing}`}.`;
                if (isNextID) {
                    // Will send guide image after the text
                    setTimeout(() => sendRGGuideImage(targetPhone).catch(() => {}), 1500);
                }
            }

            await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: replyMsg, direction: 'outbound', sender: 'bot' });
            const wss = getWebSocketServer();
            if (wss) wss.emit('bot_response', { lead_id: leadId, message: replyMsg });
            if (wss) wss.emit('new_message', { lead_id: leadId, lead_name: lead.name, message: `[Imagem — ${docSavedName}]`, conversation_id: conversationId });
            await aiService.sendFragmentedMessage(targetPhone, replyMsg);

            console.log(`[Doc] ✅ Document saved: ${docSavedName} | Lead: ${leadId} | Remaining: ${updatedChecklist.missing.join(', ') || 'none'}`);
        }
    } catch (err) {
        console.error('[Doc] processDocumentImage error:', err);
    }
}



async function processAIBotResponse(
    lead: Record<string, unknown>,
    userMessage: string,
    conversationId: number,
    phone: string
): Promise<void> {
    // 🛑 STOP & RESTART: Register AbortController for this lead
    const abortController = new AbortController();
    _activeProcessing.set(phone, abortController);
    const signal = abortController.signal;

    try {
        const targetPhone = String(lead.whatsapp_id || phone);

        // Get full conversation history with sender info for compression
        const rawHistory = await db('messages')
            .where('conversation_id', conversationId)
            .orderBy('sent_at', 'asc')
            .limit(20)
            .select('content', 'direction', 'sender');

        // Build compressed history (last 6 msgs + summary of older ones)
        const conversationHistory = buildCompressedHistory(
            rawHistory as Array<{ direction: string; content: string; sender: string }>
        );

        // Exclude the last message (current user msg) from history sent to AI
        const historyWithoutLast = conversationHistory.slice(0, -1);

        // Build rich lead context with current bot stage + funnel stage instructions
        const leadContext = await buildLeadContext(lead.id as number);

        // Detect emotional state and inject into context
        const emotionalState = detectEmotionalState(userMessage);
        const emotionContext = emotionalState !== 'neutral'
            ? `\nEstado emocional atual do cliente: [${emotionalState}] — ${emotionalState === 'anxious' ? 'Responda com mais validação emocional antes de pedir documentos.' : emotionalState === 'angry' ? 'Responda com calma, valide a frustração, não seja formal demais.' : 'O cliente está positivo, mantenha o bom tom.'}`
            : '';

        // Get relevant memory patterns for smarter replies
        const memories = await getRelevantMemories(userMessage);

        // ── Inject document checklist context ──
        const funnel = await db('funnels').where({ id: lead.funnel_id }).first() as { slug: string } | undefined;
        const funnelSlug = funnel?.slug ?? 'default';
        const docsContext = await buildDocumentContext(lead.id as number, funnelSlug);

        // ── Off-hours context: adjust Sofia's closing message ──
        const isOffHours = (lead as Record<string, unknown>)._isOffHours === true;
        const offHoursContext = isOffHours
            ? '\n[HORÁRIO FORA DO EXPEDIENTE]: Estamos fora do horário comercial (antes das 8h ou depois das 18h). Você (Sofia) pode e DEVE continuar atendendo normalmente, porém quando for encerrar a conversa ou se despedir, em vez de dizer que já vai encaminhar para alguém, diga que a equipe/pessoal vai entrar em contato com o cliente amanhã de manhã. Exemplo: "amanhã cedinho nosso pessoal vai entrar em contato com você!" — adapte com naturalidade ao contexto.'
            : '';

        const fullContext = leadContext + emotionContext + docsContext + offHoursContext;

        // 🛑 CHECKPOINT 1: Check before calling AI (avoid wasting API call)
        if (signal.aborted) {
            console.log(`[Bot] 🛑 STOP & RESTART: Processing cancelled BEFORE AI call for ${phone} — new message arrived`);
            return;
        }

        const botReply = await aiService.generateBotReply(
            historyWithoutLast,
            userMessage,
            fullContext,
            memories
        );

        if (!botReply) return;

        // 🛑 CHECKPOINT 2: Check after AI responds (discard stale reply)
        if (signal.aborted) {
            console.log(`[Bot] 🛑 STOP & RESTART: Processing cancelled AFTER AI call for ${phone} — discarding reply: "${botReply.substring(0, 60)}..."`);
            return;
        }

        await db('messages').insert({
            conversation_id: conversationId,
            lead_id: lead.id as number,
            content: botReply,
            direction: 'outbound',
            sender: 'bot',
        });

        const wss = getWebSocketServer();
        if (wss) {
            wss.emit('bot_response', { lead_id: lead.id, message: botReply });
        }

        // ── Stage advancement detection based on bot reply semantics ──
        // Detect keywords in Sofia's reply that signal she moved to the next stage
        try {
            // Bug #2 Fix: The generic error message contains "assessor" + "contato" which
            // would prematurely trigger nextStage = 'analysis'. Block detection for it.
            const TECHNICAL_ERROR_MSG = 'desculpe, tive um problema técnico';
            const isErrorMessage = botReply.toLowerCase().includes(TECHNICAL_ERROR_MSG);
            if (isErrorMessage) {
                console.log(`[Bot] ⚠️ Skipping stage detection — technical error message detected, not a real stage transition`);
                // eslint-disable-next-line no-throw-literal
                throw 'skip'; // jump to catch to exit try block cleanly
            }

            const currentBotStage = String(lead.bot_stage || 'approach');
            const replyLower = botReply.toLowerCase();

            let nextStage: string | null = null;

            if (currentBotStage === 'approach') {
                // Golpe Pix: approach → info_collection when Sofia asks about comprovante pix
                if (funnelSlug === 'golpe-pix' && (replyLower.includes('comprovante do pix') || replyLower.includes('comprovante da transferência') || replyLower.includes('transferência?'))) {
                    nextStage = 'info_collection';
                } else if (replyLower.includes('rg') || replyLower.includes('cnh') || replyLower.includes('holerite') || replyLower.includes('carteira de trabalho') || replyLower.includes('comprovante de residência')) {
                    // Other funnels: approach → doc_request when Sofia asks for documents
                    nextStage = 'doc_request';
                }
            }

            if (currentBotStage === 'info_collection' && funnelSlug === 'golpe-pix') {
                // info_collection → doc_request when Sofia pivots to asking personal docs
                if (replyLower.includes('rg') || replyLower.includes('cnh') || replyLower.includes('comprovante de residência') || replyLower.includes('carteira de trabalho')) {
                    nextStage = 'doc_request';
                }
            }

            // Negativado: approach → doc_request when Sofia asks for RG/CNH
            // (This is handled by the generic rule above, but we ensure it doesn't skip to analysis)
            if (currentBotStage === 'approach' && funnelSlug === 'negativado') {
                // Prevent premature jump to analysis — Sofia must go through doc_request first
                if (nextStage === 'analysis') nextStage = null;
            }

            // Universal: if Sofia explicitly says case goes to analysis / assessor
            if (currentBotStage !== 'analysis' && currentBotStage !== 'reception') {
                if ((replyLower.includes('análise') || replyLower.includes('caso vai para análise')) &&
                    (replyLower.includes('assessor') && replyLower.includes('contato'))) {
                    nextStage = 'analysis';
                }
            }

            if (nextStage && nextStage !== currentBotStage) {
                await advanceBotStage(lead.id as number, funnelSlug, nextStage, conversationId);
                lead.bot_stage = nextStage;

                // If reaching analysis, generate and save the case summary
                if (nextStage === 'analysis') {
                    // Run async — don't block the reply
                    generateAndSaveCaseSummary(lead, conversationId, funnelSlug).catch(err =>
                        console.error('[Bot] Background summary failed:', err)
                    );
                }

                // If just entering doc_request, proactively send the RG guide image
                if (nextStage === 'doc_request') {
                    setTimeout(() => {
                        sendRGGuideImage(targetPhone).catch(err =>
                            console.warn('[Bot] Guide image send failed (non-critical):', err)
                        );
                    }, 2000); // 2s after Sofia's text
                }
            }
        } catch (err) {
            console.warn('[Bot] Stage detection from reply failed (non-critical):', err);
        }

        // ── Also detect legal area from Sofia's reply (catches ambiguous user messages) ──
        // e.g. user says "bom dia" and Sofia identifies it's a Golpe do Pix case
        try {
            const replyAreaDetected = detectLegalArea(botReply);
            if (replyAreaDetected) {
                const targetSlug = AREA_TO_FUNNEL_SLUG[replyAreaDetected];
                if (targetSlug) {
                    const currentFunnelForCheck = await db('funnels').where({ id: lead.funnel_id }).first() as { id: number; slug: string } | undefined;
                    // Migrate to the detected funnel if it's different from current
                    // (covers any direction: trabalhista→pix, pix→trabalhista, etc.)
                    if (currentFunnelForCheck && currentFunnelForCheck.slug !== targetSlug) {
                        const targetFunnelForReply = await db('funnels').where({ slug: targetSlug }).first();
                        if (targetFunnelForReply) {
                            const abordagemStageReply = await db('stages').where({ slug: 'abordagem' }).first();
                            const stageIdReply = abordagemStageReply ? abordagemStageReply.id : 2;

                            await db('leads').where({ id: lead.id }).update({
                                funnel_id: targetFunnelForReply.id,
                                stage_id: stageIdReply,
                                bot_stage: 'approach'
                            });
                            lead.funnel_id = targetFunnelForReply.id;
                            lead.stage_id = stageIdReply;
                            lead.bot_stage = 'approach';

                            console.log(`[Bot] 🔀 Lead ${lead.id} auto-moved (AI reply): ${currentFunnelForCheck.slug} → ${targetSlug} | Stage set to Abordagem`);
                            // Notify CRM — emits both events for compatibility
                            const wssReply = getWebSocketServer();
                            if (wssReply) {
                                wssReply.emit('lead_updated', { lead_id: lead.id, funnel_id: targetFunnelForReply.id, stage_id: stageIdReply, bot_stage: 'approach' });
                                wssReply.emit('stage_changed', { lead_id: lead.id, funnel_slug: targetSlug });
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('[Bot] Auto-funnel detection from reply failed (non-critical):', err);
        }

        // 🛑 CHECKPOINT 3: Check before sending to WhatsApp (last chance to cancel)
        if (signal.aborted) {
            console.log(`[Bot] 🛑 STOP & RESTART: Processing cancelled BEFORE WhatsApp send for ${phone} — reply saved to DB but not sent`);
            return;
        }

        // Send reply in fragments (variable delay, typing presence)
        await aiService.sendFragmentedMessage(targetPhone, botReply, signal);
    } catch (err) {
        // 🛑 If aborted, this is expected — not a real error
        if (signal.aborted) {
            console.log(`[Bot] 🛑 STOP & RESTART: Processing aborted (expected) for ${phone}`);
            return;
        }
        console.error('AI bot processing error:', err);
    } finally {
        // Clean up only if this is still the active controller for this phone
        if (_activeProcessing.get(phone) === abortController) {
            _activeProcessing.delete(phone);
        }
    }
}


function normalizeWebhookPayload(payload: Record<string, unknown>): {
    phone: string;
    name: string;
    message: string;
    whatsappId: string;
    chatId: string;
    audioBase64?: string;
    audioMimeType?: string;
    imageBase64?: string;
    imageMimeType?: string;
} | null {
    try {
        // Only process messages.upsert events — ignore connection.update, qrcode.updated, etc.
        const event = String(payload.event || '');
        if (event && event !== 'messages.upsert') return null;

        // Evolution API / Baileys bridge format: { event, instance, data: msg }
        if (payload.data && typeof payload.data === 'object') {
            const data = payload.data as Record<string, unknown>;
            const key = data.key as Record<string, unknown>;
            let messageContent = data.message as Record<string, unknown>;

            if (!key || !messageContent) return null;

            // ── Unwrap Baileys protobuf wrappers ──
            // WhatsApp wraps messages in containers like ephemeralMessage,
            // viewOnceMessage, viewOnceMessageV2, documentWithCaptionMessage.
            // We need to dig through these to find the actual content.
            const wrapperKeys = [
                'ephemeralMessage',
                'viewOnceMessage',
                'viewOnceMessageV2',
                'viewOnceMessageV2Extension',
                'documentWithCaptionMessage',
            ];
            for (const wk of wrapperKeys) {
                if (messageContent[wk] && typeof messageContent[wk] === 'object') {
                    const inner = (messageContent[wk] as Record<string, unknown>).message;
                    if (inner && typeof inner === 'object') {
                        console.log(`[Webhook] Normalize: unwrapped ${wk}`);
                        messageContent = inner as Record<string, unknown>;
                    }
                }
            }

            // Log messageContent keys for debugging
            const msgKeys = Object.keys(messageContent);
            console.log(`[Webhook] Normalize: messageContent keys = [${msgKeys.join(', ')}]`);

            // CRITICAL: Ignore messages sent BY the bot (fromMe = true)
            if (key.fromMe === true) {
                console.log('[Webhook] Skipping outbound message (fromMe=true)');
                return null;
            }

            // Ignore group messages
            const remoteJid = String(key.remoteJid || '');
            if (remoteJid.includes('@g.us')) {
                console.log('[Webhook] Skipping group message');
                return null;
            }

            const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
            if (!phone) return null;

            // Check for audio message (audioMessage OR pttMessage for push-to-talk)
            const audioMessage = (messageContent.audioMessage || messageContent.pttMessage) as Record<string, unknown> | undefined;
            let audioBase64: string | undefined;
            let audioMimeType: string | undefined;

            if (audioMessage) {
                audioBase64 = data.audioBase64 as string | undefined;
                audioMimeType = (audioMessage.mimetype as string) || 'audio/ogg';
                console.log(`[Webhook] Normalize: audio found via messageContent | mime=${audioMimeType} | hasBase64=${!!audioBase64} | isPtt=${!!messageContent.pttMessage}`);
            } else if (data.audioBase64) {
                // FALLBACK: Bridge injected audioBase64 but messageContent keys were lost in serialization
                audioBase64 = data.audioBase64 as string;
                audioMimeType = 'audio/ogg';
                console.log(`[Webhook] Normalize: audio found via data.audioBase64 FALLBACK | base64 size=${audioBase64.length} chars`);
            }

            // Check for image message (document/photo)
            const imageMessage = messageContent.imageMessage as Record<string, unknown> | undefined;
            let imageBase64: string | undefined;
            let imageMimeType: string | undefined;

            if (imageMessage && !audioMessage && !audioBase64) {
                imageBase64 = (data.imageBase64 ?? data.mediaBase64) as string | undefined;
                imageMimeType = (imageMessage.mimetype as string) || 'image/jpeg';
                console.log(`[Webhook] Normalize: image found via messageContent | mime=${imageMimeType} | hasBase64=${!!imageBase64}`);
            } else if (!audioBase64 && (data.imageBase64 || data.mediaBase64)) {
                // FALLBACK: Bridge injected imageBase64 but imageMessage key was lost
                imageBase64 = (data.imageBase64 ?? data.mediaBase64) as string | undefined;
                imageMimeType = 'image/jpeg';
                if (imageBase64) {
                    console.log(`[Webhook] Normalize: image found via data.imageBase64 FALLBACK | base64 size=${imageBase64.length} chars`);
                }
            }

            // Log payload keys for debugging media issues
            const dataKeys = Object.keys(data).filter(k => k !== 'message');
            console.log(`[Webhook] Normalize: data keys = [${dataKeys.join(', ')}]`);

            const message =
                (messageContent.conversation as string) ||
                (messageContent.extendedTextMessage as Record<string, string>)?.text ||
                (audioBase64 || audioMessage ? '[Áudio]' : imageBase64 || imageMessage ? '[Imagem]' : '[Media]');

            const pushName = String(data.pushName || phone);

            return {
                phone,
                name: pushName,
                message,
                whatsappId: remoteJid,
                chatId: remoteJid,
                audioBase64,
                audioMimeType,
                imageBase64,
                imageMimeType,
            };
        }

        // Generic/Baileys format
        if (payload.phone && payload.message) {
            return {
                phone: String(payload.phone),
                name: String(payload.name || payload.phone),
                message: String(payload.message),
                whatsappId: String(payload.whatsappId || payload.phone),
                chatId: String(payload.chatId || payload.phone),
            };
        }

        return null;
    } catch {
        return null;
    }
}

// Get conversations list for a lead
export async function getConversations(req: Request, res: Response): Promise<void> {
    const { lead_id } = req.params;
    try {
        const messages = await db('messages')
            .where({ lead_id: Number(lead_id) })
            .orderBy('sent_at', 'asc');

        res.json({ success: true, data: messages });
    } catch (err) {
        console.error('Get conversations error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar conversas' });
    }
}

// Send a manual message from assessor
export async function sendMessage(req: Request, res: Response): Promise<void> {
    const { lead_id } = req.params;
    const { content } = req.body;

    if (!content) {
        res.status(400).json({ success: false, error: 'Conteúdo é obrigatório' });
        return;
    }

    try {
        const lead = await db('leads').where({ id: Number(lead_id) }).first();
        if (!lead) {
            res.status(404).json({ success: false, error: 'Lead não encontrado' });
            return;
        }

        const conversation = await db('conversations').where({ lead_id: Number(lead_id) }).first();
        if (!conversation) {
            res.status(404).json({ success: false, error: 'Conversa não encontrada' });
            return;
        }

        const [msgId] = await db('messages').insert({
            conversation_id: conversation.id,
            lead_id: Number(lead_id),
            content,
            direction: 'outbound',
            sender: 'assessor',
            sender_user_id: req.user?.userId,
        });

        const message = await db('messages').where({ id: msgId }).first();

        res.status(201).json({ success: true, data: message });
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ success: false, error: 'Erro ao enviar mensagem' });
    }
}
