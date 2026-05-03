import { Request, Response } from 'express';
import axios from 'axios';
import { db } from '../config/database';
import {
    generateBotReply,
    sendWhatsAppMessage,
    sendFragmentedMessage,
    analyzeImage,
    transcribeAudio,
    downloadBridgeMedia,
    buildCompressedHistory,
    getRelevantMemories,
    buildLeadContext,
    recordSuccessPattern,
    generateHandoffSummary,
} from '../services/ai.service';
import {
    detectLegalArea,
    detectObjection,
    detectPaymentQuestion,
    detectTimelineQuestion,
    extractCPF,
    extractName,
    runPostConversationLearning,
} from '../services/learning.service';
import { emitToAll } from '../services/websocket.service';
import { config } from '../config/env';

// ============================================================
// Funnel Stage Flow Definition
// ============================================================
const STAGE_FLOW: Record<string, string> = {
    reception: 'case_identification',
    case_identification: 'document_request',
    payment_objection: 'document_request',    // side-step, returns to main track
    document_request: 'cpf_collection',
    insecurity_handling: 'document_request',   // side-step, returns to main track
    cpf_collection: 'done',
    timeline_question: 'followup',
    followup: 'followup',
    done: 'done',
};

// ============================================================
// Evolution API Webhook — POST /api/webhook/whatsapp
// ============================================================
export async function handleWebhook(req: Request, res: Response): Promise<void> {
    // Ack immediately — Evolution API must not retry
    res.status(200).json({ received: true });

    console.log('[Webhook] ▶ Received event:', req.body?.event, '| instance:', req.body?.instance);

    const body = req.body;
    const event = body.event || body.type;

    if (event === 'qrcode.updated') {
        console.log('[WhatsApp] QR Code updated');
        emitToAll('whatsapp_qr', { qrCode: body.data?.qrcode?.base64 });
        return;
    }

    if (event === 'connection.update') {
        const status = body.data?.state;
        console.log(`[WhatsApp] Connection: ${status}`);
        emitToAll('whatsapp_status', { status });
        return;
    }

    if (event !== 'messages.upsert') return;

    const messages = Array.isArray(body.data) ? body.data : [body.data];
    for (const msgData of messages) {
        processMessage(msgData as Record<string, unknown>).catch((err) =>
            console.error('[WhatsApp] Message processing error:', err)
        );
    }
}

// ============================================================
// Process a single incoming message (async, non-blocking)
// ============================================================
async function processMessage(msgData: Record<string, unknown>): Promise<void> {
    const key = msgData.key as Record<string, unknown>;
    const messageId = key?.id as string;
    const remoteJid = key?.remoteJid as string;
    const from = remoteJid?.replace('@s.whatsapp.net', '')?.replace('@c.us', '')?.replace('@lid', '') || '';

    console.log('[Webhook] 📩 processMessage called. fromMe:', key?.fromMe, '| remoteJid:', key?.remoteJid, '| msgId:', messageId);

    // ── Pre-parse content to intercept !reset even if fromMe=true ──
    const message = msgData.message as Record<string, unknown>;
    let textContent = '';
    if (message?.conversation || message?.extendedTextMessage) {
        textContent = (
            (message.conversation as string) ||
            ((message.extendedTextMessage as Record<string, unknown>)?.text as string) ||
            ''
        );
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
            const dup = await db('messages').where('whatsapp_message_id', messageId).first();
            if (dup) {
                console.log(`[WhatsApp] Duplicate skipped: ${messageId}`);
                return;
            }
        } catch {
            // Column whatsapp_message_id may not exist yet — deduplication skipped safely
        }
    }

    const messageTimestamp = (msgData.messageTimestamp as number) || Math.floor(Date.now() / 1000);
    const sentAt = new Date(messageTimestamp * 1000);

    // ── Skip old messages (e.g., from a sync when connecting) ──
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (sentAt < fiveMinutesAgo) {
        console.log(`[Webhook] ⏭ Skipping old message (${sentAt.toISOString()}) to prevent reply flood`);
        return;
    }

    const pushName = msgData.pushName as string | undefined;

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
        await db('messages').where('lead_id', Number(lead.id)).del();
        console.log('[Webhook] 🗑️ All messages deleted for lead', lead.id);

        // 2. Mark existing conversations as resolved (a fresh one will be created on next message)
        await db('conversations')
            .where('lead_id', Number(lead.id))
            .where('status', '!=', 'resolved')
            .update({ status: 'resolved', updated_at: new Date() });

        const recebidoStage = await db('stages').where({ slug: 'recebido' }).first() as { id: number } | undefined;
        const resetStageId = recebidoStage?.id ?? (await db('stages').orderBy('display_order').first() as { id: number } | undefined)?.id ?? 1;

        // 4. Delete related data (documents, notes, tasks, handoffs)
        await db('documents').where('lead_id', Number(lead.id)).del();
        await db('notes').where('lead_id', Number(lead.id)).del();
        await db('tasks').where('lead_id', Number(lead.id)).del();
        await db('bot_handoffs').where('lead_id', Number(lead.id)).del();
        console.log('[Webhook] 🗑️ All documents, notes, tasks, and handoffs deleted for lead', lead.id);

        // 5. Reset lead data (fields)
        const displayPhone = from.includes('@') ? from.split('@')[0] : from;
        const initialName = pushName && pushName.trim().length > 0 ? pushName : `Lead ${displayPhone.slice(-4)}`;

        await db('leads').where('id', Number(lead.id)).update({
            name: initialName,
            cpf: null,
            address: null,
            email: null,
            bot_stage: 'reception',
            bot_active: 1,
            stage_id: resetStageId,
            updated_at: new Date()
        });

        const targetPhone = String(lead.whatsapp_id || from);
        await sendWhatsAppMessage(targetPhone, "🔄 *Modo de Teste Iniciado*\n\nSeu estágio voltou para o início (Recepção) e o robô está ativo novamente! Mande um 'Oi' para começar do zero.");
        return;
    }

    console.log('[Webhook] 👤 Lead:', lead.id, '| name:', lead.name, '| bot_active:', lead.bot_active, '| bot_stage:', lead.bot_stage);

    const conversation = await getOrCreateConversation(Number(lead.id), remoteJid || `${from}@s.whatsapp.net`);
    if (!message) return;

    // ── Parse message content by type ──────────────────────────
    let mediaAnalysis: { type: string; result: string } | null = null;

    // 1) Audio / Voice → Gemini transcription
    if (message.audioMessage || message.pttMessage) {
        textContent = '[Áudio]';
        // Baileys Bridge sends the message object. We can implement media download in aiService if needed.
        const media = await downloadBridgeMedia(msgData);
        if (media) {
            const transcription = await transcribeAudio(media.base64, media.mimeType);
            if (transcription) {
                textContent = transcription; // treat transcript as plain text for the state machine
                mediaAnalysis = { type: 'audio', result: transcription };
            }
        }
    }
    // 2) Image → Gemini legibility analysis
    else if (message.imageMessage) {
        const imgMsg = message.imageMessage as Record<string, unknown>;
        const caption = (imgMsg?.caption as string) || '';
        textContent = caption || '[Imagem]';

        const media = await downloadBridgeMedia(msgData);
        if (media) {
            const analysis = await analyzeImage(
                media.base64,
                media.mimeType || 'image/jpeg',
                `Imagem do lead ${lead.name as string}`
            );
            const isTechnicalError = analysis.issues?.startsWith('technical_error:');
            if (analysis.isLegible) {
                mediaAnalysis = { type: 'image', result: `✅ ${analysis.description}${analysis.extractedText ? ' | ' + analysis.extractedText.slice(0, 150) : ''}` };
                textContent = `[Imagem legível] ${analysis.description}`;
            } else if (isTechnicalError) {
                // Technical error — don't label as "ilegível"
                mediaAnalysis = { type: 'image_error', result: `⚠️ Erro técnico ao processar imagem` };
                textContent = `[Imagem — erro de processamento]`;
                console.warn(`[Webhook] ⚠️ Image analysis technical error: ${analysis.issues}`);
            } else {
                mediaAnalysis = { type: 'image_illegible', result: `⚠️ Imagem ilegível: ${analysis.description}` };
                textContent = `[Imagem ilegível] ${analysis.description}`;
            }
        }
    }
    // 3) Document → analyze if image/PDF
    else if (message.documentMessage || message.documentWithCaptionMessage) {
        const docContainer = (message.documentWithCaptionMessage as Record<string, unknown>)?.message || {};
        const doc = ((message.documentMessage || (docContainer as Record<string, unknown>).documentMessage) as Record<string, unknown>) || {};
        const fileName = (doc?.fileName as string) || 'documento';
        textContent = `[Documento: ${fileName}]`;

        const mimeType = (doc?.mimetype as string) || '';
        if (mimeType.includes('image') || mimeType.includes('pdf')) {
            const media = await downloadBridgeMedia(msgData);
            if (media) {
                const analysis = await analyzeImage(
                    media.base64,
                    media.mimeType || mimeType,
                    `Documento "${fileName}" do lead ${lead.name as string}`
                );
                const isTechnicalError = analysis.issues?.startsWith('technical_error:');
                if (analysis.isLegible) {
                    mediaAnalysis = { type: 'document', result: `✅ ${analysis.description}${analysis.extractedText ? ' | ' + analysis.extractedText.slice(0, 200) : ''}` };
                    textContent = `[Documento legível: ${fileName}]`;
                } else if (isTechnicalError) {
                    mediaAnalysis = { type: 'document_error', result: `⚠️ Erro técnico ao processar documento` };
                    textContent = `[Documento — erro de processamento: ${fileName}]`;
                    console.warn(`[Webhook] ⚠️ Document analysis technical error: ${analysis.issues}`);
                } else {
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
    await db('messages').insert({
        conversation_id: Number(conversation.id),
        lead_id: Number(lead.id),
        content: textContent,
        direction: 'inbound',
        sender: 'lead',
        sent_at: sentAt,
    });

    // Emit to CRM Kanban
    emitToAll('new_message', {
        leadId: lead.id,
        direction: 'inbound',
        content: textContent,
        sender: 'lead',
        leadName: lead.name,
    });

    // Save media analysis as note
    if (mediaAnalysis) {
        await db('notes').insert({
            lead_id: Number(lead.id),
            author_type: 'bot',
            content: `[Análise de mídia] ${mediaAnalysis.result}`,
            created_at: new Date(),
        });
        emitToAll('media_analysis', { leadId: lead.id, leadName: lead.name, analysis: mediaAnalysis });
    }

    // ── STATE MACHINE ────────────────────────────────────────────
    if (textContent === '[Mensagem não suportada]') return;

    const currentStage = (lead.bot_stage as string) || 'reception';

    // Auto-extract data from messages
    await autoExtractLeadData(Number(lead.id), textContent, currentStage);

    // Determine if this message triggers a side-step
    const effectiveStage = determineSideStep(textContent, currentStage);

    // If bot is disabled for this lead, don't generate AI reply
    if (!(lead.bot_active as boolean)) {
        console.log('[Webhook] ⏸ Bot is disabled for lead', lead.id, '— skipping reply.');
        return;
    }

    console.log('[Webhook] 🤖 Bot is ACTIVE, generating AI reply...');

    // ── Generate bot reply ──────────────────────────────────────
    const historyRows = await db('messages')
        .where('lead_id', Number(lead.id))
        .orderBy('sent_at', 'asc')
        .select('content', 'direction', 'sender');

    const compressedHistory = buildCompressedHistory(
        historyRows as { direction: string; content: string; sender: string }[]
    );

    // Remove the last message from history (it's the userMessage we'll send)
    const historyWithoutLast = compressedHistory.slice(0, -1);

    const [leadContext, memories] = await Promise.all([
        buildLeadContext(Number(lead.id)),
        getRelevantMemories(textContent),
    ]);

    const userMessageForBot =
        mediaAnalysis?.type?.includes('illegible')
            ? `${textContent}\n\n[Sistema: documento/imagem ilegível. Peça ao cliente para reenviar com boa iluminação.]`
            : mediaAnalysis?.type?.includes('error')
            ? `${textContent}\n\n[Sistema: houve um erro técnico ao processar a imagem. Peça gentilmente para o cliente reenviar a imagem. NÃO diga que ficou borrada.]`
            : textContent;

    console.log('[Webhook] 📤 Calling Gemini with history length:', historyWithoutLast.length);
    const botReply = await generateBotReply(
        historyWithoutLast,
        userMessageForBot,
        leadContext,
        memories
    );

    if (!botReply) {
        console.log('[Webhook] ❌ No bot reply generated');
        return;
    }
    console.log('[Webhook] ✅ Bot reply:', botReply.substring(0, 80), '...');

    // ── Save outbound message ───────────────────────────────────
    await db('messages').insert({
        conversation_id: Number(conversation.id),
        lead_id: Number(lead.id),
        content: botReply,
        direction: 'outbound',
        sender: 'bot',
        sent_at: new Date(),
    });

    // Send reply in fragments (splits by paragraph, 5s delay between each)
    const targetPhone = String(lead.whatsapp_id || from);
    await sendFragmentedMessage(targetPhone, botReply);

    emitToAll('new_message', {
        leadId: lead.id,
        direction: 'outbound',
        content: botReply,
        sender: 'bot',
    });

    const nextStage = advanceStage(effectiveStage, textContent);
    // Bot is deactivated when it reaches "done" (after cpf_collection)
    const isBotActive = (nextStage === 'done' || nextStage === 'followup') ? false : true;

    // Map bot flow to Kanban column stage_id
    const stageMap: Record<string, number> = {
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

    await db('leads')
        .where('id', Number(lead.id))
        .update({
            bot_stage: nextStage,
            bot_active: isBotActive,
            stage_id: nextStageId,
            bot_last_seen: new Date(),
            updated_at: new Date(),
        });

    // Notify CRM UI to visually move the card and toggle bot icon in real-time
    emitToAll('lead_updated', {
        leadId: lead.id,
        bot_stage: nextStage,
        bot_active: isBotActive,
        stage_id: nextStageId
    });

    // ── Async: record success pattern (non-blocking) ───────────
    const legalArea = detectLegalArea(textContent);
    recordSuccessPattern(textContent, botReply, legalArea, nextStage !== currentStage).catch(() => { });

    // ── Handoff: when documents are received, alert assessor ────
    if (nextStage === 'documents_received' || (mediaAnalysis?.type === 'document' && currentStage === 'document_request')) {
        await triggerHandoff(Number(lead.id), from, currentStage, historyRows as { direction: string; content: string; sender: string }[], lead.name as string, legalArea);
    }

    // ── Async: post-conversation deep learning ─────────────────
    if (nextStage === 'done' || nextStage === 'documents_received') {
        runPostConversationLearning(Number(lead.id)).catch(() => { });
    }
}

// ============================================================
// State Machine Helpers
// ============================================================

/**
 * Detect side-step triggers (payment question, insecurity, timeline)
 * that interrupt the main flow temporarily.
 */
function determineSideStep(text: string, currentStage: string): string {
    if (detectObjection(text) && !['insecurity_handling', 'done'].includes(currentStage)) {
        return 'insecurity_handling';
    }
    if (detectPaymentQuestion(text) && !['payment_objection', 'documents_received', 'done'].includes(currentStage)) {
        return 'payment_objection';
    }
    if (detectTimelineQuestion(text)) {
        return 'timeline_question';
    }
    return currentStage;
}

/**
 * Advance to next stage based on message content.
 * For CPF collection: only advance when CPF is detected.
 */
function advanceStage(currentStage: string, textContent: string): string {
    // Reception: always advance to case_identification after the first reply
    if (currentStage === 'reception') {
        return STAGE_FLOW[currentStage];
    }

    // Case identification: only advance if the user actually explains the problem
    if (currentStage === 'case_identification') {
        const area = detectLegalArea(textContent);
        if (area) return STAGE_FLOW[currentStage]; // Avança se a área jurídica for óbvia

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
        const hasCPF = extractCPF(textContent) !== null;
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
async function autoExtractLeadData(leadId: number, text: string, stage: string): Promise<void> {
    try {
        const updates: Record<string, unknown> = {};

        // Extract CPF
        const cpf = extractCPF(text);
        if (cpf) updates.cpf = cpf;

        // Extract name (only if still "unknown" — stored as phone number initially)
        if (['reception', 'case_identification', 'cpf_collection'].includes(stage)) {
            const name = extractName(text);
            if (name) {
                const current = await db('leads').where('id', leadId).select('name', 'phone').first() as { name: string, phone: string } | undefined;
                // Only update if name looks like a default (phone, @lid, or "Lead XYZ")
                if (current && (current.name === current.phone || current.name.includes('@lid') || current.name.startsWith('Lead ') || /^\d+$/.test(current.name))) {
                    updates.name = name;
                }
            }
        }

        // Detect and update funnel (legal area)
        const area = detectLegalArea(text);
        if (area) {
            const funnel = await db('funnels').where('slug', area).first() as { id: number } | undefined;
            if (funnel) updates.funnel_id = funnel.id;
        }

        if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date();
            await db('leads').where('id', leadId).update(updates);
            emitToAll('lead_updated', { leadId, ...updates });
        }
    } catch {
        // Non-critical
    }
}

/**
 * Trigger handoff: disable bot, create handoff record, notify CRM.
 */
async function triggerHandoff(
    leadId: number,
    phone: string,
    currentStage: string,
    messages: { direction: string; content: string; sender: string }[],
    leadName: string,
    legalArea: string | null
): Promise<void> {
    try {
        // Disable bot for this lead
        await db('leads').where('id', leadId).update({ bot_active: false, updated_at: new Date() });

        // Generate AI summary for assessor
        const summary = await generateHandoffSummary(leadName, legalArea, messages);

        // Record handoff
        await db('bot_handoffs').insert({
            lead_id: leadId,
            reason: 'documents_received',
            bot_stage_at_handoff: currentStage,
            summary,
            notified_at: new Date(),
        });

        // Notify all CRM users via WebSocket
        emitToAll('bot_handoff', {
            leadId,
            leadName,
            phone,
            legalArea,
            summary,
            message: `📋 Novo lead pronto para atendimento: ${leadName}`,
        });

        console.log(`[Bot] Handoff triggered for lead ${leadId} (${leadName})`);
    } catch (err) {
        console.error('[Bot] Handoff error:', err);
    }
}

// ============================================================
// Database Helpers
// ============================================================
async function getOrCreateLead(phone: string, pushName?: string): Promise<Record<string, unknown>> {
    let lead = await db('leads').where('phone', phone).first();

    if (!lead) {
        const defaultFunnel = await db('funnels').orderBy('id').first();
        const defaultStage = await db('stages').orderBy('display_order').first();

        // If pushName is available, use it, otherwise use a clean phone format
        const displayPhone = phone.includes('@') ? phone.split('@')[0] : phone;
        const initialName = pushName && pushName.trim().length > 0 ? pushName : `Lead ${displayPhone.slice(-4)}`;

        const [newLeadId] = await db('leads').insert({
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
        });

        lead = await db('leads').where('id', newLeadId).first();

        console.log(`[Bot] New lead created: ${phone} (id=${newLeadId})`);
        emitToAll('new_lead', { leadId: newLeadId, phone });
    }

    return lead as Record<string, unknown>;
}

async function getOrCreateConversation(leadId: number, whatsappChatId: string): Promise<Record<string, unknown>> {
    let conversation = await db('conversations')
        .where('lead_id', leadId)
        .where('channel', 'whatsapp')
        .where('status', '!=', 'resolved')
        .orderBy('created_at', 'desc')
        .first();

    if (!conversation) {
        const [id] = await db('conversations').insert({
            lead_id: leadId,
            whatsapp_chat_id: whatsappChatId,
            channel: 'whatsapp',
            status: 'open',
            created_at: new Date(),
            updated_at: new Date(),
        });
        conversation = await db('conversations').where('id', id).first();
    }

    return conversation as Record<string, unknown>;
}

// ============================================================
// WhatsApp Management Endpoints (CRM)
// ============================================================
export async function connectWhatsApp(req: Request, res: Response): Promise<void> {
    console.log('[DEBUG-WA] connectWhatsApp triggered instance:', config.whatsapp.instance);
    try {
        // Step 1: Tear down any stale in-memory instance on the bridge.
        // This is necessary because the bridge caches instances and the old guard
        // would return early without generating a new QR code on reconnect.
        try {
            await axios.delete(
                `${config.whatsapp.apiUrl}/instance/logout/${config.whatsapp.instance}`,
                { headers: { apikey: config.whatsapp.apiKey }, timeout: 8000 }
            );
            console.log('[DEBUG-WA] Stale instance cleared before reconnect');
        } catch (_) {
            // Bridge may not have a stale instance — that's fine, continue
            console.log('[DEBUG-WA] No stale instance to clear (or bridge not reachable for delete), continuing');
        }

        // Step 2: Create a fresh instance — the bridge will now emit a QR code via SSE
        const instanceRes = await axios.post(
            `${config.whatsapp.apiUrl}/instance/create`,
            { instanceName: config.whatsapp.instance },
            { headers: { apikey: config.whatsapp.apiKey }, timeout: 15000 }
        );
        console.log('[DEBUG-WA] Instance created/connected, state:', instanceRes.data);
        res.json({ success: true, data: instanceRes.data });
    } catch (err) {
        const error = err as { response?: { data?: unknown }; message?: string };
        console.error('[DEBUG-WA] connectWhatsApp FAILURE:', error?.response?.data || error?.message || error);
        res.status(500).json({ success: false, error: 'Erro ao conectar WhatsApp — bridge inacessível', details: error?.response?.data || error?.message });
    }
}

export async function disconnectWhatsApp(_req: Request, res: Response): Promise<void> {
    try {
        await axios.delete(
            `${config.whatsapp.apiUrl}/instance/logout/${config.whatsapp.instance}`,
            { headers: { apikey: config.whatsapp.apiKey }, timeout: 10000 }
        );
        res.json({ success: true, message: 'WhatsApp desconectado com sucesso' });
    } catch (err) {
        const error = err as { response?: { data?: unknown }; message?: string };
        res.status(500).json({ success: false, error: 'Erro ao desconectar WhatsApp', details: error?.response?.data || error?.message });
    }
}

export async function getQRCode(_req: Request, res: Response): Promise<void> {
    console.log('[DEBUG-WA] getQRCode triggered');
    try {
        // Use the correct bridge endpoint: /instance/qr/:name
        const response = await axios.get(
            `${config.whatsapp.apiUrl}/instance/qr/${config.whatsapp.instance}`,
            { headers: { apikey: config.whatsapp.apiKey }, timeout: 8000 }
        );
        res.json({ success: true, data: response.data });
    } catch (err) {
        const error = err as { response?: { data?: unknown }; message?: string };
        console.error('[DEBUG-WA] getQRCode FAILURE:', error?.response?.data || error?.message || error);
        res.status(404).json({ success: false, error: 'QR Code ainda não disponível', details: error?.response?.data || error?.message });
    }
}

export async function getConnectionStatus(_req: Request, res: Response): Promise<void> {
    try {
        const response = await axios.get(
            `${config.whatsapp.apiUrl}/instance/connectionState/${config.whatsapp.instance}`,
            { headers: { apikey: config.whatsapp.apiKey }, timeout: 8000 }
        );
        res.json({ success: true, data: response.data });
    } catch {
        res.json({ success: true, data: { state: 'disconnected' } });
    }
}

// ============================================================
// Bot Management Endpoints
// ============================================================

/** PATCH /api/leads/:id/bot — toggle bot on/off for a specific lead */
export async function toggleLeadBot(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const { active } = req.body as { active: boolean };

    try {
        await db('leads').where('id', id).update({
            bot_active: active ? 1 : 0,
            bot_stage: active ? 'reception' : db.raw('bot_stage'),
            updated_at: new Date(),
        });
        res.json({ success: true, bot_active: active });
    } catch (err) {
        const error = err as { message?: string };
        res.status(500).json({ success: false, error: error.message });
    }
}

/** GET /api/bot/memory — list all bot memory patterns */
export async function getBotMemory(req: Request, res: Response): Promise<void> {
    const { category, limit = '50' } = req.query as { category?: string; limit?: string };

    try {
        let query = db('bot_memory').where('is_active', 1);
        if (category) query = query.where('category', category);

        const patterns = await query
            .orderBy('usage_count', 'desc')
            .orderBy('confidence_score', 'desc')
            .limit(parseInt(limit, 10));

        const total = await db('bot_memory').where('is_active', 1).count('id as count').first();

        res.json({
            success: true,
            data: patterns,
            total: parseInt(String((total as { count: string }).count || '0'), 10),
        });
    } catch (err) {
        const error = err as { message?: string };
        res.status(500).json({ success: false, error: error.message });
    }
}

/** POST /api/bot/memory — manually add a memory pattern */
export async function addBotMemory(req: Request, res: Response): Promise<void> {
    const { category, trigger_pattern, successful_response, legal_area } = req.body as {
        category: string;
        trigger_pattern: string;
        successful_response?: string;
        legal_area?: string;
    };

    if (!category || !trigger_pattern) {
        res.status(400).json({ success: false, error: 'category e trigger_pattern são obrigatórios' });
        return;
    }

    try {
        const [id] = await db('bot_memory').insert({
            category,
            trigger_pattern,
            successful_response: successful_response || null,
            legal_area: legal_area || null,
            usage_count: 1,
            confidence_score: 75, // Manual entries start with higher confidence
            is_active: 1,
        });
        res.json({ success: true, id });
    } catch (err) {
        const error = err as { message?: string };
        res.status(500).json({ success: false, error: error.message });
    }
}

/** DELETE /api/bot/memory/:id — disable a memory pattern */
export async function deleteBotMemory(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    try {
        await db('bot_memory').where('id', id).update({ is_active: 0 });
        res.json({ success: true, message: 'Padrão desativado' });
    } catch (err) {
        const error = err as { message?: string };
        res.status(500).json({ success: false, error: error.message });
    }
}

/** GET /api/bot/handoffs — list pending handoffs for assessors */
export async function getHandoffs(req: Request, res: Response): Promise<void> {
    const { unacknowledged } = req.query;

    try {
        let query = db('bot_handoffs')
            .leftJoin('leads', 'bot_handoffs.lead_id', 'leads.id')
            .select(
                'bot_handoffs.*',
                'leads.name as lead_name',
                'leads.phone',
                'leads.cpf',
                'leads.funnel_id'
            )
            .orderBy('bot_handoffs.notified_at', 'desc');

        if (unacknowledged === 'true') {
            query = query.whereNull('bot_handoffs.acknowledged_at');
        }

        const handoffs = await query.limit(50);
        res.json({ success: true, data: handoffs });
    } catch (err) {
        const error = err as { message?: string };
        res.status(500).json({ success: false, error: error.message });
    }
}

/** PATCH /api/bot/handoffs/:id/acknowledge — mark handoff as seen */
export async function acknowledgeHandoff(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const userId = (req as Request & { user?: { id: number } }).user?.id;

    try {
        await db('bot_handoffs').where('id', id).update({
            acknowledged_by: userId || null,
            acknowledged_at: new Date(),
        });
        res.json({ success: true });
    } catch (err) {
        const error = err as { message?: string };
        res.status(500).json({ success: false, error: error.message });
    }
}

/** POST /api/webhook/whatsapp/test — send a test WhatsApp message */
export async function sendTestMessage(req: Request, res: Response): Promise<void> {
    const { phone, message } = req.body as { phone: string; message?: string };

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
        await sendWhatsAppMessage(
            cleanPhone,
            message || '🤖 Teste de conexão do Legacy Bot — funcionando com sucesso!'
        );
        res.json({
            success: true,
            message: `Mensagem enviada para +${cleanPhone}`,
            phone: cleanPhone,
        });
    } catch (err) {
        const error = err as { message?: string };
        console.error('[WhatsApp] Test message error:', err);
        res.status(500).json({ success: false, error: error.message || 'Erro ao enviar mensagem de teste' });
    }
}

