const fs = require('fs');
const path = 'backend/src/controllers/webhook.controller.ts';

let content = fs.readFileSync(path, 'utf8');

// DEBOUNCE_MS
content = content.replace(/const DEBOUNCE_MS = 10_000;/g, 'const DEBOUNCE_MS = 30_000;');

// 1. adReply
content = content.replace(
`                await db('messages').insert({ conversation_id: conversation.id, lead_id: lead.id, content: adReply, direction: 'outbound', sender: 'bot' });
                const wssAd = getWebSocketServer();
                if (wssAd) wssAd.emit('bot_response', { lead_id: lead.id, message: adReply });
                const targetPhoneAd = String(lead.whatsapp_id || phone);
                await aiService.sendFragmentedMessage(targetPhoneAd, adReply);`,
`                const targetPhoneAd = String(lead.whatsapp_id || phone);
                await aiService.sendFragmentedMessage(targetPhoneAd, adReply, undefined, async (fragment) => {
                    await db('messages').insert({ conversation_id: conversation.id, lead_id: lead.id, content: fragment, direction: 'outbound', sender: 'bot' });
                    const wssAd = getWebSocketServer();
                    if (wssAd) wssAd.emit('bot_response', { lead_id: lead.id, message: fragment });
                });`
);

// 2. processDocumentImage - !isLegible
content = content.replace(
`            await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: replyMsg, direction: 'outbound', sender: 'bot' });
            await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: isTechnicalError ? \`[Análise de mídia] ⚠️ Erro técnico — \${analysis.issues}\` : \`[Análise de mídia] ❌ Documento rejeitado — \${docType} | Motivo: \${analysis.issues}\` });

            const wss = getWebSocketServer();
            if (wss) wss.emit('bot_response', { lead_id: leadId, message: replyMsg });
            if (canSendOutbound(phone)) {
                await aiService.sendFragmentedMessage(targetPhone, replyMsg);
            }`,
`            await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: isTechnicalError ? \`[Análise de mídia] ⚠️ Erro técnico — \${analysis.issues}\` : \`[Análise de mídia] ❌ Documento rejeitado — \${docType} | Motivo: \${analysis.issues}\` });

            if (canSendOutbound(phone)) {
                await aiService.sendFragmentedMessage(targetPhone, replyMsg, undefined, async (fragment) => {
                    await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: fragment, direction: 'outbound', sender: 'bot' });
                    const wss = getWebSocketServer();
                    if (wss) wss.emit('bot_response', { lead_id: leadId, message: fragment });
                });
            }`
);

// 3. processDocumentImage - incomplete front
content = content.replace(
`                    await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: retryMsg, direction: 'outbound', sender: 'bot' });
                    await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: \`[Análise de mídia] ⚠️ \${docType} frente legível mas incompleto | \${missingDesc}\` });
                    const wssR = getWebSocketServer();
                    if (wssR) wssR.emit('bot_response', { lead_id: leadId, message: retryMsg });
                    if (canSendOutbound(targetPhone)) await aiService.sendFragmentedMessage(targetPhone, retryMsg);`,
`                    await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: \`[Análise de mídia] ⚠️ \${docType} frente legível mas incompleto | \${missingDesc}\` });
                    if (canSendOutbound(targetPhone)) {
                        await aiService.sendFragmentedMessage(targetPhone, retryMsg, undefined, async (fragment) => {
                            await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: fragment, direction: 'outbound', sender: 'bot' });
                            const wssR = getWebSocketServer();
                            if (wssR) wssR.emit('bot_response', { lead_id: leadId, message: fragment });
                        });
                    }`
);

// 4. processDocumentImage - ask back
content = content.replace(
`                const askBackMsg = \`Perfeito, \${docType} frente validado! ✅\\n\\nAgora me manda uma foto do VERSO do mesmo documento, por favor.\`;
                await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: askBackMsg, direction: 'outbound', sender: 'bot' });
                const wss = getWebSocketServer();
                if (wss) wss.emit('bot_response', { lead_id: leadId, message: askBackMsg });
                if (wss) wss.emit('new_message', { lead_id: leadId, lead_name: lead.name, message: \`[\${docType} frente validado]\`, conversation_id: conversationId });
                await aiService.sendFragmentedMessage(targetPhone, askBackMsg);`,
`                const askBackMsg = \`Perfeito, \${docType} frente validado! ✅\\n\\nAgora me manda uma foto do VERSO do mesmo documento, por favor.\`;
                const wss = getWebSocketServer();
                if (wss) wss.emit('new_message', { lead_id: leadId, lead_name: lead.name, message: \`[\${docType} frente validado]\`, conversation_id: conversationId });
                
                await aiService.sendFragmentedMessage(targetPhone, askBackMsg, undefined, async (fragment) => {
                    await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: fragment, direction: 'outbound', sender: 'bot' });
                    if (wss) wss.emit('bot_response', { lead_id: leadId, message: fragment });
                });`
);

// 5. processDocumentImage - doc saved
content = content.replace(
`            await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: replyMsg, direction: 'outbound', sender: 'bot' });
            const wss = getWebSocketServer();
            if (wss) wss.emit('bot_response', { lead_id: leadId, message: replyMsg });
            if (wss) wss.emit('new_message', { lead_id: leadId, lead_name: lead.name, message: \`[Imagem — \${docSavedName}]\`, conversation_id: conversationId });
            await aiService.sendFragmentedMessage(targetPhone, replyMsg);`,
`            const wss = getWebSocketServer();
            if (wss) wss.emit('new_message', { lead_id: leadId, lead_name: lead.name, message: \`[Imagem — \${docSavedName}]\`, conversation_id: conversationId });
            
            await aiService.sendFragmentedMessage(targetPhone, replyMsg, undefined, async (fragment) => {
                await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: fragment, direction: 'outbound', sender: 'bot' });
                if (wss) wss.emit('bot_response', { lead_id: leadId, message: fragment });
            });`
);



// Part B: Update sendFragmentedMessage
content = content.replace(
`        await aiService.sendFragmentedMessage(targetPhone, botReply, signal);`,
`        await aiService.sendFragmentedMessage(targetPhone, botReply, signal, async (fragment) => {
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
        });`
);

fs.writeFileSync(path, content, 'utf8');
console.log('Replacements completed successfully');
