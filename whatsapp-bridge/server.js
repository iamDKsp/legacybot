/**
 * Legacy WhatsApp Bridge v3 — Fixed
 * - Stale instance guard removed (was blocking QR on reconnect)
 * - Proper teardown before reconnect
 * - /instance/qr/:name endpoint added
 * - /instance/delete/:name endpoint added
 * - Reconnection now clears instance map before retrying
 * - Auto-start: reconnects saved sessions on boot (no QR needed if already paired)
 * - Image download: injects imageBase64 in webhook payload for document validation
 */

const express = require('express');
const cors = require('cors');
const makeWASocket = require('@whiskeysockets/baileys').default;
const {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 8081;
const API_KEY = process.env.EVOLUTION_API_KEY || 'legacy-evolution-api-key-2026';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://backend:3001/api/webhook/whatsapp';
const SESSIONS_DIR = path.join(__dirname, 'sessions');

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const instances = {};
const clients = []; // SSE clients

// --- Utilities ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = () => Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000;

function sendToClients(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    clients.forEach(client => {
        try { client.res.write(payload); } catch (_) { /* ignore dead clients */ }
    });
}

// --- Auth Middleware ---
function authCheck(req, res, next) {
    const key = req.headers['apikey'] || req.headers['api-key'] || req.query.apikey;
    if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

// --- Teardown an in-memory instance (does NOT delete session files) ---
async function teardownInstance(instanceName) {
    const existing = instances[instanceName];
    if (existing?.sock) {
        try {
            existing.sock.ev.removeAllListeners();
            await existing.sock.end();
        } catch (_) { /* ignore, socket may already be dead */ }
    }
    delete instances[instanceName];
}

// --- Delete session files from disk ---
function deleteSessionFiles(instanceName) {
    const authDir = path.join(SESSIONS_DIR, instanceName);
    if (fs.existsSync(authDir)) {
        try {
            fs.rmSync(authDir, { recursive: true, force: true });
            console.log(`[${instanceName}] Session files deleted.`);
        } catch (err) {
            console.error(`[${instanceName}] Failed to delete session files:`, err.message);
        }
    }
}

// --- Baileys Connection Logic ---
async function connectInstance(instanceName, { clearSession = false } = {}) {
    await teardownInstance(instanceName);

    if (clearSession) {
        deleteSessionFiles(instanceName);
    }

    const authDir = path.join(SESSIONS_DIR, instanceName);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    let version;
    try {
        const result = await fetchLatestBaileysVersion();
        version = result.version;
    } catch (_) {
        version = [2, 3000, 1014080102]; // fallback version
    }

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'error' }),
        browser: ['Legacy CRM', 'Chrome', '1.0.0'],
        connectTimeoutMs: 60000,
        retryRequestDelayMs: 2000,
    });

    instances[instanceName] = {
        sock,
        state: 'connecting',
        qr: null,
        instanceName,
    };

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log(`[${instanceName}] QR Code generated, broadcasting to ${clients.length} SSE clients`);
            let qrBase64;
            try {
                qrBase64 = await QRCode.toDataURL(qr);
            } catch (err) {
                console.error(`[${instanceName}] QRCode.toDataURL error:`, err.message);
                return;
            }

            instances[instanceName].qr = qrBase64;
            instances[instanceName].state = 'qr';

            sendToClients({ event: 'qrcode.updated', instance: instanceName, qr: qrBase64 });

            axios.post(WEBHOOK_URL, {
                event: 'qrcode.updated',
                instance: instanceName,
                data: { qrcode: { base64: qrBase64 } },
            }).catch(() => { });
        }

        if (connection === 'open') {
            instances[instanceName].state = 'open';
            instances[instanceName].qr = null;
            console.log(`[${instanceName}] Connected to WhatsApp!`);

            sendToClients({ event: 'connection.update', instance: instanceName, state: 'open' });

            axios.post(WEBHOOK_URL, {
                event: 'connection.update',
                instance: instanceName,
                data: { state: 'open' },
            }).catch(() => { });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            const shouldReconnect = !isLoggedOut;

            console.log(`[${instanceName}] Connection closed. Code: ${statusCode}. Reconnect: ${shouldReconnect}`);

            sendToClients({ event: 'connection.update', instance: instanceName, state: 'close' });

            if (shouldReconnect) {
                console.log(`[${instanceName}] Reconnecting in 3s...`);
                delete instances[instanceName];
                await delay(3000);
                connectInstance(instanceName).catch(err =>
                    console.error(`[${instanceName}] Reconnect error:`, err.message)
                );
            } else {
                console.log(`[${instanceName}] Logged out. Cleaning up session files.`);
                deleteSessionFiles(instanceName);
                delete instances[instanceName];
                sendToClients({ event: 'connection.update', instance: instanceName, state: 'disconnected' });
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type === 'notify') {
            for (const msg of messages) {
                if (!msg.key.fromMe) {
                    // ── Create a CLEAN serializable copy of msg ──
                    // Baileys msg is a protobuf object with non-serializable
                    // properties that can cause axios to silently drop fields.
                    let cleanData;
                    try {
                        cleanData = JSON.parse(JSON.stringify(msg));
                    } catch (e) {
                        console.error(`[${instanceName}] Failed to serialize msg:`, e.message);
                        cleanData = { key: msg.key, message: msg.message, messageTimestamp: msg.messageTimestamp, pushName: msg.pushName };
                    }

                    const webhookPayload = {
                        event: 'messages.upsert',
                        instance: instanceName,
                        data: cleanData,
                    };

                    // ── Unwrap Baileys message wrappers for media detection ──
                    // WhatsApp can wrap messages in ephemeralMessage, viewOnceMessage, etc.
                    let innerMessage = msg.message || {};
                    const wrapperKeys = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage'];
                    for (const wk of wrapperKeys) {
                        if (innerMessage[wk]?.message) {
                            console.log(`[${instanceName}] Unwrapping ${wk}`);
                            innerMessage = innerMessage[wk].message;
                        }
                    }

                    // ── Detect media types from unwrapped message ──
                    const audioMsg = innerMessage.audioMessage || innerMessage.pttMessage || null;
                    const imageMsg = innerMessage.imageMessage || null;

                    // ── Audio: download and inject base64 ──
                    if (audioMsg) {
                        const audioMime = audioMsg.mimetype || 'audio/ogg';
                        const isPtt = !!innerMessage.pttMessage;
                        console.log(`[${instanceName}] Audio received | type: ${isPtt ? 'PTT' : 'audioMessage'} | mime: ${audioMime} | ${audioMsg.seconds || '?'}s`);
                        try {
                            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
                            const buffer = await downloadMediaMessage(
                                msg, 'buffer', {},
                                { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
                            );
                            if (buffer && buffer.length > 0) {
                                const base64 = buffer.toString('base64');
                                webhookPayload.data.audioBase64 = base64;
                                console.log(`[${instanceName}] Audio OK | ${Math.round(buffer.length / 1024)}KB | base64: ${base64.length} chars`);
                            } else {
                                console.warn(`[${instanceName}] Audio buffer empty`);
                            }
                        } catch (err) {
                            console.error(`[${instanceName}] Audio download FAILED:`, err.message);
                        }
                    }

                    // ── Image: download and inject base64 ──
                    if (imageMsg && !audioMsg) {
                        const imageMime = imageMsg.mimetype || 'image/jpeg';
                        console.log(`[${instanceName}] Image received | mime: ${imageMime}`);
                        try {
                            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
                            const buffer = await downloadMediaMessage(
                                msg, 'buffer', {},
                                { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
                            );
                            if (buffer && buffer.length > 0) {
                                const base64 = buffer.toString('base64');
                                webhookPayload.data.imageBase64 = base64;
                                console.log(`[${instanceName}] Image OK | ${Math.round(buffer.length / 1024)}KB | base64: ${base64.length} chars`);
                            } else {
                                console.warn(`[${instanceName}] Image buffer empty`);
                            }
                        } catch (err) {
                            console.error(`[${instanceName}] Image download FAILED:`, err.message);
                        }
                    }

                    // Log payload size to verify serialization
                    try {
                        const payloadStr = JSON.stringify(webhookPayload);
                        console.log(`[${instanceName}] Sending to backend | size: ${Math.round(payloadStr.length / 1024)}KB | hasAudio: ${!!webhookPayload.data.audioBase64} | hasImage: ${!!webhookPayload.data.imageBase64}`);
                    } catch (e) {
                        console.error(`[${instanceName}] ERROR: Payload NOT serializable:`, e.message);
                    }

                    axios.post(WEBHOOK_URL, webhookPayload).catch((err) => {
                        console.error(`[${instanceName}] Webhook POST failed:`, err.message);
                    });
                }
            }
        }
    });

    return instances[instanceName];
}

// =============================================================
// API Routes
// =============================================================

// 1. Real-time Events (SSE)
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const clientId = Date.now();
    clients.push({ id: clientId, res });
    console.log(`[SSE] Client connected. Total: ${clients.length}`);

    res.write(': ping\n\n');

    Object.values(instances).forEach(inst => {
        const initialData = {
            event: inst.qr ? 'qrcode.updated' : 'connection.update',
            instance: inst.instanceName,
            qr: inst.qr || undefined,
            state: inst.state,
        };
        try { res.write(`data: ${JSON.stringify(initialData)}\n\n`); } catch (_) { }
    });

    const heartbeat = setInterval(() => {
        try { res.write(': ping\n\n'); } catch (_) { clearInterval(heartbeat); }
    }, 25000);

    req.on('close', () => {
        clearInterval(heartbeat);
        const index = clients.findIndex(c => c.id === clientId);
        if (index !== -1) clients.splice(index, 1);
        console.log(`[SSE] Client disconnected. Total: ${clients.length}`);
    });
});

// 2. Instance Management
app.post('/instance/create', authCheck, async (req, res) => {
    const { instanceName } = req.body;
    if (!instanceName) return res.status(400).json({ error: 'instanceName required' });

    try {
        await connectInstance(instanceName);
        res.json({ success: true, message: 'Connecting...' });
    } catch (err) {
        console.error('[Bridge] connectInstance error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Delete instance + session (full reset)
app.delete('/instance/delete/:name', authCheck, async (req, res) => {
    const { name } = req.params;
    await teardownInstance(name);
    deleteSessionFiles(name);
    sendToClients({ event: 'connection.update', instance: name, state: 'disconnected' });
    res.json({ success: true, message: `Instance ${name} deleted and session cleared` });
});

// 4. Logout (graceful)
app.delete('/instance/logout/:name', authCheck, async (req, res) => {
    const instance = instances[req.params.name];
    if (instance?.sock) {
        try {
            instance.sock.ev.removeAllListeners();
            await instance.sock.logout();
        } catch (_) { /* ignore */ }
    }
    await teardownInstance(req.params.name);
    deleteSessionFiles(req.params.name);
    res.json({ success: true });
});

// 5. Connection state
app.get('/instance/connectionState/:name', authCheck, (req, res) => {
    const instance = instances[req.params.name];
    res.json({ state: instance?.state || 'disconnected' });
});

// 6. QR Code (poll endpoint)
app.get('/instance/qr/:name', authCheck, (req, res) => {
    const instance = instances[req.params.name];
    if (!instance || !instance.qr) {
        return res.status(404).json({ error: 'QR not available', state: instance?.state || 'disconnected' });
    }
    res.json({ qr: instance.qr, state: instance.state });
});

// 7. Send text message with anti-ban features
app.post('/message/sendText/:name', authCheck, async (req, res) => {
    const { name } = req.params;
    const { number, text } = req.body;
    const instance = instances[name];

    if (!instance || instance.state !== 'open') {
        return res.status(400).json({ error: 'Instance not connected' });
    }

    try {
        console.log(`[${name}] Sending text message to ${number}`);
        const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        await instance.sock.sendPresenceUpdate('composing', jid);
        await delay(randomDelay());
        await instance.sock.sendMessage(jid, { text });
        await instance.sock.sendPresenceUpdate('paused', jid);
        console.log(`[${name}] Message sent successfully to ${jid}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. Send image message (base64 or URL)
app.post('/message/sendImage/:name', authCheck, async (req, res) => {
    const { name } = req.params;
    const { number, imageBase64, imageUrl, caption, mimetype } = req.body;
    const instance = instances[name];

    if (!instance || instance.state !== 'open') {
        return res.status(400).json({ error: 'Instance not connected' });
    }

    if (!imageBase64 && !imageUrl) {
        return res.status(400).json({ error: 'imageBase64 or imageUrl required' });
    }

    try {
        const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        await instance.sock.sendPresenceUpdate('composing', jid);
        await delay(randomDelay());

        let messagePayload;
        if (imageBase64) {
            const mime = mimetype || 'image/jpeg';
            const buffer = Buffer.from(imageBase64, 'base64');
            messagePayload = { image: buffer, mimetype: mime, caption: caption || '' };
        } else {
            messagePayload = { image: { url: imageUrl }, caption: caption || '' };
        }

        await instance.sock.sendMessage(jid, messagePayload);
        await instance.sock.sendPresenceUpdate('paused', jid);
        console.log(`[${name}] Image sent to ${jid}`);
        res.json({ success: true });
    } catch (err) {
        console.error(`[${name}] Image send error:`, err.message);
        res.status(500).json({ error: err.message });
    }
});



// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        instances: Object.keys(instances).length,
        sseClients: clients.length,
        instanceStates: Object.fromEntries(
            Object.entries(instances).map(([k, v]) => [k, v.state])
        ),
    });
});

app.listen(PORT, () => {
    console.log(`Legacy Baileys Bridge v3 running on port ${PORT}`);

    // ============================================================
    // AUTO-START: reconnect all saved sessions on boot
    // Scans sessions/ dir — if creds.json exists, reconnects
    // silently (no QR needed). Only shows QR if session is new.
    // ============================================================
    setTimeout(async () => {
        try {
            const entries = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
            const savedInstances = entries
                .filter(e => e.isDirectory())
                .map(e => e.name);

            if (savedInstances.length === 0) {
                console.log('[Auto-Start] No saved sessions found. Connect via /instance/create.');
                return;
            }

            console.log(`[Auto-Start] Found ${savedInstances.length} saved session(s): ${savedInstances.join(', ')}`);

            for (const instanceName of savedInstances) {
                const credsPath = path.join(SESSIONS_DIR, instanceName, 'creds.json');
                if (fs.existsSync(credsPath)) {
                    console.log(`[Auto-Start] Reconnecting saved session: ${instanceName}`);
                    connectInstance(instanceName).catch(err =>
                        console.error(`[Auto-Start] Failed to connect ${instanceName}:`, err.message)
                    );
                    // Stagger multiple instances to avoid hitting WhatsApp rate limits
                    await delay(2000);
                } else {
                    console.log(`[Auto-Start] ${instanceName}: no creds.json — skipping (needs QR scan)`);
                }
            }
        } catch (err) {
            console.error('[Auto-Start] Error scanning sessions:', err.message);
        }
    }, 1500); // Short delay to let the HTTP server initialize first
});
