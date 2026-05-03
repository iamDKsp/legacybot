/**
 * learning.service.ts
 * Autonomous learning engine for the Legacy Assessoria bot.
 *
 * Responsibilities:
 *  - Extract patterns from successful conversations (async, non-blocking)
 *  - Classify objections and case-type signals from message history
 *  - Maintain memory quality (cleanup stale/low-confidence patterns)
 *  - Provide management API support (list, toggle, manual insert)
 */

import { db } from '../config/database';
import { config } from '../config/env';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(config.googleAi.apiKey);

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface BotMemoryRow {
    id: number;
    category: string;
    trigger_pattern: string;
    successful_response: string | null;
    legal_area: string | null;
    lead_converted: number;
    usage_count: number;
    confidence_score: number;
    is_active: number;
    last_used_at: string;
    created_at: string;
}

export interface LearningSummary {
    totalPatterns: number;
    activePatterns: number;
    topCategories: Record<string, number>;
    recentlyLearned: number;
}

// ─────────────────────────────────────────────────────────────
// Detect legal area from message keywords
// Returns one of the 4 areas or null
// ─────────────────────────────────────────────────────────────
export function detectLegalArea(text: string): string | null {
    const lower = text.toLowerCase();

    // Trabalhista — labor law (checked first — widest real-world case)
    if (/demitido|demiss[aã]o|mandado embora|aviso pr[eé]vio|horas extras|fgts|ass[eé]dio\s*(moral|no trabalho|sexual|no emprego)?|carteira (assinada|de trabalho)|rescis[aã]o|f[eé]rias (n[aã]o|atrasad)|sal[aá]rio atrasado|sem registro|trabalhista|causa trabalhista|direito trabalhista|meu empregador|minha empresa|patr[aã]o|encerraram|demitida|fui dispensad|hora extra|trabalh(ava|ei|o) (nessa|nessa empresa|l[aá]|no local)/.test(lower))
        return 'trabalhista';

    // Consumidor / Negativado — debt, credit bureau
    if (/copasa|cemig|saneamento|cobran[cç]a indevida|negativado|serasa|spc|faculdade|curso|produto com defeito|nome sujo|d[ií]vida indevida|nome negativado|inscri[cç][aã]o indevida/.test(lower))
        return 'consumidor';

    // Golpe Cibernético — hacking, account invasion
    if (/hackeado|hackearam|hackeada|conta invadida|clonaram|dados roubados|phishing|fraude online|email hackeado|conta hack|minha conta foi invadida|acesso indevido|vazamento de dados|vírus|invasão|sequestro de conta/.test(lower))
        return 'cibernetico';

    // Golpe do Pix / Fraude Financeira — checked last, only if no labor context
    if (/\bpix\b|golpe do pix|golpe banc[aá]rio|ca[ií] num golpe|me enganaram|fui enganado|estelionato|transfer[eê]ncia fraudulenta|boleto falso|falso vendedor|falso leil[aã]o|recebi uma liga[cç][aã]o falsa|dep[oó]sito errado|mandei dinheiro|perdi dinheiro|dinheiro sumiu|transfer[eê]ncia pix|sofri um golpe|aplicaram um golpe/.test(lower))
        return 'pix';

    return null;
}


// ─────────────────────────────────────────────────────────────
// Detect if a message contains an objection pattern
// ─────────────────────────────────────────────────────────────
export function detectObjection(text: string): boolean {
    const lower = text.toLowerCase();
    return /golpe|piramide|desconfio|não confio|tenho medo|será que|é mentira|não acredito|cuidado|suspeito/.test(lower);
}

// ─────────────────────────────────────────────────────────────
// Detect if a message is a payment question
// ─────────────────────────────────────────────────────────────
export function detectPaymentQuestion(text: string): boolean {
    const lower = text.toLowerCase();
    return /quanto custa|quanto vou pagar|tem taxa|cobra quanto|valor|honorário|é de graça|gratuito/.test(lower);
}

// ─────────────────────────────────────────────────────────────
// Detect if a message is a timeline question
// ─────────────────────────────────────────────────────────────
export function detectTimelineQuestion(text: string): boolean {
    const lower = text.toLowerCase();
    return /quanto tempo|quando fica pronto|prazo|demora quanto|quando sai|quando termina/.test(lower);
}

// ─────────────────────────────────────────────────────────────
// Detect emotional state of the client's message
// Used to inject emotional context into the AI prompt
// ─────────────────────────────────────────────────────────────
export type EmotionalState = 'anxious' | 'angry' | 'hopeful' | 'neutral';

export function detectEmotionalState(text: string): EmotionalState {
    const lower = text.toLowerCase();
    if (/nervoso|desesperado|urgente|preciso urgente|estou mal|socorro|desespero|não sei o que fazer|por favor me ajud/.test(lower)) return 'anxious';
    if (/absurdo|revoltante|indignado|não aguento|ódio|palhaçada|ridículo|raiva|lixo|processem|vergonha/.test(lower)) return 'angry';
    if (/obrigado|grato|que bom|aliviado|fico feliz|maravilha|muito bom|perfeito|excelente|top/.test(lower)) return 'hopeful';
    return 'neutral';
}

// ─────────────────────────────────────────────────────────────
// Extract CPF from text (Brazilian CPF format)
// ─────────────────────────────────────────────────────────────
export function extractCPF(text: string): string | null {
    const match = text.match(/\b(\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[.\s-]?\d{2})\b/);
    if (match) {
        return match[1].replace(/[.\s-]/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return null;
}

// ─────────────────────────────────────────────────────────────
// Extract a proper name from text (heuristic: 2+ capitalized words)
// ─────────────────────────────────────────────────────────────
export function extractName(text: string): string | null {
    // Remove CPF if present
    const cleaned = text.replace(/\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[.\s-]?\d{2}/g, '').trim();
    if (cleaned.length < 3 || cleaned.length > 40) return null;

    // Look for name-like patterns (2-4 words, mostly letters/accents)
    // Ignore small isolated punctuation or random numbers
    const words = cleaned.split(/\s+/).filter((w) => /^[a-zA-ZÀ-ÿ]{2,}$/.test(w));

    if (words.length >= 2 && words.length <= 5) {
        // Capitalize properly (e.g., 'lucas andre' -> 'Lucas Andre')
        return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
    return null;
}

// ─────────────────────────────────────────────────────────────
// Run post-conversation learning (async, fire-and-forget)
// Called after a successful lead conversion (CPF given or docs sent)
// ─────────────────────────────────────────────────────────────
export async function runPostConversationLearning(leadId: number): Promise<void> {
    if (!config.googleAi.apiKey) return;

    try {
        const messages = await db('messages')
            .where('lead_id', leadId)
            .orderBy('sent_at', 'asc')
            .select('content', 'direction', 'sender');

        if (messages.length < 4) return;

        const conversation = (messages as { content: string; direction: string; sender: string }[])
            .map((m) => `${m.direction === 'inbound' ? 'Cliente' : 'Bot'}: ${m.content.slice(0, 120)}`)
            .join('\n');

        const model = genAI.getGenerativeModel({ model: config.googleAi.model });

        const prompt = `Analise esta conversa de bot jurídico e extraia padrões de aprendizado em JSON.
Retorne um array de até 3 objetos com este formato exato:
[{"category": "objection|question|success_pattern|case_type_signal", "trigger": "texto que ativou", "response": "resposta que funcionou ou null", "area": "trabalhista|consumidor|cibernetico|pix|null", "converted": true|false}]

Conversa:
${conversation}

Responda apenas o JSON, sem explicações.`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return;

        const patterns = JSON.parse(jsonMatch[0]) as Array<{
            category: string;
            trigger: string;
            response: string | null;
            area: string | null;
            converted: boolean;
        }>;

        for (const p of patterns) {
            if (!p.trigger || !p.category) continue;

            const existing = await db('bot_memory')
                .whereRaw('LOWER(trigger_pattern) LIKE ?', [`%${p.trigger.slice(0, 40).toLowerCase()}%`])
                .first();

            if (existing) {
                await db('bot_memory')
                    .where('id', (existing as { id: number }).id)
                    .increment('usage_count', 1)
                    .update({
                        confidence_score: Math.min(
                            100,
                            (existing as { confidence_score: number }).confidence_score + (p.converted ? 5 : 1)
                        ),
                        lead_converted: p.converted ? 1 : (existing as { lead_converted: number }).lead_converted,
                    });
            } else {
                await db('bot_memory').insert({
                    category: p.category,
                    trigger_pattern: p.trigger.slice(0, 200),
                    successful_response: p.response?.slice(0, 500) || null,
                    legal_area: p.area || null,
                    lead_converted: p.converted ? 1 : 0,
                    usage_count: 1,
                    confidence_score: p.converted ? 65 : 45,
                    is_active: 1,
                });
            }
        }

        console.log(`[Learning] Processed ${patterns.length} patterns for lead ${leadId}`);
    } catch (err) {
        console.warn('[Learning] Post-conversation learning failed (non-critical):', err);
    }
}

// ─────────────────────────────────────────────────────────────
// Weekly cleanup: remove low-confidence stale patterns
// Call from a cron or startup job
// ─────────────────────────────────────────────────────────────
export async function cleanupStaleMemories(): Promise<number> {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const count = await db('bot_memory')
            .where('usage_count', '<', 2)
            .where('confidence_score', '<', 40)
            .where('created_at', '<', thirtyDaysAgo)
            .delete();

        console.log(`[Learning] Cleaned up ${count} stale memory patterns`);
        return count;
    } catch {
        return 0;
    }
}

// ─────────────────────────────────────────────────────────────
// Get top patterns for the bot management dashboard
// ─────────────────────────────────────────────────────────────
export async function getTopPatterns(
    category?: string,
    limit = 20
): Promise<BotMemoryRow[]> {
    let query = db('bot_memory').where('is_active', 1);
    if (category) query = query.where('category', category);
    return query.orderBy('usage_count', 'desc').orderBy('confidence_score', 'desc').limit(limit);
}

// ─────────────────────────────────────────────────────────────
// Get summary stats for the learning dashboard
// ─────────────────────────────────────────────────────────────
export async function getLearningSummary(): Promise<LearningSummary> {
    const [total, active] = await Promise.all([
        db('bot_memory').count('id as count').first(),
        db('bot_memory').where('is_active', 1).count('id as count').first(),
    ]);

    const byCategory = await db('bot_memory')
        .where('is_active', 1)
        .groupBy('category')
        .select('category')
        .count('id as count');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recent = await db('bot_memory')
        .where('created_at', '>=', sevenDaysAgo)
        .count('id as count')
        .first();

    const topCategories: Record<string, number> = {};
    (byCategory as Array<{ category: string; count: string }>).forEach((row) => {
        topCategories[row.category] = parseInt(row.count, 10);
    });

    return {
        totalPatterns: parseInt(String((total as { count: string }).count || '0'), 10),
        activePatterns: parseInt(String((active as { count: string }).count || '0'), 10),
        topCategories,
        recentlyLearned: parseInt(String((recent as { count: string } | undefined)?.count || '0'), 10),
    };
}
