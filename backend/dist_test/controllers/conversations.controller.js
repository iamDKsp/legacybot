"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWebhook = handleWebhook;
exports.connectWhatsApp = connectWhatsApp;
exports.disconnectWhatsApp = disconnectWhatsApp;
exports.getQRCode = getQRCode;
exports.getConnectionStatus = getConnectionStatus;
exports.toggleLeadBot = toggleLeadBot;
exports.getBotMemory = getBotMemory;
exports.addBotMemory = addBotMemory;
exports.deleteBotMemory = deleteBotMemory;
exports.getHandoffs = getHandoffs;
exports.acknowledgeHandoff = acknowledgeHandoff;
exports.sendTestMessage = sendTestMessage;
const axios_1 = __importDefault(require("axios"));
const database_1 = require("../config/database");
const ai_service_1 = require("../services/ai.service");
const learning_service_1 = require("../services/learning.service");
const websocket_service_1 = require("../services/websocket.service");
const env_1 = require("../config/env");
// ============================================================
// Funnel Stage Flow Definition
// ============================================================
const STAGE_FLOW = {
    reception: 'case_identification',
    case_identification: 'document_request',
    payment_objection: 'document_request', // side-step, returns to main track
    document_request: 'cpf_collection',
    insecurity_handling: 'document_request', // side-step, returns to main track
    cpf_collection: 'done',
    timeline_question: 'followup',
    followup: 'followup',
    done: 'done',
};
// ============================================================
// Evolution API Webhook — POST /api/webhook/whatsapp
// ============================================================
async function handleWebhook(req, res) {
    // Ack immediately — Evolution API must not retry
    res.status(200).json({ received: true });
    console.log('[Webhook] ▶ Received event:', req.body?.event, '| instance:', req.body?.instance);
    const body = req.body;
    const event = body.event || body.type;
    if (event === 'qrcode.updated') {
        console.log('[WhatsApp] QR Code updated');
        (0, websocket_service_1.emitToAll)('whatsapp_qr', { qrCode: body.data?.qrcode?.base64 });
        return;
    }
    if (event === 'connection.update') {
        const status = body.data?.state;
        console.log(`[WhatsApp] Connection: ${status}`);
        (0, websocket_service_1.emitToAll)('whatsapp_status', { status });
        return;
    }
    if (event !== 'messages.upsert')
        return;
    const messages = Array.isArray(body.data) ? body.data : [body.data];
    for (const msgData of messages) {
        processMessage(msgData).catch((err) => console.error('[WhatsApp] Message processing error:', err));
    }
}
// ============================================================
// Process a single incoming message (async, non-blocking)
// ============================================================
async function processMessage(msgData) {
    const key = msgData.key;
    const messageId = key?.id;
    const remoteJid = key?.remoteJid;
    const from = remoteJid?.replace('@s.whatsapp.net', '')?.replace('@c.us', '')?.replace('@lid', '') || '';
    console.log('[Webhook] 📩 processMessage called. fromMe:', key?.fromMe, '| remoteJid:', key?.remoteJid, '| msgId:', messageId);
    // ── Pre-parse content to intercept !reset even if fromMe=true ──
    const message = msgData.message;
    let textContent = '';
    if (message?.conversation || message?.extendedTextMessage) {
        textContent = (message.conversation ||
            message.extendedTextMessage?.text ||
            '');
    }
    const isResetCmd = textContent.trim().toLowerCase() === '!reset';
    // Skip our own outbound messages, UNLESS it's the !reset command sent from WhatsApp Web
    const fromMe = key?.fromMe;
    const isFromMe = fromMe === true || fromMe === 'true';
    if (isFromMe && !isResetCmd) {
        console.log('[Webhook] ⏭ Skipping outbound (fromMe=true)');
        return;
    }
    // Skip GROUP messages (Shopee, broadcast, spam groups)
    if (remoteJid?.endsWith('@g.us') || remoteJid?.endsWith('@broadcast')) {
        console.log('[Webhook] ⏭ Skipping group/broadcast');
        return;
    }
    if (!from) {
        console.log('[Webhook] ⏭ Empty phone number, skipping');
        return;
    }
    console.log('[Webhook] 📞 From:', from);
    // ── Deduplication: skip already-processed message IDs ──────
    if (messageId) {
        try {
            const dup = await (0, database_1.db)('messages').where('whatsapp_message_id', messageId).first();
            if (dup) {
                console.log(`[WhatsApp] Duplicate skipped: ${messageId}`);
                return;
            }
        }
        catch {
            // Column whatsapp_message_id may not exist yet — deduplication skipped safely
        }
    }
    const messageTimestamp = msgData.messageTimestamp || Math.floor(Date.now() / 1000);
    const sentAt = new Date(messageTimestamp * 1000);
    // ── Skip old messages (e.g., from a sync when connecting) ──
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (sentAt < fiveMinutesAgo) {
        console.log(`[Webhook] ⏭ Skipping old message (${sentAt.toISOString()}) to prevent reply flood`);
        return;
    }
    const pushName = msgData.pushName;
    // ── Get or create lead & conversation ──────────────────────
    const lead = await getOrCreateLead(from, pushName);
    if (!lead) {
        console.log('[Webhook] ❌ Could not get/create lead for', from);
        return;
    }
    // ── Hard Reset for Testing ──────────────────────────────────
    if (isResetCmd) {
        console.log('[Webhook] 🔄 Secret command !reset received. Resetting lead state and clearing history.');
        // 1. Delete ALL messages for this lead so the AI has no memory of past conversations
        await (0, database_1.db)('messages').where('lead_id', Number(lead.id)).del();
        console.log('[Webhook] 🗑️ All messages deleted for lead', lead.id);
        // 2. Mark existing conversations as resolved (a fresh one will be created on next message)
        await (0, database_1.db)('conversations')
            .where('lead_id', Number(lead.id))
            .where('status', '!=', 'resolved')
            .update({ status: 'resolved', updated_at: new Date() });
        const recebidoStage = await (0, database_1.db)('stages').where({ slug: 'recebido' }).first();
        const resetStageId = recebidoStage?.id ?? (await (0, database_1.db)('stages').orderBy('display_order').first())?.id ?? 1;
        // 4. Delete related data (documents, notes, tasks, handoffs)
        await (0, database_1.db)('documents').where('lead_id', Number(lead.id)).del();
        await (0, database_1.db)('notes').where('lead_id', Number(lead.id)).del();
        await (0, database_1.db)('tasks').where('lead_id', Number(lead.id)).del();
        await (0, database_1.db)('bot_handoffs').where('lead_id', Number(lead.id)).del();
        console.log('[Webhook] 🗑️ All documents, notes, tasks, and handoffs deleted for lead', lead.id);
        // 5. Reset lead data (fields)
        const displayPhone = from.includes('@') ? from.split('@')[0] : from;
        const initialName = pushName && pushName.trim().length > 0 ? pushName : `Lead ${displayPhone.slice(-4)}`;
        await (0, database_1.db)('leads').where('id', Number(lead.id)).update({
            name: initialName,
            cpf: null,
            address: null,
            email: null,
            bot_stage: 'reception',
            bot_active: true,
            stage_id: resetStageId,
            updated_at: new Date()
        });
        const targetPhone = String(lead.whatsapp_id || from);
        await (0, ai_service_1.sendWhatsAppMessage)(targetPhone, "🔄 *Modo de Teste Iniciado*\n\nSeu estágio voltou para o início (Recepção) e o robô está ativo novamente! Mande um 'Oi' para começar do zero.");
        return;
    }
    console.log('[Webhook] 👤 Lead:', lead.id, '| name:', lead.name, '| bot_active:', lead.bot_active, '| bot_stage:', lead.bot_stage);
    const conversation = await getOrCreateConversation(Number(lead.id), remoteJid || `${from}@s.whatsapp.net`);
    if (!message)
        return;
    // ── Parse message content by type ──────────────────────────
    let mediaAnalysis = null;
    // 1) Audio / Voice → Gemini transcription
    if (message.audioMessage || message.pttMessage) {
        textContent = '[Áudio]';
        // Baileys Bridge sends the message object. We can implement media download in aiService if needed.
        const media = await (0, ai_service_1.downloadBridgeMedia)(msgData);
        if (media) {
            const transcription = await (0, ai_service_1.transcribeAudio)(media.base64, media.mimeType);
            if (transcription) {
                textContent = transcription; // treat transcript as plain text for the state machine
                mediaAnalysis = { type: 'audio', result: transcription };
            }
        }
    }
    // 2) Image → Gemini legibility analysis
    else if (message.imageMessage) {
        const imgMsg = message.imageMessage;
        const caption = imgMsg?.caption || '';
        textContent = caption || '[Imagem]';
        const media = await (0, ai_service_1.downloadBridgeMedia)(msgData);
        if (media) {
            const analysis = await (0, ai_service_1.analyzeImage)(media.base64, media.mimeType || 'image/jpeg', `Imagem do lead ${lead.name}`);
            const isTechnicalError = analysis.issues?.startsWith('technical_error:');
            if (analysis.isLegible) {
                mediaAnalysis = { type: 'image', result: `✅ ${analysis.description}${analysis.extractedText ? ' | ' + analysis.extractedText.slice(0, 150) : ''}` };
                textContent = `[Imagem legível] ${analysis.description}`;
            }
            else if (isTechnicalError) {
                // Technical error — don't label as "ilegível"
                mediaAnalysis = { type: 'image_error', result: `⚠️ Erro técnico ao processar imagem` };
                textContent = `[Imagem — erro de processamento]`;
                console.warn(`[Webhook] ⚠️ Image analysis technical error: ${analysis.issues}`);
            }
            else {
                mediaAnalysis = { type: 'image_illegible', result: `⚠️ Imagem ilegível: ${analysis.description}` };
                textContent = `[Imagem ilegível] ${analysis.description}`;
            }
        }
    }
    // 3) Document → analyze if image/PDF
    else if (message.documentMessage || message.documentWithCaptionMessage) {
        const docContainer = message.documentWithCaptionMessage?.message || {};
        const doc = (message.documentMessage || docContainer.documentMessage) || {};
        const fileName = doc?.fileName || 'documento';
        textContent = `[Documento: ${fileName}]`;
        const mimeType = doc?.mimetype || '';
        if (mimeType.includes('image') || mimeType.includes('pdf')) {
            const media = await (0, ai_service_1.downloadBridgeMedia)(msgData);
            if (media) {
                const analysis = await (0, ai_service_1.analyzeImage)(media.base64, media.mimeType || mimeType, `Documento "${fileName}" do lead ${lead.name}`);
                const isTechnicalError = analysis.issues?.startsWith('technical_error:');
                if (analysis.isLegible) {
                    mediaAnalysis = { type: 'document', result: `✅ ${analysis.description}${analysis.extractedText ? ' | ' + analysis.extractedText.slice(0, 200) : ''}` };
                    textContent = `[Documento legível: ${fileName}]`;
                }
                else if (isTechnicalError) {
                    mediaAnalysis = { type: 'document_error', result: `⚠️ Erro técnico ao processar documento` };
                    textContent = `[Documento — erro de processamento: ${fileName}]`;
                    console.warn(`[Webhook] ⚠️ Document analysis technical error: ${analysis.issues}`);
                }
                else {
                    mediaAnalysis = { type: 'document_illegible', result: `⚠️ Documento ilegível: ${analysis.description}` };
                    textContent = `[Documento ilegível: ${fileName}]`;
                }
            }
        }
    }
    // 4) Fallback para Plain Text já extraído acima ou Mensagem não suportada
    else {
        if (!textContent) {
            textContent = '[Mensagem não suportada]';
        }
    }
    // ── Save incoming message ────────────────────────────────────
    await (0, database_1.db)('messages').insert({
        conversation_id: Number(conversation.id),
        lead_id: Number(lead.id),
        content: textContent,
        direction: 'inbound',
        sender: 'lead',
        sent_at: sentAt,
    });
    // Emit to CRM Kanban
    (0, websocket_service_1.emitToAll)('new_message', {
        leadId: lead.id,
        direction: 'inbound',
        content: textContent,
        sender: 'lead',
        leadName: lead.name,
    });
    // Save media analysis as note
    if (mediaAnalysis) {
        await (0, database_1.db)('notes').insert({
            lead_id: Number(lead.id),
            author_type: 'bot',
            content: `[Análise de mídia] ${mediaAnalysis.result}`,
            created_at: new Date(),
        });
        (0, websocket_service_1.emitToAll)('media_analysis', { leadId: lead.id, leadName: lead.name, analysis: mediaAnalysis });
    }
    // ── STATE MACHINE ────────────────────────────────────────────
    if (textContent === '[Mensagem não suportada]')
        return;
    const currentStage = lead.bot_stage || 'reception';
    // Auto-extract data from messages
    await autoExtractLeadData(Number(lead.id), textContent, currentStage);
    // Determine if this message triggers a side-step
    const effectiveStage = determineSideStep(textContent, currentStage);
    // If bot is disabled for this lead, don't generate AI reply
    if (!lead.bot_active) {
        console.log('[Webhook] ⏸ Bot is disabled for lead', lead.id, '— skipping reply.');
        return;
    }
    console.log('[Webhook] 🤖 Bot is ACTIVE, generating AI reply...');
    // ── Generate bot reply ──────────────────────────────────────
    const historyRows = await (0, database_1.db)('messages')
        .where('lead_id', Number(lead.id))
        .orderBy('sent_at', 'asc')
        .select('content', 'direction', 'sender');
    const compressedHistory = (0, ai_service_1.buildCompressedHistory)(historyRows);
    // Remove the last message from history (it's the userMessage we'll send)
    const historyWithoutLast = compressedHistory.slice(0, -1);
    const [leadContext, memories] = await Promise.all([
        (0, ai_service_1.buildLeadContext)(Number(lead.id)),
        (0, ai_service_1.getRelevantMemories)(textContent),
    ]);
    const userMessageForBot = mediaAnalysis?.type?.includes('illegible')
        ? `${textContent}\n\n[Sistema: documento/imagem ilegível. Peça ao cliente para reenviar com boa iluminação.]`
        : mediaAnalysis?.type?.includes('error')
            ? `${textContent}\n\n[Sistema: houve um erro técnico ao processar a imagem. Peça gentilmente para o cliente reenviar a imagem. NÃO diga que ficou borrada.]`
            : textContent;
    console.log('[Webhook] 📤 Calling Gemini with history length:', historyWithoutLast.length);
    const botReply = await (0, ai_service_1.generateBotReply)(historyWithoutLast, userMessageForBot, leadContext, memories);
    if (!botReply) {
        console.log('[Webhook] ❌ No bot reply generated');
        return;
    }
    console.log('[Webhook] ✅ Bot reply:', botReply.substring(0, 80), '...');
    // ── Save outbound message ───────────────────────────────────
    await (0, database_1.db)('messages').insert({
        conversation_id: Number(conversation.id),
        lead_id: Number(lead.id),
        content: botReply,
        direction: 'outbound',
        sender: 'bot',
        sent_at: new Date(),
    });
    // Send reply in fragments (splits by paragraph, 5s delay between each)
    const targetPhone = String(lead.whatsapp_id || from);
    await (0, ai_service_1.sendFragmentedMessage)(targetPhone, botReply);
    (0, websocket_service_1.emitToAll)('new_message', {
        leadId: lead.id,
        direction: 'outbound',
        content: botReply,
        sender: 'bot',
    });
    const nextStage = advanceStage(effectiveStage, textContent);
    // Bot is deactivated when it reaches "done" (after cpf_collection)
    const isBotActive = (nextStage === 'done' || nextStage === 'followup') ? false : true;
    // Map bot flow to Kanban column stage_id
    const stageMap = {
        reception: 1, // Recebido
        case_identification: 1,
        document_request: 2, // Documentação
        payment_objection: 2,
        insecurity_handling: 2,
        cpf_collection: 3, // Qualificação
        timeline_question: 3,
        done: 4, // Análise (Humano assume)
        followup: 4
    };
    const nextStageId = stageMap[nextStage] || lead.stage_id;
    await (0, database_1.db)('leads')
        .where('id', Number(lead.id))
        .update({
        bot_stage: nextStage,
        bot_active: isBotActive,
        stage_id: nextStageId,
        bot_last_seen: new Date(),
        updated_at: new Date(),
    });
    // Notify CRM UI to visually move the card and toggle bot icon in real-time
    (0, websocket_service_1.emitToAll)('lead_updated', {
        leadId: lead.id,
        bot_stage: nextStage,
        bot_active: isBotActive,
        stage_id: nextStageId
    });
    // ── Async: record success pattern (non-blocking) ───────────
    const legalArea = (0, learning_service_1.detectLegalArea)(textContent);
    (0, ai_service_1.recordSuccessPattern)(textContent, botReply, legalArea, nextStage !== currentStage).catch(() => { });
    // ── Handoff: when documents are received, alert assessor ────
    if (nextStage === 'documents_received' || (mediaAnalysis?.type === 'document' && currentStage === 'document_request')) {
        await triggerHandoff(Number(lead.id), from, currentStage, historyRows, lead.name, legalArea);
    }
    // ── Async: post-conversation deep learning ─────────────────
    if (nextStage === 'done' || nextStage === 'documents_received') {
        (0, learning_service_1.runPostConversationLearning)(Number(lead.id)).catch(() => { });
    }
}
// ============================================================
// State Machine Helpers
// ============================================================
/**
 * Detect side-step triggers (payment question, insecurity, timeline)
 * that interrupt the main flow temporarily.
 */
function determineSideStep(text, currentStage) {
    if ((0, learning_service_1.detectObjection)(text) && !['insecurity_handling', 'done'].includes(currentStage)) {
        return 'insecurity_handling';
    }
    if ((0, learning_service_1.detectPaymentQuestion)(text) && !['payment_objection', 'documents_received', 'done'].includes(currentStage)) {
        return 'payment_objection';
    }
    if ((0, learning_service_1.detectTimelineQuestion)(text)) {
        return 'timeline_question';
    }
    return currentStage;
}
/**
 * Advance to next stage based on message content.
 * For CPF collection: only advance when CPF is detected.
 */
function advanceStage(currentStage, textContent) {
    // Reception: always advance to case_identification after the first reply
    if (currentStage === 'reception') {
        return STAGE_FLOW[currentStage];
    }
    // Case identification: only advance if the user actually explains the problem
    if (currentStage === 'case_identification') {
        const area = (0, learning_service_1.detectLegalArea)(textContent);
        if (area)
            return STAGE_FLOW[currentStage]; // Avança se a área jurídica for óbvia
        const tokens = textContent.trim().split(/\s+/);
        // If it's just a short vague complaint (e.g. "nome sujo"), wait for the user to explain better
        if (tokens.length <= 12) {
            return currentStage;
        }
        return STAGE_FLOW[currentStage];
    }
    // Document request: advance to CPF when a legible document or image is sent
    if (currentStage === 'document_request') {
        const hasDoc = textContent.includes('[Documento legível') || textContent.includes('[Imagem legível]');
        return hasDoc ? STAGE_FLOW[currentStage] : currentStage;
    }
    // CPF collection: only advance to termination (done) when CPF is actually in the message
    if (currentStage === 'cpf_collection') {
        const hasCPF = (0, learning_service_1.extractCPF)(textContent) !== null;
        return hasCPF ? STAGE_FLOW[currentStage] : currentStage;
    }
    // Side steps return to normal flow automatically
    if (['insecurity_handling', 'payment_objection', 'timeline_question'].includes(currentStage)) {
        // Find which generic stage to return to based on current history
        return STAGE_FLOW[currentStage] || 'document_request';
    }
    return STAGE_FLOW[currentStage] || currentStage;
}
/**
 * Auto-extract and update lead data from message text.
 */
async function autoExtractLeadData(leadId, text, stage) {
    try {
        const updates = {};
        // Extract CPF
        const cpf = (0, learning_service_1.extractCPF)(text);
        if (cpf)
            updates.cpf = cpf;
        // Extract name (only if still "unknown" — stored as phone number initially)
        if (['reception', 'case_identification', 'cpf_collection'].includes(stage)) {
            const name = (0, learning_service_1.extractName)(text);
            if (name) {
                const current = await (0, database_1.db)('leads').where('id', leadId).select('name', 'phone').first();
                // Only update if name looks like a default (phone, @lid, or "Lead XYZ")
                if (current && (current.name === current.phone || current.name.includes('@lid') || current.name.startsWith('Lead ') || /^\d+$/.test(current.name))) {
                    updates.name = name;
                }
            }
        }
        // Detect and update funnel (legal area)
        const area = (0, learning_service_1.detectLegalArea)(text);
        if (area) {
            const funnel = await (0, database_1.db)('funnels').where('slug', area).first();
            if (funnel)
                updates.funnel_id = funnel.id;
        }
        if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date();
            await (0, database_1.db)('leads').where('id', leadId).update(updates);
            (0, websocket_service_1.emitToAll)('lead_updated', { leadId, ...updates });
        }
    }
    catch {
        // Non-critical
    }
}
/**
 * Trigger handoff: disable bot, create handoff record, notify CRM.
 */
async function triggerHandoff(leadId, phone, currentStage, messages, leadName, legalArea) {
    try {
        // Disable bot for this lead
        await (0, database_1.db)('leads').where('id', leadId).update({ bot_active: false, updated_at: new Date() });
        // Generate AI summary for assessor
        const summary = await (0, ai_service_1.generateHandoffSummary)(leadName, legalArea, messages);
        // Record handoff
        await (0, database_1.db)('bot_handoffs').insert({
            lead_id: leadId,
            reason: 'documents_received',
            bot_stage_at_handoff: currentStage,
            summary,
            notified_at: new Date(),
        });
        // Notify all CRM users via WebSocket
        (0, websocket_service_1.emitToAll)('bot_handoff', {
            leadId,
            leadName,
            phone,
            legalArea,
            summary,
            message: `📋 Novo lead pronto para atendimento: ${leadName}`,
        });
        console.log(`[Bot] Handoff triggered for lead ${leadId} (${leadName})`);
    }
    catch (err) {
        console.error('[Bot] Handoff error:', err);
    }
}
// ============================================================
// Database Helpers
// ============================================================
async function getOrCreateLead(phone, pushName) {
    let lead = await (0, database_1.db)('leads').where('phone', phone).first();
    if (!lead) {
        const defaultFunnel = await (0, database_1.db)('funnels').orderBy('id').first();
        const defaultStage = await (0, database_1.db)('stages').orderBy('display_order').first();
        // If pushName is available, use it, otherwise use a clean phone format
        const displayPhone = phone.includes('@') ? phone.split('@')[0] : phone;
        const initialName = pushName && pushName.trim().length > 0 ? pushName : `Lead ${displayPhone.slice(-4)}`;
        const [{ id: newLeadId }] = await (0, database_1.db)('leads').insert({
            name: initialName,
            phone,
            origin: 'whatsapp',
            funnel_id: defaultFunnel?.id || 1,
            stage_id: defaultStage?.id || 1,
            status: 'active',
            bot_active: true,
            bot_stage: 'reception',
            created_at: new Date(),
            updated_at: new Date(),
        }).returning('id');
        lead = await (0, database_1.db)('leads').where('id', newLeadId).first();
        console.log(`[Bot] New lead created: ${phone} (id=${newLeadId})`);
        (0, websocket_service_1.emitToAll)('new_lead', { leadId: newLeadId, phone });
    }
    return lead;
}
async function getOrCreateConversation(leadId, whatsappChatId) {
    let conversation = await (0, database_1.db)('conversations')
        .where('lead_id', leadId)
        .where('channel', 'whatsapp')
        .where('status', '!=', 'resolved')
        .orderBy('created_at', 'desc')
        .first();
    if (!conversation) {
        const [{ id }] = await (0, database_1.db)('conversations').insert({
            lead_id: leadId,
            whatsapp_chat_id: whatsappChatId,
            channel: 'whatsapp',
            status: 'open',
            created_at: new Date(),
            updated_at: new Date(),
        }).returning('id');
        conversation = await (0, database_1.db)('conversations').where('id', id).first();
    }
    return conversation;
}
// ============================================================
// WhatsApp Management Endpoints (CRM)
// ============================================================
async function connectWhatsApp(req, res) {
    console.log('[DEBUG-WA] connectWhatsApp triggered instance:', env_1.config.whatsapp.instance);
    try {
        // Step 1: Tear down any stale in-memory instance on the bridge.
        // This is necessary because the bridge caches instances and the old guard
        // would return early without generating a new QR code on reconnect.
        try {
            await axios_1.default.delete(`${env_1.config.whatsapp.apiUrl}/instance/logout/${env_1.config.whatsapp.instance}`, { headers: { apikey: env_1.config.whatsapp.apiKey }, timeout: 8000 });
            console.log('[DEBUG-WA] Stale instance cleared before reconnect');
        }
        catch (_) {
            // Bridge may not have a stale instance — that's fine, continue
            console.log('[DEBUG-WA] No stale instance to clear (or bridge not reachable for delete), continuing');
        }
        // Step 2: Create a fresh instance — the bridge will now emit a QR code via SSE
        const instanceRes = await axios_1.default.post(`${env_1.config.whatsapp.apiUrl}/instance/create`, { instanceName: env_1.config.whatsapp.instance }, { headers: { apikey: env_1.config.whatsapp.apiKey }, timeout: 15000 });
        console.log('[DEBUG-WA] Instance created/connected, state:', instanceRes.data);
        res.json({ success: true, data: instanceRes.data });
    }
    catch (err) {
        const error = err;
        console.error('[DEBUG-WA] connectWhatsApp FAILURE:', error?.response?.data || error?.message || error);
        res.status(500).json({ success: false, error: 'Erro ao conectar WhatsApp — bridge inacessível', details: error?.response?.data || error?.message });
    }
}
async function disconnectWhatsApp(_req, res) {
    try {
        await axios_1.default.delete(`${env_1.config.whatsapp.apiUrl}/instance/logout/${env_1.config.whatsapp.instance}`, { headers: { apikey: env_1.config.whatsapp.apiKey }, timeout: 10000 });
        res.json({ success: true, message: 'WhatsApp desconectado com sucesso' });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: 'Erro ao desconectar WhatsApp', details: error?.response?.data || error?.message });
    }
}
async function getQRCode(_req, res) {
    console.log('[DEBUG-WA] getQRCode triggered');
    try {
        // Use the correct bridge endpoint: /instance/qr/:name
        const response = await axios_1.default.get(`${env_1.config.whatsapp.apiUrl}/instance/qr/${env_1.config.whatsapp.instance}`, { headers: { apikey: env_1.config.whatsapp.apiKey }, timeout: 8000 });
        res.json({ success: true, data: response.data });
    }
    catch (err) {
        const error = err;
        console.error('[DEBUG-WA] getQRCode FAILURE:', error?.response?.data || error?.message || error);
        res.status(404).json({ success: false, error: 'QR Code ainda não disponível', details: error?.response?.data || error?.message });
    }
}
async function getConnectionStatus(_req, res) {
    try {
        const response = await axios_1.default.get(`${env_1.config.whatsapp.apiUrl}/instance/connectionState/${env_1.config.whatsapp.instance}`, { headers: { apikey: env_1.config.whatsapp.apiKey }, timeout: 8000 });
        res.json({ success: true, data: response.data });
    }
    catch {
        res.json({ success: true, data: { state: 'disconnected' } });
    }
}
// ============================================================
// Bot Management Endpoints
// ============================================================
/** PATCH /api/leads/:id/bot — toggle bot on/off for a specific lead */
async function toggleLeadBot(req, res) {
    const { id } = req.params;
    const { active } = req.body;
    try {
        await (0, database_1.db)('leads').where('id', id).update({
            bot_active: Boolean(active),
            bot_stage: active ? 'reception' : database_1.db.raw('bot_stage'),
            updated_at: new Date(),
        });
        res.json({ success: true, bot_active: active });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message });
    }
}
/** GET /api/bot/memory — list all bot memory patterns */
async function getBotMemory(req, res) {
    const { category, limit = '50' } = req.query;
    try {
        let query = (0, database_1.db)('bot_memory').where('is_active', true);
        if (category)
            query = query.where('category', category);
        const patterns = await query
            .orderBy('usage_count', 'desc')
            .orderBy('confidence_score', 'desc')
            .limit(parseInt(limit, 10));
        const total = await (0, database_1.db)('bot_memory').where('is_active', true).count('id as count').first();
        res.json({
            success: true,
            data: patterns,
            total: parseInt(String(total.count || '0'), 10),
        });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message });
    }
}
/** POST /api/bot/memory — manually add a memory pattern */
async function addBotMemory(req, res) {
    const { category, trigger_pattern, successful_response, legal_area } = req.body;
    if (!category || !trigger_pattern) {
        res.status(400).json({ success: false, error: 'category e trigger_pattern são obrigatórios' });
        return;
    }
    try {
        const [{ id }] = await (0, database_1.db)('bot_memory').insert({
            category,
            trigger_pattern,
            successful_response: successful_response || null,
            legal_area: legal_area || null,
            usage_count: 1,
            confidence_score: 75,
            is_active: true,
        }).returning('id');
        res.json({ success: true, id });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message });
    }
}
/** DELETE /api/bot/memory/:id — disable a memory pattern */
async function deleteBotMemory(req, res) {
    const { id } = req.params;
    try {
        await (0, database_1.db)('bot_memory').where('id', id).update({ is_active: false });
        res.json({ success: true, message: 'Padrão desativado' });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message });
    }
}
/** GET /api/bot/handoffs — list pending handoffs for assessors */
async function getHandoffs(req, res) {
    const { unacknowledged } = req.query;
    try {
        let query = (0, database_1.db)('bot_handoffs')
            .leftJoin('leads', 'bot_handoffs.lead_id', 'leads.id')
            .select('bot_handoffs.*', 'leads.name as lead_name', 'leads.phone', 'leads.cpf', 'leads.funnel_id')
            .orderBy('bot_handoffs.notified_at', 'desc');
        if (unacknowledged === 'true') {
            query = query.whereNull('bot_handoffs.acknowledged_at');
        }
        const handoffs = await query.limit(50);
        res.json({ success: true, data: handoffs });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message });
    }
}
/** PATCH /api/bot/handoffs/:id/acknowledge — mark handoff as seen */
async function acknowledgeHandoff(req, res) {
    const { id } = req.params;
    const userId = req.user?.id;
    try {
        await (0, database_1.db)('bot_handoffs').where('id', id).update({
            acknowledged_by: userId || null,
            acknowledged_at: new Date(),
        });
        res.json({ success: true });
    }
    catch (err) {
        const error = err;
        res.status(500).json({ success: false, error: error.message });
    }
}
/** POST /api/webhook/whatsapp/test — send a test WhatsApp message */
async function sendTestMessage(req, res) {
    const { phone, message } = req.body;
    if (!phone) {
        res.status(400).json({ success: false, error: 'Número de telefone é obrigatório' });
        return;
    }
    const cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.length < 10) {
        res.status(400).json({ success: false, error: 'Número de telefone inválido' });
        return;
    }
    try {
        await (0, ai_service_1.sendWhatsAppMessage)(cleanPhone, message || '🤖 Teste de conexão do Legacy Bot — funcionando com sucesso!');
        res.json({
            success: true,
            message: `Mensagem enviada para +${cleanPhone}`,
            phone: cleanPhone,
        });
    }
    catch (err) {
        const error = err;
        console.error('[WhatsApp] Test message error:', err);
        res.status(500).json({ success: false, error: error.message || 'Erro ao enviar mensagem de teste' });
    }
}
//# sourceMappingURL=conversations.controller.js.map