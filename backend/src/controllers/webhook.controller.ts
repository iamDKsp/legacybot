import { Request, Response } from 'express';
import { db } from '../config/database';
import { aiService, buildLeadContext, getRelevantMemories, buildCompressedHistory, transcribeAudio, analyzeImage, generateCaseSummary, sendWhatsAppImage, DocumentType, applyGuardrails } from '../services/ai.service';
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

        const hasPdfId = names.some(n => (n.startsWith('RG') || n.startsWith('CNH')) && n.includes('PDF'));
        return {
            id_front_done:        hasPdfId || names.some(n => ID_FRONT_NAMES.some(f => n.startsWith(f.split(' ')[0]) && n.includes('frente'))),
            id_back_done:         hasPdfId || names.some(n => ID_BACK_NAMES .some(b => n.startsWith(b.split(' ')[0]) && n.includes('verso'))),
            proof_of_address_done: names.some(n => PROOF_NAMES.some(p => n.startsWith(p.split(' ')[0]))),
        };
    } catch (err) {
        console.warn('[DocState] Failed to read doc state from DB — defaulting to all false:', (err as Error).message);
        return { id_front_done: false, id_back_done: false, proof_of_address_done: false };
    }
}

// ============================================================
// Save incoming image bytes to disk AND to the database
// DB storage (file_data BYTEA) ensures images survive Railway
// container restarts (ephemeral filesystem).
// ============================================================
async function saveImageAndPersist(
    leadId: number,
    base64: string,
    mimeType: string,
    docLabel: string
): Promise<{ filePath: string | null; fileData: Buffer | null }> {
    const fileData = Buffer.from(base64, 'base64');

    // Try to save to disk (works locally; ephemeral in Railway without a Volume)
    let filePath: string | null = null;
    try {
        const ext = mimeType.includes('pdf') ? 'pdf' : mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
        const dirPath = path.join(process.cwd(), 'uploads', 'documents', String(leadId));
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
        const safeName = docLabel.replace(/[^a-z0-9_\-]/gi, '_').slice(0, 40);
        const filename = `${safeName}_${Date.now()}.${ext}`;
        const fullPath = path.join(dirPath, filename);
        fs.writeFileSync(fullPath, fileData);
        filePath = fullPath;
        console.log(`[Doc] 💾 Saved image to disk: ${fullPath}`);
    } catch (err) {
        console.warn('[Doc] Disk save failed (will use DB only):', (err as Error).message);
    }

    return { filePath, fileData };
}

// ============================================================
// Save incoming audio bytes to disk AND to the database
// Same strategy as images: BYTEA in DB to survive Railway restarts
// ============================================================
async function saveAudioAndPersist(
    leadId: number,
    base64: string,
    mimeType: string,
    label: string
): Promise<{ filePath: string | null; fileData: Buffer | null }> {
    const fileData = Buffer.from(base64, 'base64');
    let filePath: string | null = null;
    try {
        const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('ogg') ? 'ogg' : 'oga';
        const dirPath = path.join(process.cwd(), 'uploads', 'audio', String(leadId));
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
        const safeName = label.replace(/[^a-z0-9_\-]/gi, '_').slice(0, 40);
        const filename = `${safeName}_${Date.now()}.${ext}`;
        const fullPath = path.join(dirPath, filename);
        fs.writeFileSync(fullPath, fileData);
        filePath = fullPath;
        console.log(`[Audio] 💾 Saved audio to disk: ${fullPath}`);
    } catch (err) {
        console.warn('[Audio] Disk save failed (will use DB only):', (err as Error).message);
    }
    return { filePath, fileData };
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

interface BufferedFile {
    fileBase64: string;
    fileMimeType: string;
    msgId: number;
    documentId: number;
}

interface FileBuffer {
    files: BufferedFile[];
    lead: Record<string, unknown>;
    conversationId: number;
    phone: string;
    timer: ReturnType<typeof setTimeout>;
}

interface ProcessDocResult {
    success: boolean;
    docType: DocumentType;
    isLegible: boolean;
    isIncomplete?: boolean;
    error?: string;
    docSavedName?: string;
    isTechnicalError?: boolean;
}

const _leadBuffers = new Map<string, LeadBuffer>();
const _fileBuffers = new Map<string, FileBuffer>();
const DEBOUNCE_MS = 30_000; // 10 seconds of silence before Sofia responds
const FILE_DEBOUNCE_MS = 8000; // 8 seconds of silence to group multi-uploads
const _processingFileLock = new Set<number>(); // leadId lock for sequential execution

// ============================================================
// BUG 1 FIX: Rate limiter para erros de imagem por lead
// Impede spam de mensagens de erro quando cliente envia galeria
// ============================================================
const _imageErrorCooldown = new Map<string, number>(); // phone → timestamp
const IMAGE_ERROR_COOLDOWN_MS = 30_000; // 30s entre msgs de erro de imagem

function canSendImageError(phone: string): boolean {
    const lastError = _imageErrorCooldown.get(phone) || 0;
    const now = Date.now();
    if (now - lastError < IMAGE_ERROR_COOLDOWN_MS) {
        console.log(`[RateLimit] 🚫 Image error suppressed for ${phone} (cooldown active)`);
        return false;
    }
    _imageErrorCooldown.set(phone, now);
    return true;
}

// ============================================================
// BUG 1 EXT: Rate limiter global de mensagens por lead
// Máximo 3 msgs outbound a cada 10s para evitar flooding
// ============================================================
const _outboundMsgCount = new Map<string, { count: number; resetAt: number }>();
const MAX_MSGS_PER_WINDOW = 3;
const MSG_WINDOW_MS = 10_000;

function canSendOutbound(phone: string): boolean {
    const now = Date.now();
    const entry = _outboundMsgCount.get(phone);
    if (!entry || now > entry.resetAt) {
        _outboundMsgCount.set(phone, { count: 1, resetAt: now + MSG_WINDOW_MS });
        return true;
    }
    if (entry.count >= MAX_MSGS_PER_WINDOW) {
        console.log(`[RateLimit] 🚫 Outbound rate limit hit for ${phone} (${entry.count}/${MAX_MSGS_PER_WINDOW} msgs in window)`);
        return false;
    }
    entry.count++;
    return true;
}

// ============================================================
// BUG 5 FIX: Mensagens terminadoras — suprimir resposta após análise
// Evita o loop 'Ok' → 'Combinado' → 'Ok' → 'Combinado'
// ============================================================
const TERMINATOR_MESSAGES = new Set([
    'ok', 'okay', 'combinado', 'blz', 'beleza', 'certo', 'entendido',
    'ta bom', 'tá bom', 'ta ok', 'tá ok', 'perfeito', 'ótimo', 'otimo',
    'fico no aguardo', 'aguardo', 'obrigado', 'obrigada', 'valeu', 'até logo',
    'ate logo', 'tchau', 'vlw', 'tmj', 'tamo junto', '👍', '🙏',
]);

function isTerminatorMessage(msg: string, botStage: string): boolean {
    if (botStage !== 'analysis') return false;
    const normalized = msg.trim().toLowerCase().replace(/[!.?,]/g, '');
    return TERMINATOR_MESSAGES.has(normalized);
}

// ============================================================
// BUG 6 FIX: Padrão de mensagem de anúncio
// Detecta o botão/formulário de anúncio e responde de forma consistente
// ============================================================
const AD_MESSAGE_PATTERN = /gostaria de fazer uma an[áa]lise gratuita/i;

function isAdLeadMessage(msg: string): boolean {
    return AD_MESSAGE_PATTERN.test(msg);
}

// ============================================================
// BUG FIX: Mutex para processamento de imagens por lead
// Previne respostas duplicadas quando cliente envia galeria
// (caso Pastor Nielson — duas mensagens contraditórias)
// ============================================================
const _imageProcessingLock = new Set<number>(); // leadId

async function withImageLock<T>(leadId: number, fn: () => Promise<T>): Promise<T | undefined> {
    if (_imageProcessingLock.has(leadId)) {
        console.log(`[ImageLock] 🔒 Image already being processed for lead ${leadId} — skipping duplicate`);
        return undefined;
    }
    _imageProcessingLock.add(leadId);
    try {
        return await fn();
    } finally {
        _imageProcessingLock.delete(leadId);
    }
}
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

function addFileToBuffer(
    phone: string,
    fileBase64: string,
    fileMimeType: string,
    msgId: number,
    documentId: number,
    lead: Record<string, unknown>,
    conversationId: number
): void {
    const existing = _fileBuffers.get(phone);
    const newFile: BufferedFile = {
        fileBase64,
        fileMimeType,
        msgId,
        documentId
    };

    if (existing) {
        clearTimeout(existing.timer);
        existing.files.push(newFile);
        existing.lead = lead; // keep freshest lead snapshot
        existing.timer = setTimeout(() => {
            flushFileBuffer(phone).catch(err => console.error(`[FileBuffer] Error flushing buffer for ${phone}:`, err));
        }, FILE_DEBOUNCE_MS);
        console.log(`[FileBuffer] ➕ Lead ${lead.id} — ${existing.files.length} files pending in buffer, timer reset`);
    } else {
        _fileBuffers.set(phone, {
            files: [newFile],
            lead,
            conversationId,
            phone,
            timer: setTimeout(() => {
                flushFileBuffer(phone).catch(err => console.error(`[FileBuffer] Error flushing buffer for ${phone}:`, err));
            }, FILE_DEBOUNCE_MS),
        });
        console.log(`[FileBuffer] 🆕 Lead ${lead.id} — first file buffered, waiting ${FILE_DEBOUNCE_MS / 1000}s`);
    }
}

async function flushFileBuffer(phone: string): Promise<void> {
    const buf = _fileBuffers.get(phone);
    if (!buf) return;
    _fileBuffers.delete(phone);

    const leadId = buf.lead.id as number;
    const conversationId = buf.conversationId;
    const targetPhone = String(buf.lead.whatsapp_id || phone);

    if (_processingFileLock.has(leadId)) {
        console.log(`[FileBuffer] 🔒 Queue already being flushed/processed for lead ${leadId} — rescheduling`);
        _fileBuffers.set(phone, buf);
        buf.timer = setTimeout(() => { flushFileBuffer(phone).catch(console.error); }, 2000);
        return;
    }
    _processingFileLock.add(leadId);

    try {
        console.log(`[FileBuffer] 🚀 Processing batch of ${buf.files.length} document(s) for lead ${leadId}`);

        const wssThinking = getWebSocketServer();
        if (wssThinking) {
            wssThinking.emit('sofia_thinking', { lead_id: leadId, thinking: true });
        }

        const results: Array<{
            file: BufferedFile;
            outcome: ProcessDocResult;
        }> = [];

        // Sequentially process each buffered file
        for (const file of buf.files) {
            const outcome = await processDocumentFile(
                leadId,
                conversationId,
                file.fileBase64,
                file.fileMimeType,
                file.msgId,
                file.documentId
            );
            results.push({ file, outcome });
        }

        const freshLead = await db('leads').where({ id: leadId }).first();
        if (!freshLead) {
            console.error(`[FileBuffer] Lead ${leadId} not found during buffer flush`);
            return;
        }

        const funnel = await db('funnels').where({ id: freshLead.funnel_id }).first() as { slug: string } | undefined;
        const funnelSlug = funnel?.slug ?? 'default';

        const updatedChecklist = await getDocumentChecklist(leadId, funnelSlug);
        const allReceived = updatedChecklist.missing.length === 0;

        let replyMsg = '';
        
        const approvedList: string[] = [];
        const rejectedList: string[] = [];
        let technicalErrorCount = 0;

        for (const res of results) {
            const docName = res.outcome.docSavedName || res.outcome.docType;
            if (res.outcome.success) {
                approvedList.push(`- **${docName}**: Recebido e validado com sucesso! ✅`);
            } else if (res.outcome.isTechnicalError) {
                technicalErrorCount++;
            } else {
                const reason = res.outcome.error || 'não foi possível ler o documento';
                rejectedList.push(`- **${docName}**: Não pudemos aceitar. Motivo: ${reason} ❌`);
            }
        }

        let sendRGGuide = false;
        let sendProofGuide = false;

        if (technicalErrorCount === results.length) {
            console.log(`[FileBuffer] 🔇 All files failed technically — Sofia will remain silent`);
            // Notify CRM via WebSocket (so frontend registers the process completed)
            const wss = getWebSocketServer();
            if (wss) {
                wss.emit('new_message', {
                    lead_id: leadId,
                    lead_name: freshLead.name,
                    message: `[Processamento de lote finalizado com erro técnico: ${buf.files.length} arquivo(s)]`,
                    conversation_id: conversationId
                });
            }
            return; // Exit silently
        } else {
            if (approvedList.length > 0) {
                replyMsg += `Recebemos os seguintes documentos:\n${approvedList.join('\n')}\n\n`;
            }

            if (rejectedList.length > 0) {
                replyMsg += `Tivemos problemas com alguns documentos:\n${rejectedList.join('\n')}\n\n`;
            }

            if (allReceived) {
                const nextBotStage = funnelSlug === 'golpe-pix' ? 'procuracao_docs' : 'analysis';
                await advanceBotStage(leadId, funnelSlug, nextBotStage, conversationId);

                if (nextBotStage === 'analysis') {
                    generateAndSaveCaseSummary(freshLead, conversationId, funnelSlug).catch(err =>
                        console.error('[FileBuffer] Background summary failed:', err)
                    );
                }

                replyMsg += `Perfeito! Todos os documentos necessários foram recebidos e validados com sucesso. 🎉\n\nNossa equipe de assessores jurídicos já foi notificada e vai analisar o seu caso em detalhes. Entraremos em contato em breve para te dar o retorno das próximas etapas. Fique tranquilo(a)! 🙏`;
            } else {
                const missingList = updatedChecklist.missing.map(req => {
                    const isID = req === 'RG' || req === 'CNH';
                    if (isID) {
                        sendRGGuide = true;
                        return `- **RG ou CNH** (precisamos da frente e do verso)`;
                    }
                    if (req === 'Comprovante de Residência') {
                        sendProofGuide = true;
                    }
                    return `- **${req}**`;
                });

                replyMsg += `Ainda faltam os seguintes documentos no seu checklist para darmos início à análise do seu caso:\n${missingList.join('\n')}\n\nPor favor, envie os documentos que faltam assim que puder!`;
            }
        }

        const wss = getWebSocketServer();
        if (wss) {
            wss.emit('new_message', {
                lead_id: leadId,
                lead_name: freshLead.name,
                message: `[Processamento de lote finalizado: ${buf.files.length} arquivo(s)]`,
                conversation_id: conversationId
            });
        }

        await aiService.sendFragmentedMessage(targetPhone, replyMsg, undefined, async (fragment) => {
            await db('messages').insert({
                conversation_id: conversationId,
                lead_id: leadId,
                content: fragment,
                direction: 'outbound',
                sender: 'bot'
            });
            if (wss) {
                wss.emit('bot_response', { lead_id: leadId, message: fragment });
            }
        });

        if (sendRGGuide) {
            setTimeout(() => sendRGGuideImage(targetPhone).catch(() => {}), 1500);
        } else if (sendProofGuide) {
            setTimeout(() => sendComprovanteGuideImage(targetPhone).catch(() => {}), 1500);
        }

    } catch (err) {
        console.error('[FileBuffer] Error flushing file buffer:', err);
    } finally {
        _processingFileLock.delete(leadId);
        const wssThinking = getWebSocketServer();
        if (wssThinking) {
            wssThinking.emit('sofia_thinking', { lead_id: leadId, thinking: false });
        }
    }
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
        pre_analise:   'pre_analise',  // NEW — equipe verifica perfil antes de pedir docs
        doc_request:   'documentacao',
        analysis:      'analise_espera',
    },
    'golpe-pix': {
        reception:       'recebido',
        approach:        'abordagem',
        info_collection: 'coleta_info',
        doc_request:     'documentacao',
        procuracao_docs: 'assinatura',
        analysis:        'analise_espera',
    },
    trabalhista: {
        reception:  'recebido',
        approach:   'abordagem',
        doc_request:'documentacao',
        analysis:   'analise_espera',
    },
    'golpe-cibernetico': {
        reception:  'recebido',
        approach:   'abordagem',
        doc_request:'documentacao',
        analysis:   'analise_espera',
    },
    geral: {
        reception:  'geral',   // TRIAGEM tem uma única coluna slug='geral'
        approach:   'geral',   // bot avança internamente mas o card fica na mesma coluna
        doc_request:'geral',
        analysis:   'geral',
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
            // Dynamically resolve admin user to avoid FK failures with hardcoded id=1
            const adminUser = await db('users').where({ role: 'admin', is_active: true }).orderBy('id', 'asc').first() as { id: number } | undefined;
            const createdBy = adminUser?.id ?? 1;

            await db('tasks').insert({
                lead_id: leadId,
                title: 'Análise do caso',
                description: `Caso de ${funnelSlug} pronto para análise. Todos os documentos foram coletados pela Sofia. Entrar em contato com o cliente para as próximas etapas.`,
                category: 'outro',
                priority: 'media',
                status: 'pendente',
                created_by: createdBy,
            });
            console.log(`[Bot] 📝 Task "Análise do caso" created automatically for lead ${leadId} (created_by=${createdBy})`);
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

        let { phone, name, message, whatsappId, chatId, audioBase64, audioMimeType, imageBase64, imageMimeType, pdfBase64, pdfMimeType, videoMimeType, hasVideoNoBase64, fromMe } = normalized;

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
            console.log('[Webhook] 🖼️ Image message detected (base64 available)');
            // We store temporarily; processDocumentImage is called after lead is loaded
        } else if (!audioBase64 && message === '[Imagem]' && !imageBase64) {
            console.warn('[Webhook] 🖼️ imageMessage detected but no base64 after re-fetch attempt — will store as placeholder');
        }

        // ── PDF document handling ──────────────────────────────────────────
        let pdfExtractedText: string | undefined;
        let pdfReadFailedSilently = false; // if true — don't let Sofia reply
        if (pdfBase64 && pdfMimeType) {
            console.log('[Webhook] 📎 PDF document detected | extracting text...');
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const pdfParse = require('pdf-parse') as (buf: Buffer, opts?: Record<string, unknown>) => Promise<{ text: string; numpages: number }>;
                const pdfBuffer = Buffer.from(pdfBase64, 'base64');
                const parsed = await pdfParse(pdfBuffer, { max: 5 }) // max 5 pages
                    .catch((e: Error) => { console.error('[Webhook] 📎 pdf-parse error:', e.message); return null; });

                if (parsed && parsed.text && parsed.text.trim().length > 20) {
                    pdfExtractedText = parsed.text.trim().slice(0, 3000); // max 3000 chars
                    message = `[PDF recebido — conteúdo extraído a seguir]\n${pdfExtractedText}`;
                    console.log(`[Webhook] 📎 PDF text extracted OK (${pdfExtractedText.length} chars): ${pdfExtractedText.substring(0, 100)}`);
                } else {
                    // PDF is image-based (scanned) — try Gemini Vision OCR as fallback
                    console.warn('[Webhook] 📎 PDF text extraction empty — trying Gemini Vision OCR fallback...');
                    try {
                        const { analyzeImage: aiAnalyzeImage } = await import('../services/ai.service');
                        const ocrResult = await aiAnalyzeImage(
                            pdfBase64,
                            'application/pdf',
                            'PDF enviado pelo cliente via WhatsApp. Extraia TODO o texto visível no documento.'
                        );
                        if (ocrResult?.extractedText && ocrResult.extractedText.trim().length > 20) {
                            pdfExtractedText = ocrResult.extractedText.trim().slice(0, 3000);
                            message = `[PDF recebido — conteúdo extraído a seguir]\n${pdfExtractedText}`;
                            console.log(`[Webhook] 📎 PDF OCR via Gemini OK (${pdfExtractedText.length} chars)`);
                        } else {
                            // Both text extraction and OCR failed — log internally, don't bother client
                            pdfReadFailedSilently = true;
                            message = '[PDF recebido — não foi possível extrair texto. Arquivo pode estar protegido ou ser uma imagem.]';
                            console.warn('[Webhook] 📎 PDF: both pdf-parse and Gemini OCR returned no text — will suppress Sofia reply');
                        }
                    } catch (ocrErr) {
                        pdfReadFailedSilently = true;
                        message = '[PDF recebido — erro ao processar]';
                        console.error('[Webhook] 📎 Gemini OCR fallback error:', (ocrErr as Error).message);
                    }
                }
            } catch (pdfErr) {
                pdfReadFailedSilently = true;
                console.error('[Webhook] 📎 PDF processing error:', (pdfErr as Error).message);
                message = '[PDF recebido — erro ao processar]';
            }
        } else if (!pdfBase64 && message === '[PDF]') {
            // Bridge sent documentMessage but no base64 (file too large or not downloaded)
            // Re-fetch was already attempted above. If still no base64, suppress Sofia.
            pdfReadFailedSilently = true;
            console.warn('[Webhook] 📎 PDF received but no base64 available after re-fetch — suppressing Sofia reply');
        }

        // Find or create lead
        // ⚠️  Busca apenas leads ATIVOS — evita reutilizar leads arquivados/rejeitados
        let lead = await db('leads')
            .where({ phone })
            .whereIn('status', ['active', 'approved'])
            .orderBy('updated_at', 'desc')
            .first();

        if (!lead) {
            // Verificar se existe lead arquivado/rejeitado com este número
            const archivedLead = await db('leads')
                .where({ phone })
                .whereIn('status', ['archived', 'rejected'])
                .orderBy('updated_at', 'desc')
                .first();

            // Get default funnel (geral) and default stage (recebido)
            const defaultFunnel = await db('funnels').where({ slug: 'geral' }).first();
            const defaultStage = await db('stages').where({ slug: 'recebido' }).first();

            if (!defaultFunnel || !defaultStage) {
                console.error('Default funnel/stage not found. Please run seed.sql');
                return;
            }

            if (archivedLead) {
                console.log(`[Webhook] 🔗 Telefone ${phone} retornou — lead #${archivedLead.id} estava ${archivedLead.status}. Criando novo lead vinculado (parent_lead_id=${archivedLead.id}).`);
                
                // CRITICAL FIX: Remove whatsapp_id from the archived lead to free up the unique constraint
                // so the new lead can claim it without crashing the database.
                await db('leads').where({ id: archivedLead.id }).update({ whatsapp_id: null });
            }

            const [{ id: leadId }] = await db('leads').insert({
                name: name || phone,
                phone,
                origin: 'whatsapp',
                funnel_id: defaultFunnel.id,
                stage_id: defaultStage.id,
                whatsapp_id: whatsappId,
                bot_active: true,
                // Vincular ao lead anterior se existir
                parent_lead_id: archivedLead?.id ?? null,
            }).returning('id');

            lead = await db('leads').where({ id: leadId }).first();

            if (archivedLead) {
                // Log de vínculo criado
                await db('activity_logs').insert({
                    lead_id: leadId,
                    action: 'lead_linked_from_archive',
                    entity_type: 'lead',
                    entity_id: leadId,
                    old_value: JSON.stringify({ archived_lead_id: archivedLead.id, archived_lead_name: archivedLead.name }),
                    new_value: JSON.stringify({ new_lead_id: leadId, parent_lead_id: archivedLead.id }),
                }).catch((e: Error) => console.warn('[Webhook] activity_log link insert failed:', e.message));
            }

            // Create bot session
            const sessionToken = `sess_${leadId}_${Date.now()}`;
            await db('bot_sessions').insert({
                lead_id: leadId,
                session_token: sessionToken,
                step: 'greeting',
                is_active: true,
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
                bot_active: true,
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
            const [{ id: convId }] = await db('conversations').insert({
                lead_id: lead.id,
                whatsapp_chat_id: chatId || whatsappId,
                channel: 'whatsapp',
                status: 'open',
            }).returning('id');
            conversation = await db('conversations').where({ id: convId }).first();
        }

        // Store the message and image/audio if present
        let mediaType: string | undefined = undefined;
        let imageUrl: string | null = null;
        let audioUrl: string | null = null;
        let documentId: number | undefined = undefined;

        if ((normalized as Record<string, unknown>)?.imageDownloadFailed) {
            const botReply = "Poxa, recebi uma imagem sua aqui, mas deu um erro técnico no WhatsApp e ela não abriu pra mim. Consegue me enviar de novo? 🙏";
            await db('messages').insert({
                conversation_id: conversation.id,
                lead_id: lead.id,
                content: '[Falha no download da imagem]',
                direction: 'inbound',
                sender: 'lead',
                media_type: 'image',
            });
            await db('messages').insert({
                conversation_id: conversation.id,
                lead_id: lead.id,
                content: '[Erro técnico - Falha no download da imagem via WhatsApp]',
                direction: 'outbound',
                sender: 'bot'
            });
            const wss = getWebSocketServer();
            if (wss) wss.emit('bot_response', { lead_id: lead.id, message: '[Falha no download da imagem]' });
            // Commented out to prevent sending error message to client
            // const failedPhone = String(lead.whatsapp_id || phone);
            // if (canSendOutbound(failedPhone)) await aiService.sendFragmentedMessage(failedPhone, botReply);
            return;
        }

        if (imageBase64 && imageMimeType) {
            mediaType = 'image';
            const { filePath, fileData } = await saveImageAndPersist(lead.id as number, imageBase64, imageMimeType, `midia_${Date.now()}`);
            const [{ id: docId }] = await db('documents').insert({
                lead_id: lead.id,
                name: `Midia WhatsApp`,
                file_type: imageMimeType,
                file_path: filePath,
                file_data: fileData,
                status: 'recebido',
                notes: 'Em analise...'
            }).returning('id');
            documentId = docId;
            imageUrl = `/api/leads/${lead.id}/documents/${docId}/download`;
        } else if (audioBase64 && audioMimeType) {
            // ── Persist audio binary to DB so it survives Railway restarts ──
            mediaType = 'audio';
            try {
                const { filePath: audioFilePath, fileData: audioFileData } = await saveAudioAndPersist(
                    lead.id as number,
                    audioBase64,
                    audioMimeType,
                    `audio_${Date.now()}`
                );
                const [{ id: audioDocId }] = await db('documents').insert({
                    lead_id: lead.id,
                    name: 'Áudio WhatsApp',
                    file_type: audioMimeType,
                    file_path: audioFilePath,
                    file_data: audioFileData,
                    status: 'recebido',
                    notes: 'Áudio recebido via WhatsApp',
                }).returning('id');
                audioUrl = `/api/leads/${lead.id}/documents/${audioDocId}/download`;
                console.log(`[Audio] ✅ Audio persisted for lead ${lead.id}: docId=${audioDocId}`);
            } catch (audioErr) {
                console.error('[Audio] Failed to persist audio:', (audioErr as Error).message);
            }
        } else if (pdfBase64 && pdfMimeType) {
            // ── Persist PDF binary to DB ──────────────────────────────────
            mediaType = 'document';
            try {
                const pdfBuffer = Buffer.from(pdfBase64, 'base64');
                const [{ id: pdfDocId }] = await db('documents').insert({
                    lead_id: lead.id,
                    name: 'Comprovante PDF WhatsApp',
                    file_type: 'application/pdf',
                    file_path: `pdf_${lead.id}_${Date.now()}.pdf`,
                    file_data: pdfBuffer,
                    status: 'recebido',
                    notes: pdfExtractedText
                        ? `Texto extraído:\n${pdfExtractedText.slice(0, 500)}`
                        : 'PDF recebido — sem texto extraído',
                }).returning('id');
                console.log(`[PDF] ✅ PDF persisted for lead ${lead.id}: docId=${pdfDocId}`);
                documentId = pdfDocId;
            } catch (pdfSaveErr) {
                console.error('[PDF] Failed to persist PDF:', (pdfSaveErr as Error).message);
            }
        }

        if (fromMe) {
            const duplicate = await db('messages')
                .where({ lead_id: lead.id, content: message, direction: 'outbound' })
                .where('sent_at', '>', new Date(Date.now() - 10000))
                .first();

            if (duplicate) {
                console.log(`[Webhook] Skipping duplicate fromMe message (echo of API)`);
                return;
            }
        }

        const msgDirection = fromMe ? 'outbound' : 'inbound';
        const msgSender = fromMe ? 'assessor' : 'lead';

        const [{ id: msgId }] = await db('messages').insert({
            conversation_id: conversation.id,
            lead_id: lead.id,
            content: message,
            direction: msgDirection,
            sender: msgSender,
            media_type: mediaType,
            image_url: imageUrl,
            audio_url: audioUrl,
        }).returning('id');

        // If PDF had no readable content, remove the phantom [PDF] message from history
        // so Sofia never sees it and never comments on a file she can't access
        if (pdfReadFailedSilently) {
            await db('messages').where({ id: msgId }).del()
                .catch(e => console.error('[PDF] Failed to delete phantom message:', e));
            console.log('[PDF] 🗑️ Phantom [PDF] message deleted from conversation history');
            return; // stop here — no further processing
        }

        // Update conversation last message
        await db('conversations').where({ id: conversation.id }).update({
            last_message_at: new Date(),
            unread_count: fromMe ? 0 : db.raw('unread_count + 1'),
        });

        // Update lead
        await db('leads').where({ id: lead.id }).update({ updated_at: new Date() });

        if (fromMe) {
            const wss = getWebSocketServer();
            if (wss) wss.emit('new_message', { lead_id: lead.id, lead_name: lead.name, message, conversation_id: conversation.id });
            console.log(`[Webhook] 👤 Assessor/Meta replied directly: ${message.substring(0, 50)}`);
            
            // BUG FIX: Se o assessor ou a automação do Meta responder diretamente,
            // precisamos calar a Sofia cancelando o buffer atual para ela não responder em cima.
            const existingBuffer = _leadBuffers.get(phone);
            if (existingBuffer) {
                clearTimeout(existingBuffer.timer);
                _leadBuffers.delete(phone);
                console.log(`[Buffer] 🔇 Cancelled pending bot reply for ${phone} because Assessor/Meta replied directly`);
            }
            
            // Cancela processamento da IA que já estiver rodando
            const activeController = _activeProcessing.get(phone);
            if (activeController) {
                activeController.abort();
                _activeProcessing.delete(phone);
                console.log(`[Bot] 🛑 Cancelled active processing for ${phone} because Assessor/Meta replied directly`);
            }

            return; // Stop processing, don't trigger Sofia
        }

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
                    const genderRaw = detectGender(lead.name as string);
                    const gender = genderRaw === 'masculino' ? 'M' : genderRaw === 'feminino' ? 'F' : null;
                    if (gender) await db('leads').where({ id: lead.id }).update({ gender });
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
            const now = new Date();
            const brtHour = (now.getUTCHours() - 3 + 24) % 24;
            const isOffHours = brtHour < 8 || brtHour >= 18;
            (lead as Record<string, unknown>)._isOffHours = isOffHours;
            // Injeta período do dia para contexto cronológico na resposta da Sofia
            let dayPeriod = 'horário_comercial';
            if (brtHour >= 0 && brtHour < 6) dayPeriod = 'madrugada';
            else if (brtHour >= 6 && brtHour < 9) dayPeriod = 'manhã_cedo';
            else if (brtHour >= 18 && brtHour < 21) dayPeriod = 'noite';
            else if (brtHour >= 21) dayPeriod = 'madrugada';
            (lead as Record<string, unknown>)._dayPeriod = dayPeriod;

            if (pdfReadFailedSilently) {
                (lead as Record<string, unknown>)._pdfReadFailed = true;
            }

            // BUG 5 FIX: Suprimir resposta da IA para mensagens terminadoras pós-análise
            const currentBotStageCheck = String(lead.bot_stage || 'reception');
            if (isTerminatorMessage(message, currentBotStageCheck)) {
                console.log(`[Bot] 🔇 Terminator message suppressed for ${phone} at stage ${currentBotStageCheck}: "${message}"`);
                return;
            }

            // BUG 6 FIX: Detectar mensagem de anúncio e responder de forma consistente
            if (isAdLeadMessage(message) && currentBotStageCheck === 'reception') {
                const leadFirstName = String(lead.name || '').split(' ')[0];
                const isValidName = leadFirstName && !/^\d+$/.test(leadFirstName) && leadFirstName.length > 2;
                const greeting = isValidName ? ` ${leadFirstName}` : '';
                const adReply = `Oii${greeting}, eu sou a Sofia, da Legacy\n\nTudo bem?\n\nComo posso te ajudar hoje? Me conta um pouquinho do que aconteceu para eu entender sua situação.`;
                const targetPhoneAd = String(lead.whatsapp_id || phone);
                await aiService.sendFragmentedMessage(targetPhoneAd, adReply, undefined, async (fragment) => {
                    await db('messages').insert({ conversation_id: conversation.id, lead_id: lead.id, content: fragment, direction: 'outbound', sender: 'bot' });
                    const wssAd = getWebSocketServer();
                    if (wssAd) wssAd.emit('bot_response', { lead_id: lead.id, message: fragment });
                });
                console.log(`[Bot] 📢 Ad lead detected for ${phone} — sent consistent greeting`);
                return;
            }

            // ── Document image/PDF validation pipeline ──
            const isPDF = !!(pdfBase64 && pdfMimeType);
            if ((imageBase64 && imageMimeType) || isPDF) {
                const fileBase64 = isPDF ? pdfBase64! : imageBase64!;
                const fileMimeType = isPDF ? pdfMimeType! : imageMimeType!;
                const currentBotStageCheck = String(lead.bot_stage || 'reception');

                if (currentBotStageCheck === 'doc_request') {
                    // Cancel pending text buffer to avoid collision / duplicate replies
                    const existingTextBuf = _leadBuffers.get(phone);
                    if (existingTextBuf) {
                        clearTimeout(existingTextBuf.timer);
                        _leadBuffers.delete(phone);
                        console.log(`[Buffer] 🔇 Cancelled pending text reply for ${phone} because media was received`);
                    }

                    // Add to file queue/buffer for sequential batch processing
                    addFileToBuffer(
                        phone,
                        fileBase64,
                        fileMimeType,
                        msgId,
                        documentId!,
                        lead,
                        conversation.id
                    );
                    return;
                } else {
                    // NOT in 'doc_request' stage — process media contextually!
                    console.log(`[Webhook] 🖼️ Media received in stage "${currentBotStageCheck}". Processing contextually...`);
                    
                    let contextMsg = message; // Keep existing extracted PDF text if present
                    let isTechError = false;

                    // If it's an image or a PDF that has no extracted text yet
                    if (!isPDF || !pdfExtractedText) {
                        try {
                            const analysis = await analyzeImage(
                                fileBase64,
                                fileMimeType,
                                'Esta imagem ou PDF foi enviado pelo cliente durante a conversa inicial (não é a etapa de entrega de documentos). Descreva brevemente o que é este arquivo e extraia qualquer texto importante (como valores, nomes, transações, mensagens) para que o atendente consiga entender o contexto.'
                            );

                            if (analysis) {
                                const isTechnical = analysis.issues?.startsWith('technical_error:');
                                if (isTechnical) {
                                    isTechError = true;
                                    contextMsg = `[Mídia enviada pelo cliente — Erro técnico ao processar o arquivo]`;
                                } else if (analysis.description || analysis.extractedText) {
                                    const desc = analysis.description || 'Sem descrição';
                                    const text = analysis.extractedText || 'Sem texto extraído';
                                    contextMsg = `[Mídia enviada pelo cliente — Descrição: ${desc} | Conteúdo extraído: ${text}]`;
                                } else {
                                    contextMsg = `[Mídia enviada pelo cliente — Não foi possível analisar a imagem]`;
                                }
                            } else {
                                contextMsg = `[Mídia enviada pelo cliente — Não foi possível analisar a imagem]`;
                            }
                        } catch (analysisErr) {
                            console.error('[Webhook] Contextual media analysis failed:', analysisErr);
                            isTechError = true;
                            contextMsg = `[Mídia enviada pelo cliente — Erro técnico ao processar o arquivo]`;
                        }
                    }

                    // Update the message content in DB
                    await db('messages').where({ id: msgId }).update({ content: contextMsg });
                    console.log(`[Webhook] 📝 Updated message #${msgId} content with contextual description: "${contextMsg.substring(0, 150)}..."`);
                    
                    // If it was a technical error, stop here and do NOT trigger Sofia
                    if (isTechError) {
                        console.log(`[Webhook] 🔇 Contextual media failed technically — Sofia will remain silent`);
                        return;
                    }

                    // Update local message variable so addToBuffer uses it
                    message = contextMsg;
                    
                    // Route to Sofia's conversational response queue
                    addToBuffer(phone, message, lead, conversation.id);
                    return;
                }
            }

            // ── Debounce: buffer text/audio messages ─────────────────────
            addToBuffer(phone, message, lead, conversation.id);
        }
    } catch (err) {
        console.error('Process incoming message error:', err);
    }
}

async function processDocumentFile(
    leadId: number,
    conversationId: number,
    fileBase64: string,
    fileMimeType: string,
    initialMsgId?: number,
    initialDocId?: number
): Promise<ProcessDocResult> {
    // Retrieve fresh lead from DB
    const lead = await db('leads').where({ id: leadId }).first();
    if (!lead) {
        throw new Error(`Lead ${leadId} not found`);
    }
    const phone = String(lead.phone || '');
    const isPDF = fileMimeType === 'application/pdf';
    
    const base64SizeKB = Math.round(fileBase64.length * 0.75 / 1024);
    console.log(`[Doc] 📁 [START] processDocumentFile for lead ${leadId} | Size: ${base64SizeKB}KB | Mime: ${fileMimeType}`);
    
    // Bug #1 Fix: getDocState is now async and reads from DB (survives restarts)
    const docState = await getDocState(leadId);
    console.log(`[DocState] Lead ${leadId}: id_front=${docState.id_front_done} | id_back=${docState.id_back_done} | proof=${docState.proof_of_address_done}`);

    try {
        // Get funnel slug for checklist
        const funnel = await db('funnels').where({ id: lead.funnel_id }).first() as { slug: string } | undefined;
        const funnelSlug = funnel?.slug ?? 'default';

        // Build context: tell analyzeImage which doc is currently expected
        const checklist = await getDocumentChecklist(leadId, funnelSlug);
        const nextExpected = checklist.missing[0] ?? null;
        const analysisContext = nextExpected
            ? `O cliente está no processo de coleta de documentos para o funil "${funnelSlug}". O próximo documento esperado é: "${nextExpected}". Se o arquivo for compatível com esse tipo de documento, classifique como "${nextExpected}".`
            : `O cliente está no funil "${funnelSlug}" e pode estar enviando qualquer documento relacionado ao caso.`;

        // Analyze file via Gemini
        console.log(`[Doc] 🔍 Calling analyzeImage/PDF for lead ${leadId}...`);
        const analysis = await analyzeImage(fileBase64, fileMimeType, analysisContext);
        const docType = analysis.docType;
        console.log(`[Doc] 🔍 Analysis result for lead ${leadId}:`, JSON.stringify(analysis, null, 2));
        console.log(`[Doc] 🔍 Analysis: isLegible=${analysis.isLegible} | docType=${docType} | issues=${analysis.issues} | extractedText=${(analysis.extractedText || '').substring(0, 80)}`);

        // ── CASE 1: Image is NOT legible ──
        if (!analysis.isLegible) {
            const isTechnicalError = analysis.issues?.startsWith('technical_error:');
            let inboundLabel: string;
            let humanizedIssue: string;

            if (isTechnicalError) {
                humanizedIssue = 'tivemos um erro técnico ao ler o arquivo';
                inboundLabel = `[${isPDF ? 'PDF' : 'Imagem'} recebido — erro de processamento]`;
                console.warn(`[Doc] ⚠️ Technical error during analysis: ${analysis.issues}`);
                
                await db('ai_error_logs').insert({
                    lead_id: leadId,
                    error_message: analysis.issues || 'Erro técnico na IA Vision',
                    stack_trace: null,
                    payload: JSON.stringify({ fileMimeType, action: 'analyzeImage' }),
                }).catch(e => console.error('Failed to log AI error:', e));
            } else {
                const rawIssue = analysis.issues || '';

                if (analysis.reading_issues) {
                    humanizedIssue = analysis.reading_issues;
                } else if (rawIssue.includes('borrad') || rawIssue.includes('desfocad') || rawIssue.includes('tremid')) {
                    humanizedIssue = 'a foto ficou um pouco tremida';
                } else if (rawIssue.includes('rosto') || rawIssue.includes('persona') || rawIssue.includes('não é um documento') || rawIssue.includes('nao é um documento')) {
                    humanizedIssue = 'não conseguimos identificar um documento nessa foto';
                } else if (rawIssue.includes('cortad') || rawIssue.includes('enquadramento') || rawIssue.includes('borda')) {
                    humanizedIssue = 'o documento ficou um pouco cortado';
                } else if (rawIssue.includes('escur') || rawIssue.includes('iluminação') || rawIssue.includes('luz')) {
                    humanizedIssue = 'a foto ficou escura demais';
                } else if (rawIssue.includes('reflexo') || rawIssue.includes('flash')) {
                    humanizedIssue = 'o reflexo cobriu parte do documento';
                } else {
                    humanizedIssue = 'a foto ficou difícil de ler';
                }
                inboundLabel = `[${isPDF ? 'PDF' : 'Imagem'} recebido — ilegível]`;
            }

            // Save the rejected image so the CRM can display it
            let rejDocUrl: string | null = null;
            if (initialDocId) {
                await db('documents').where({ id: initialDocId }).update({ name: `[Ilegível] ${docType}`, status: 'rejeitado', notes: analysis.issues });
                rejDocUrl = `/api/leads/${leadId}/documents/${initialDocId}/download`;
            } else {
                const { filePath: rejFilePath, fileData: rejFileData } = await saveImageAndPersist(leadId, fileBase64, fileMimeType, `recebido_rejeitado_${Date.now()}`);
                const [{ id: rejDocId }] = await db('documents').insert({ lead_id: leadId, name: `[Ilegivel] ${docType}`, file_type: fileMimeType, file_path: rejFilePath, file_data: rejFileData, status: 'rejeitado', notes: analysis.issues }).returning('id');
                rejDocUrl = `/api/leads/${leadId}/documents/${rejDocId}/download`;
            }

            if (initialMsgId) {
                await db('messages').where({ id: initialMsgId }).update({ content: inboundLabel, image_url: rejDocUrl });
            } else {
                await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: inboundLabel, direction: 'inbound', sender: 'lead', media_type: 'image', image_url: rejDocUrl });
            }
            await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: isTechnicalError ? `[Análise de mídia] ⚠️ Erro técnico — ${analysis.issues}` : `[Análise de mídia] ❌ Documento rejeitado — ${docType} | Motivo: ${analysis.issues}` });

            return {
                success: false,
                docType,
                isLegible: false,
                error: humanizedIssue,
                isTechnicalError
            };
        }

        // ── CASE 2: Image IS legible — Enforce data extraction ──
        const isIDDoc = (docType === 'RG' || docType === 'CNH');
        const isComprovante = (docType === 'Comprovante de Residência');
        const textData = analysis.extractedText || '';
        const exData = analysis.extractedData || {};

        // ── Helper: apply extractedData to lead fields ──
        const buildLeadUpdates = (data: typeof exData, currentLead: Record<string, unknown>) => {
            const updates: Record<string, string> = {};
            const currentName = String(currentLead.name || '');
            const isGenericName = !currentName || currentName === phone || currentName.startsWith('Lead ') || /^\d+$/.test(currentName.trim());

            if (data.name && isGenericName) updates.name = data.name;
            if (data.cpf && !currentLead.cpf) updates.cpf = data.cpf;
            if (data.rg && !currentLead.rg) updates.rg = data.rg;
            if (data.birth_date && !currentLead.birthdate) {
                const raw = String(data.birth_date).trim();
                const ddmmyyyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
                updates.birthdate = ddmmyyyy
                    ? `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`
                    : raw;
            }
            if (data.gender && !currentLead.gender) {
                const g = String(data.gender).toLowerCase().trim();
                updates.gender = g === 'masculino' || g === 'male'   || g === 'm' ? 'M'
                               : g === 'feminino'  || g === 'female' || g === 'f' ? 'F'
                               : data.gender;
            }
            if (data.nationality && !currentLead.nationality)  updates.nationality  = data.nationality;
            if (data.mother      && !currentLead.mother)       updates.mother       = data.mother;
            if (data.father      && !currentLead.father)       updates.father       = data.father;
            if (data.org_emissor && !currentLead.org_emissor)  updates.org_emissor  = data.org_emissor;
            if (data.uf_emissor  && !currentLead.uf_emissor)   updates.uf_emissor   = data.uf_emissor;
            if (data.street       && !currentLead.street)       updates.street       = data.street;
            if (data.number       && !currentLead.number)       updates.number       = data.number;
            if (data.neighborhood && !currentLead.neighborhood) updates.neighborhood = data.neighborhood;
            if (data.city         && !currentLead.city)         updates.city         = data.city;
            if (data.state        && !currentLead.state)        updates.state        = data.state;
            if (data.zip_code     && !currentLead.zip_code)     updates.zip_code     = data.zip_code;
            if (updates.cpf) {
                const digits = updates.cpf.replace(/\D/g, '');
                if (digits.length === 11) {
                    updates.cpf = `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
                } else {
                    console.warn(`[Doc] CPF inválido descartado no bot (${digits.length} dígitos): ${updates.cpf}`);
                    delete updates.cpf;
                }
            }
            if (data.street || data.number || data.neighborhood || data.city) {
                updates.address = '';
            }
            return updates;
        };

        const safeUpdateLead = async (id: number, updatesObj: Record<string, any>, currentLead: Record<string, any>) => {
            for (const [col, val] of Object.entries(updatesObj)) {
                try {
                    await db('leads').where({ id }).update({ [col]: val });
                    currentLead[col] = val;
                } catch (err) {
                    console.warn(`[Doc] ⚠️ Column "${col}" missing in DB — skipping update`);
                    delete updatesObj[col];
                }
            }
        };

        // ── RG/CNH handling ──
        if (isIDDoc) {
            if (isPDF) {
                const updates = buildLeadUpdates(exData, lead);
                if (Object.keys(updates).length > 0) {
                    await safeUpdateLead(leadId, updates, lead);
                    const wssName = getWebSocketServer();
                    if (wssName) wssName.emit('lead_updated', { lead_id: leadId, ...updates });
                    console.log(`[Doc] 📋 Auto-filled lead fields from ${docType} PDF: ${JSON.stringify(updates)}`);
                }

                const notesJson = JSON.stringify({ extractedText: textData, extractedData: exData });
                let docUrl: string | null = null;
                if (initialDocId) {
                    await db('documents').where({ id: initialDocId }).update({ name: `${docType} (PDF)`, status: 'aprovado', notes: notesJson });
                    docUrl = `/api/leads/${leadId}/documents/${initialDocId}/download`;
                }
                await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: `[Análise de mídia] ✅ ${docType} PDF aprovado | Nome: ${exData.name || 'N/D'} | CPF: ${exData.cpf || 'N/D'} | RG: ${exData.rg || 'N/D'}` });

                const contentStr = `[PDF recebido — ${docType} ✅]`;
                if (initialMsgId) {
                    await db('messages').where({ id: initialMsgId }).update({ content: contentStr, image_url: docUrl });
                } else {
                    await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: contentStr, direction: 'inbound', sender: 'lead', media_type: 'document', image_url: docUrl });
                }

                return {
                    success: true,
                    docType,
                    isLegible: true,
                    docSavedName: `${docType} (PDF)`
                };
            } else if (!docState.id_front_done) {
                const updates = buildLeadUpdates(exData, lead);
                if (Object.keys(updates).length > 0) {
                    await safeUpdateLead(leadId, updates, lead);
                    const wssName = getWebSocketServer();
                    if (wssName) wssName.emit('lead_updated', { lead_id: leadId, ...updates });
                    console.log(`[Doc] 📋 Auto-filled lead fields from ${docType}: ${JSON.stringify(updates)}`);
                }

                // Save document and mark front as done
                const notesJson = JSON.stringify({ extractedText: textData, extractedData: exData });
                let frontDocUrl: string | null = null;
                if (initialDocId) {
                    await db('documents').where({ id: initialDocId }).update({ name: `${docType} (frente)`, status: 'aprovado', notes: notesJson });
                    frontDocUrl = `/api/leads/${leadId}/documents/${initialDocId}/download`;
                } else {
                    const { filePath: frontFilePath, fileData: frontFileData } = await saveImageAndPersist(leadId, fileBase64, fileMimeType, `${docType}_frente`);
                    const [{ id: frontDocId }] = await db('documents').insert({ lead_id: leadId, name: `${docType} (frente)`, file_type: fileMimeType, file_path: frontFilePath, file_data: frontFileData, status: 'aprovado', notes: notesJson }).returning('id');
                    frontDocUrl = `/api/leads/${leadId}/documents/${frontDocId}/download`;
                }
                await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: `[Análise de mídia] ✅ ${docType} frente aprovada | Nome: ${exData.name || 'N/D'} | CPF: ${exData.cpf || 'N/D'} | RG: ${exData.rg || 'N/D'}` });
                
                const contentStrFront = `[Imagem recebida — ${docType} frente ✅]`;
                if (initialMsgId) {
                    await db('messages').where({ id: initialMsgId }).update({ content: contentStrFront, image_url: frontDocUrl });
                } else {
                    await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: contentStrFront, direction: 'inbound', sender: 'lead', media_type: 'image', image_url: frontDocUrl });
                }

                // ── Verificar campos críticos não extraídos ──
                const missingName = !exData.name;
                const missingId   = !exData.rg && !exData.cpf;
                const missingCritical = missingName || missingId;

                if (missingCritical) {
                    let missingDesc = '';
                    if (missingName && missingId) missingDesc = 'não conseguimos ler o nome nem o número do documento';
                    else if (missingName) missingDesc = 'não conseguimos ler o nome claramente';
                    else missingDesc = 'não conseguimos ler o número do documento (RG/CPF)';

                    // Salva o doc mesmo assim (para o CRM ver a tentativa)
                    const notesJsonRetry = JSON.stringify({ extractedText: textData, extractedData: exData, missing_fields: missingCritical ? (missingName ? 'name' : '') + (missingId ? ' rg/cpf' : '') : '' });
                    if (initialDocId) {
                        await db('documents').where({ id: initialDocId }).update({ name: `${docType} (frente - incompleto)`, status: 'pendente', notes: notesJsonRetry });
                    } else {
                        const { filePath: rFilePath, fileData: rFileData } = await saveImageAndPersist(leadId, fileBase64, fileMimeType, `${docType}_frente_incompleto`);
                        await db('documents').insert({ lead_id: leadId, name: `${docType} (frente - incompleto)`, file_type: fileMimeType, file_path: rFilePath, file_data: rFileData, status: 'pendente', notes: notesJsonRetry });
                    }
                    await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: `[Análise de mídia] ⚠️ ${docType} frente legível mas incompleto | ${missingDesc}` });
                    
                    return {
                        success: false,
                        docType,
                        isLegible: true,
                        isIncomplete: true,
                        error: analysis.reading_issues || missingDesc,
                        docSavedName: `${docType} (frente)`
                    };
                }

                return {
                    success: true,
                    docType,
                    isLegible: true,
                    docSavedName: `${docType} (frente)`
                };

            } else if (!docState.id_back_done) {
                // This is the BACK — just accept it (less strict, just needs legibility)
                const notesJsonBack = JSON.stringify({ extractedText: textData, extractedData: exData });
                let backDocUrl: string | null = null;
                if (initialDocId) {
                    await db('documents').where({ id: initialDocId }).update({ name: `${docType} (verso)`, status: 'aprovado', notes: notesJsonBack });
                    backDocUrl = `/api/leads/${leadId}/documents/${initialDocId}/download`;
                } else {
                    const { filePath: backFilePath, fileData: backFileData } = await saveImageAndPersist(leadId, fileBase64, fileMimeType, `${docType}_verso`);
                    const [{ id: backDocId }] = await db('documents').insert({ lead_id: leadId, name: `${docType} (verso)`, file_type: fileMimeType, file_path: backFilePath, file_data: backFileData, status: 'aprovado', notes: notesJsonBack }).returning('id');
                    backDocUrl = `/api/leads/${leadId}/documents/${backDocId}/download`;
                }
                const backUpdates = buildLeadUpdates(exData, lead);
                if (Object.keys(backUpdates).length > 0) {
                    await safeUpdateLead(leadId, backUpdates, lead);
                    const wssBack = getWebSocketServer();
                    if (wssBack) wssBack.emit('lead_updated', { lead_id: leadId, ...backUpdates });
                }
                await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: `[Análise de mídia] ✅ ${docType} verso aprovado` });
                
                const contentStrBack = `[${isPDF ? 'PDF' : 'Imagem'} recebido — ${docType} verso ✅]`;
                if (initialMsgId) {
                    await db('messages').where({ id: initialMsgId }).update({ content: contentStrBack, image_url: backDocUrl });
                } else {
                    await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: contentStrBack, direction: 'inbound', sender: 'lead', media_type: isPDF ? 'document' : 'image', image_url: backDocUrl });
                }

                return {
                    success: true,
                    docType,
                    isLegible: true,
                    docSavedName: `${docType} (verso)`
                };
            }
        }

        // ── Comprovante de Residência ──
        if (isComprovante) {
            const addressUpdates = buildLeadUpdates(exData, lead);
            if (Object.keys(addressUpdates).length > 0) {
                if (!lead.address && exData.street) addressUpdates.address = [exData.street, exData.number, exData.neighborhood, exData.city, exData.state, exData.zip_code].filter(Boolean).join(', ');
                await safeUpdateLead(leadId, addressUpdates, lead);
                console.log(`[Doc] 📋 Address extracted from Comprovante via AI:`, addressUpdates);
                const wssAddr = getWebSocketServer();
                if (wssAddr) wssAddr.emit('lead_updated', { lead_id: leadId, ...addressUpdates });
            } else {
                console.warn(`[Doc] ⚠️ Comprovante: AI accepted but extractedData has no address fields`);
            }
            await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: `[Análise de mídia] ✅ Comprovante aprovado | ${exData.street || 'endereço não extraído'}` });
        }

        // ── Generic: save document ──
        const docSavedName = isComprovante ? 'Comprovante de Residência' : docType;
        const notesJsonGeneric = JSON.stringify({ extractedText: textData, extractedData: exData });

        if (!isIDDoc) {
            const genericUpdates = buildLeadUpdates(exData, lead);
            if (Object.keys(genericUpdates).length > 0) {
                await safeUpdateLead(leadId, genericUpdates, lead);
                const wssGen = getWebSocketServer();
                if (wssGen) wssGen.emit('lead_updated', { lead_id: leadId, ...genericUpdates });
            }
            let genericDocUrl: string | null = null;
            if (initialDocId) {
                await db('documents').where({ id: initialDocId }).update({ name: docSavedName, status: 'aprovado', notes: notesJsonGeneric });
                genericDocUrl = `/api/leads/${leadId}/documents/${initialDocId}/download`;
            } else {
                const { filePath: genericFilePath, fileData: genericFileData } = await saveImageAndPersist(leadId, fileBase64, fileMimeType, docSavedName.replace(/\s+/g, '_'));
                const [{ id: genericDocId }] = await db('documents').insert({ lead_id: leadId, name: docSavedName, file_type: fileMimeType, file_path: genericFilePath, file_data: genericFileData, status: 'aprovado', notes: notesJsonGeneric }).returning('id');
                genericDocUrl = `/api/leads/${leadId}/documents/${genericDocId}/download`;
            }
            await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: `[Análise de mídia] ✅ ${docSavedName} aprovado | Dados: ${textData.substring(0, 100) || 'N/D'}` });
            
            const contentStrGen = `[${isPDF ? 'PDF' : 'Imagem'} recebido — ${docSavedName} ✅]`;
            if (initialMsgId) {
                await db('messages').where({ id: initialMsgId }).update({ content: contentStrGen, image_url: genericDocUrl });
            } else {
                await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: contentStrGen, direction: 'inbound', sender: 'lead', media_type: isPDF ? 'document' : 'image', image_url: genericDocUrl });
            }
        }

        return {
            success: true,
            docType,
            isLegible: true,
            docSavedName
        };

    } catch (err) {
        console.error('[Doc] processDocumentFile error:', err);
        return {
            success: false,
            docType: 'Outro',
            isLegible: false,
            error: 'tivemos uma oscilação técnica temporária para processar este arquivo',
            isTechnicalError: true
        };
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

        // Emit thinking true
        const wssThinking = getWebSocketServer();
        if (wssThinking) {
            wssThinking.emit('sofia_thinking', { lead_id: lead.id, thinking: true });
        }

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

        // ── PDF could not be read — suppress Sofia, log internally ——
        const pdfReadFailed = (lead as Record<string, unknown>)._pdfReadFailed === true;
        if (pdfReadFailed) {
            await db('notes').insert({
                lead_id: lead.id as number,
                author_type: 'bot',
                content: `⚠️ [PDF não lido — cliente NÃO foi notificado] Não foi possível extrair o conteúdo do PDF enviado pelo cliente. O arquivo pode estar protegido, ser uma imagem sem OCR ou não ter chegado com base64. Verificar manualmente.`,
            }).catch(e => console.error('[PDF] Failed to save error note:', e));
            const wssP = getWebSocketServer();
            if (wssP) wssP.emit('bot_error', { lead_id: lead.id, error: 'PDF não pôde ser lido' });
            return; // ← Nothing sent to client
        }

        // 🛑 CHECKPOINT 1: Check before calling AI (avoid wasting API call)
        if (signal.aborted) {
            console.log(`[Bot] 🛑 STOP & RESTART: Processing cancelled BEFORE AI call for ${phone} — new message arrived`);
            return;
        }

        const botReply = await aiService.generateBotReply(
            historyWithoutLast,
            userMessage,
            fullContext,
            memories,
            String(lead.bot_stage || 'approach') // #7: temperatura por fase
        );

        if (!botReply) return;

        // ── BOT ERROR SENTINEL: log internally, DO NOT send to client ──
        if (botReply.startsWith('__BOT_ERROR__')) {
            const errDetail = botReply.replace('__BOT_ERROR__: ', '');
            console.error(`[Bot] ❌ AI error — suppressing client reply | ${errDetail}`);
            // Save internal note visible only in CRM
            await db('notes').insert({
                lead_id: lead.id as number,
                author_type: 'bot',
                content: `⚠️ [Erro interno — cliente NÃO foi notificado] Sofia não conseguiu responder: ${errDetail}`,
            }).catch(e => console.error('[Bot] Failed to save error note:', e));
            const wssErr = getWebSocketServer();
            if (wssErr) wssErr.emit('bot_error', { lead_id: lead.id, error: errDetail });
            return; // ← Nothing sent to client
        }

        // 🛑 CHECKPOINT 2: Check after AI responds (discard stale reply)
        if (signal.aborted) {
            console.log(`[Bot] 🛑 STOP & RESTART: Processing cancelled AFTER AI call for ${phone} — discarding reply: "${botReply.substring(0, 60)}..."`);
            return;
        }

        // O banco de dados e o CRM serão notificados a cada fragmento enviado
        // pela função sendFragmentedMessage mais abaixo.

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

            // ── Negativado: approach → pre_analise quando Sofia confirma recebimento do CPF ──
            // (NÃO avança para doc_request direto)
            if (currentBotStage === 'approach' && funnelSlug === 'negativado') {
                if (replyLower.includes('vou registrar') || replyLower.includes('equipe fazer uma análise') ||
                    replyLower.includes('análise do seu perfil') || replyLower.includes('aguarda um instante') ||
                    replyLower.includes('passar para nossa equipe') || replyLower.includes('já passo para')) {
                    nextStage = 'pre_analise';
                }
                // NUNCA pular para doc_request ou analysis direto da approach no negativado
                if (nextStage === 'doc_request' || nextStage === 'analysis') nextStage = null;
            }

            // Negativado: pre_analise → doc_request APENAS quando assessor mover manualmente no CRM
            // (Sofia não avança sozinha desta etapa)  
            if (currentBotStage === 'pre_analise' && funnelSlug === 'negativado') {
                // Qualquer pedido de documento (RG, CNH, comprovante) só é válido se assessor já moveu
                // Por segurança: não detectamos avanço automático daqui
                nextStage = null;
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

        // Apply post-processing guardrails (forbidden words, single question, emoji filter)
        const sanitizedReply = applyGuardrails(botReply);

        // Send reply in fragments (variable delay, typing presence)
        await aiService.sendFragmentedMessage(targetPhone, sanitizedReply, signal, async (fragment) => {
            await db('messages').insert({
                conversation_id: conversationId,
                lead_id: lead.id as number,
                content: fragment,
                direction: 'outbound',
                sender: 'bot',
            });
            const wss = getWebSocketServer();
            if (wss) {
                wss.emit('bot_response', { lead_id: lead.id, message: fragment });
            }
        });
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
        // Emit thinking false
        const wssThinking = getWebSocketServer();
        if (wssThinking) {
            wssThinking.emit('sofia_thinking', { lead_id: lead.id, thinking: false });
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
    pdfBase64?: string;
    pdfMimeType?: string;
    videoMimeType?: string;
    hasVideoNoBase64?: boolean;
    /** Raw WhatsApp message key — needed to re-fetch media from Evolution API */
    rawKey?: Record<string, unknown>;
    /** Full raw data payload from bridge — needed for Evolution API re-fetch */
    rawData?: Record<string, unknown>;
    /** True when message was sent by THIS device (outbound) — skip processing */
    fromMe?: boolean;
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

            // Check for PDF/document message
            const documentMessage = messageContent.documentMessage as Record<string, unknown> | undefined;
            let pdfBase64: string | undefined;
            let pdfMimeType: string | undefined;

            if (documentMessage && !audioBase64 && !imageBase64) {
                const docMime = (documentMessage.mimetype as string) || '';
                if (docMime === 'application/pdf' || docMime.includes('pdf')) {
                    pdfBase64 = (data.documentBase64 ?? data.mediaBase64) as string | undefined;
                    pdfMimeType = 'application/pdf';
                    console.log(`[Webhook] Normalize: PDF document found | mime=${docMime} | hasBase64=${!!pdfBase64}`);
                } else {
                    // Non-PDF document (Word, etc.) — log and treat as [Documento]
                    console.log(`[Webhook] Normalize: document received but not PDF | mime=${docMime}`);
                }
            }

            // Check for video message
            const videoMessage = messageContent.videoMessage as Record<string, unknown> | undefined;
            let videoMimeType: string | undefined;
            let hasVideoNoBase64 = false;
            if (videoMessage && !audioBase64 && !imageBase64 && !pdfBase64) {
                videoMimeType = (videoMessage.mimetype as string) || 'video/mp4';
                hasVideoNoBase64 = true; // Videos are almost never sent with base64 inline
                console.log(`[Webhook] Normalize: video found | mime=${videoMimeType}`);
            }

            const hasAnyMedia = !!(audioBase64 || audioMessage || imageBase64 || imageMessage || pdfBase64 || documentMessage || videoMessage);
            const message =
                (messageContent.conversation as string) ||
                (messageContent.extendedTextMessage as Record<string, string>)?.text ||
                (messageContent.buttonsResponseMessage as Record<string, string>)?.selectedDisplayText ||
                (messageContent.listResponseMessage as Record<string, string>)?.title ||
                (messageContent.templateButtonReplyMessage as Record<string, string>)?.selectedDisplayText ||
                (audioBase64 || audioMessage ? '[Áudio]'
                    : imageBase64 ? '[Imagem]'
                    : imageMessage ? '[Imagem]' // imageMessage present but no base64 — will try to re-fetch
                    : pdfBase64 ? '[PDF]'
                    : documentMessage ? '[PDF]'
                    : videoMessage ? '[Vídeo]'
                    : hasAnyMedia ? '[Mídia]' : '[Media]');

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
                pdfBase64,
                pdfMimeType,
                videoMimeType,
                hasVideoNoBase64,
                rawKey: key,
                rawData: data,
                fromMe: key.fromMe === true,
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

        const [{ id: msgId }] = await db('messages').insert({
            conversation_id: conversation.id,
            lead_id: Number(lead_id),
            content,
            direction: 'outbound',
            sender: 'assessor',
            sender_user_id: req.user?.userId,
        }).returning('id');

        const message = await db('messages').where({ id: msgId }).first();

        res.status(201).json({ success: true, data: message });
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ success: false, error: 'Erro ao enviar mensagem' });
    }
}
