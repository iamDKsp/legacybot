"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logActivity = logActivity;
const database_1 = require("../config/database");
async function logActivity(params) {
    try {
        await (0, database_1.db)('activity_log').insert({
            user_id: params.user_id || null,
            lead_id: params.lead_id || null,
            action: params.action,
            entity_type: params.entity_type || null,
            entity_id: params.entity_id || null,
            old_value: params.old_value ? JSON.stringify(params.old_value) : null,
            new_value: params.new_value ? JSON.stringify(params.new_value) : null,
            ip_address: params.ip_address || null,
        });
    }
    catch (err) {
        // Don't throw — activity logging should never break the main flow
        console.error('[ActivityLog] Error:', err);
    }
}
//# sourceMappingURL=activity.service.js.map