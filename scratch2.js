const fs = require('fs');

const file = 'backend/src/controllers/webhook.controller.ts';
let code = fs.readFileSync(file, 'utf8');

// DEBOUNCE_MS
code = code.replace(/const DEBOUNCE_MS = 10_000;/g, 'const DEBOUNCE_MS = 30_000;');

// 1. adReply
code = code.replace(
    /await db\('messages'\)\.insert\(\{ conversation_id: conversation\.id, lead_id: lead\.id, content: adReply, direction: 'outbound', sender: 'bot' \}\);\s*const wssAd = getWebSocketServer\(\);\s*if \(wssAd\) wssAd\.emit\('bot_response', \{ lead_id: lead\.id, message: adReply \}\);\s*const targetPhoneAd = String\(lead\.whatsapp_id \|\| phone\);\s*await aiService\.sendFragmentedMessage\(targetPhoneAd, adReply\);/g,
    `const targetPhoneAd = String(lead.whatsapp_id || phone);
                await aiService.sendFragmentedMessage(targetPhoneAd, adReply, undefined, async (fragment) => {
                    await db('messages').insert({ conversation_id: conversation.id, lead_id: lead.id, content: fragment, direction: 'outbound', sender: 'bot' });
                    const wssAd = getWebSocketServer();
                    if (wssAd) wssAd.emit('bot_response', { lead_id: lead.id, message: fragment });
                });`
);

// 2. replyMsg (isLegible == false)
code = code.replace(
    /await db\('messages'\)\.insert\(\{ conversation_id: conversationId, lead_id: leadId, content: replyMsg, direction: 'outbound', sender: 'bot' \}\);\s*await db\('notes'\)\.insert\(\{ lead_id: leadId, author_type: 'bot', content: isTechnicalError \? `\[Análise de mídia\] ⚠️ Erro técnico — \$\{analysis\.issues\}` : `\[Análise de mídia\] ❌ Documento rejeitado — \$\{docType\} \| Motivo: \$\{analysis\.issues\}` \}\);\s*const wss = getWebSocketServer\(\);\s*if \(wss\) wss\.emit\('bot_response', \{ lead_id: leadId, message: replyMsg \}\);\s*if \(canSendOutbound\(phone\)\) \{\s*await aiService\.sendFragmentedMessage\(targetPhone, replyMsg\);\s*\}/g,
    `await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: isTechnicalError ? \`[Análise de mídia] ⚠️ Erro técnico — \${analysis.issues}\` : \`[Análise de mídia] ❌ Documento rejeitado — \${docType} | Motivo: \${analysis.issues}\` });

            if (canSendOutbound(phone)) {
                await aiService.sendFragmentedMessage(targetPhone, replyMsg, undefined, async (fragment) => {
                    await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: fragment, direction: 'outbound', sender: 'bot' });
                    const wss = getWebSocketServer();
                    if (wss) wss.emit('bot_response', { lead_id: leadId, message: fragment });
                });
            }`
);

// 3. retryMsg (incomplete front)
code = code.replace(
    /await db\('messages'\)\.insert\(\{ conversation_id: conversationId, lead_id: leadId, content: retryMsg, direction: 'outbound', sender: 'bot' \}\);\s*await db\('notes'\)\.insert\(\{ lead_id: leadId, author_type: 'bot', content: `\[Análise de mídia\] ⚠️ \$\{docType\} frente legível mas incompleto \| \$\{missingDesc\}` \}\);\s*const wssR = getWebSocketServer\(\);\s*if \(wssR\) wssR\.emit\('bot_response', \{ lead_id: leadId, message: retryMsg \}\);\s*if \(canSendOutbound\(targetPhone\)\) await aiService\.sendFragmentedMessage\(targetPhone, retryMsg\);/g,
    `await db('notes').insert({ lead_id: leadId, author_type: 'bot', content: \`[Análise de mídia] ⚠️ \${docType} frente legível mas incompleto | \${missingDesc}\` });
                    if (canSendOutbound(targetPhone)) {
                        await aiService.sendFragmentedMessage(targetPhone, retryMsg, undefined, async (fragment) => {
                            await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: fragment, direction: 'outbound', sender: 'bot' });
                            const wssR = getWebSocketServer();
                            if (wssR) wssR.emit('bot_response', { lead_id: leadId, message: fragment });
                        });
                    }`
);

// 4. askBackMsg
code = code.replace(
    /await db\('messages'\)\.insert\(\{ conversation_id: conversationId, lead_id: leadId, content: askBackMsg, direction: 'outbound', sender: 'bot' \}\);\s*const wss = getWebSocketServer\(\);\s*if \(wss\) wss\.emit\('bot_response', \{ lead_id: leadId, message: askBackMsg \}\);\s*if \(wss\) wss\.emit\('new_message', \{ lead_id: leadId, lead_name: lead\.name, message: `\[\$\{docType\} frente validado\]`, conversation_id: conversationId \}\);\s*await aiService\.sendFragmentedMessage\(targetPhone, askBackMsg\);/g,
    `const wss = getWebSocketServer();
                if (wss) wss.emit('new_message', { lead_id: leadId, lead_name: lead.name, message: \`[\${docType} frente validado]\`, conversation_id: conversationId });
                
                await aiService.sendFragmentedMessage(targetPhone, askBackMsg, undefined, async (fragment) => {
                    await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: fragment, direction: 'outbound', sender: 'bot' });
                    if (wss) wss.emit('bot_response', { lead_id: leadId, message: fragment });
                });`
);

// 5. replyMsg (doc saved correctly)
code = code.replace(
    /await db\('messages'\)\.insert\(\{ conversation_id: conversationId, lead_id: leadId, content: replyMsg, direction: 'outbound', sender: 'bot' \}\);\s*const wss = getWebSocketServer\(\);\s*if \(wss\) wss\.emit\('bot_response', \{ lead_id: leadId, message: replyMsg \}\);\s*if \(wss\) wss\.emit\('new_message', \{ lead_id: leadId, lead_name: lead\.name, message: `\[Imagem — \$\{docSavedName\}\]`, conversation_id: conversationId \}\);\s*await aiService\.sendFragmentedMessage\(targetPhone, replyMsg\);/g,
    `const wss = getWebSocketServer();
            if (wss) wss.emit('new_message', { lead_id: leadId, lead_name: lead.name, message: \`[Imagem — \${docSavedName}]\`, conversation_id: conversationId });
            
            await aiService.sendFragmentedMessage(targetPhone, replyMsg, undefined, async (fragment) => {
                await db('messages').insert({ conversation_id: conversationId, lead_id: leadId, content: fragment, direction: 'outbound', sender: 'bot' });
                if (wss) wss.emit('bot_response', { lead_id: leadId, message: fragment });
            });`
);

// 6. botReply Part A (remove insert)
code = code.replace(
    /await db\('messages'\)\.insert\(\{\s*conversation_id: conversationId,\s*lead_id: lead\.id as number,\s*content: botReply,\s*direction: 'outbound',\s*sender: 'bot',\s*\}\);\s*const wss = getWebSocketServer\(\);\s*if \(wss\) \{\s*wss\.emit\('bot_response', \{ lead_id: lead\.id, message: botReply \}\);\s*\}/g,
    `// O banco de dados e o CRM serão notificados a cada fragmento enviado
        // pela função sendFragmentedMessage mais abaixo.`
);

// 6. botReply Part B (add callback)
code = code.replace(
    /await aiService\.sendFragmentedMessage\(targetPhone, botReply, signal\);/g,
    `await aiService.sendFragmentedMessage(targetPhone, botReply, signal, async (fragment) => {
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

fs.writeFileSync(file, code, 'utf8');
console.log('Regex replacements executed.');
