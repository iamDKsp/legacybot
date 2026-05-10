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
export declare function detectLegalArea(text: string): string | null;
export declare function detectObjection(text: string): boolean;
export declare function detectPaymentQuestion(text: string): boolean;
export declare function detectTimelineQuestion(text: string): boolean;
export type EmotionalState = 'anxious' | 'angry' | 'hopeful' | 'neutral';
export declare function detectEmotionalState(text: string): EmotionalState;
export declare function extractCPF(text: string): string | null;
export declare function extractName(text: string): string | null;
export declare function runPostConversationLearning(leadId: number): Promise<void>;
export declare function cleanupStaleMemories(): Promise<number>;
export declare function getTopPatterns(category?: string, limit?: number): Promise<BotMemoryRow[]>;
export declare function getLearningSummary(): Promise<LearningSummary>;
//# sourceMappingURL=learning.service.d.ts.map