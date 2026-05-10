interface ActivityParams {
    user_id?: number;
    lead_id?: number;
    action: string;
    entity_type?: string;
    entity_id?: number;
    old_value?: unknown;
    new_value?: unknown;
    ip_address?: string;
}
export declare function logActivity(params: ActivityParams): Promise<void>;
export {};
//# sourceMappingURL=activity.service.d.ts.map