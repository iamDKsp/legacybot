import { Request, Response } from 'express';
import { db } from '../config/database';

/**
 * AI Configuration Controller
 * Manages humanization settings for the Legacy Bot (Sofia).
 * Settings are stored in the `bot_settings` table (key/value).
 */

// Default humanization settings
const DEFAULT_SETTINGS: Record<string, string> = {
    'sofia_enabled': 'true',
    'sofia_name': 'Sofia',
    'sofia_age': '28',
    'sofia_description': 'Formada em Direito, apaixonada por ajudar pessoas em situações difíceis',
    'typing_delay_enabled': 'true',
    'typing_delay_min_ms': '1500',
    'typing_delay_max_ms': '8000',
    'typing_delay_per_char_ms': '30',
    'typing_presence_enabled': 'true',
    'anti_repetition_enabled': 'true',
    'emotional_detection_enabled': 'true',
    'business_hours_enabled': 'true',
    'business_hours_start': '8',
    'business_hours_end': '21',
    'anti_anxiety_message_enabled': 'true',
    'emoji_max_per_message': '1',
    'max_lines_per_message': '4',
    'human_imperfection_enabled': 'true',
    'client_name_enabled': 'true',
};

// Ensure the bot_settings table exists
async function ensureSettingsTable(): Promise<void> {
    const exists = await db.schema.hasTable('bot_settings');
    if (!exists) {
        await db.schema.createTable('bot_settings', (table) => {
            table.string('key', 100).primary();
            table.text('value').notNullable();
            table.timestamp('updated_at').defaultTo(db.fn.now());
        });
        console.log('[AI Config] Created bot_settings table');
    }
}

// GET /api/ai-config — Return all AI humanization settings
export async function getAIConfig(_req: Request, res: Response): Promise<void> {
    try {
        await ensureSettingsTable();

        const rows = await db('bot_settings').select('key', 'value');
        const settings: Record<string, string> = { ...DEFAULT_SETTINGS };

        for (const row of rows as Array<{ key: string; value: string }>) {
            settings[row.key] = row.value;
        }

        // Also fetch learning stats for the dashboard
        const memoryCount = await db('bot_memory')
            .where('is_active', 1)
            .count('id as count')
            .first();

        const totalLeads = await db('leads')
            .count('id as count')
            .first();

        const botActiveLeads = await db('leads')
            .where('bot_active', 1)
            .count('id as count')
            .first();

        res.json({
            success: true,
            data: {
                settings,
                stats: {
                    activeMemoryPatterns: parseInt(String((memoryCount as { count: string })?.count || '0'), 10),
                    totalLeads: parseInt(String((totalLeads as { count: string })?.count || '0'), 10),
                    botActiveLeads: parseInt(String((botActiveLeads as { count: string })?.count || '0'), 10),
                },
            },
        });
    } catch (err) {
        console.error('[AI Config] Get error:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar configurações da IA' });
    }
}

// PUT /api/ai-config — Update AI humanization settings
export async function updateAIConfig(req: Request, res: Response): Promise<void> {
    try {
        await ensureSettingsTable();

        const updates = req.body as Record<string, string>;
        if (!updates || typeof updates !== 'object') {
            res.status(400).json({ success: false, error: 'Body deve ser um objeto de configurações' });
            return;
        }

        // Only allow known keys
        const allowedKeys = Object.keys(DEFAULT_SETTINGS);
        const validUpdates = Object.entries(updates).filter(([key]) => allowedKeys.includes(key));

        for (const [key, value] of validUpdates) {
            const existing = await db('bot_settings').where('key', key).first();
            if (existing) {
                await db('bot_settings').where('key', key).update({
                    value: String(value),
                    updated_at: new Date(),
                });
            } else {
                await db('bot_settings').insert({
                    key,
                    value: String(value),
                    updated_at: new Date(),
                });
            }
        }

        console.log(`[AI Config] Updated ${validUpdates.length} settings`);
        res.json({ success: true, updated: validUpdates.length });
    } catch (err) {
        console.error('[AI Config] Update error:', err);
        res.status(500).json({ success: false, error: 'Erro ao atualizar configurações da IA' });
    }
}
