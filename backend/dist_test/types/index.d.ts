export interface User {
    id: number;
    name: string;
    email: string;
    password_hash?: string;
    role: 'admin' | 'assessor';
    avatar_url?: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}
export interface Funnel {
    id: number;
    name: string;
    slug: string;
    color: string;
    description?: string;
    is_active: boolean;
    display_order: number;
}
export interface Stage {
    id: number;
    name: string;
    slug: string;
    display_order: number;
    color?: string;
}
export interface Lead {
    id: number;
    name: string;
    phone: string;
    email?: string;
    cpf?: string;
    origin: 'whatsapp' | 'manual' | 'instagram' | 'site';
    funnel_id: number;
    stage_id: number;
    assigned_to?: number;
    status: 'active' | 'approved' | 'rejected' | 'archived';
    description?: string;
    verdict_notes?: string;
    whatsapp_id?: string;
    bot_active: boolean;
    bot_session_id?: string;
    created_at: Date;
    updated_at: Date;
    funnel?: Funnel;
    stage?: Stage;
    assigned_user?: Partial<User>;
}
export interface Conversation {
    id: number;
    lead_id: number;
    whatsapp_chat_id: string;
    last_message_at: Date;
    unread_count: number;
    status: 'open' | 'in_progress' | 'resolved';
    created_at: Date;
    lead?: Lead;
}
export interface Message {
    id: number;
    conversation_id: number;
    lead_id: number;
    content: string;
    media_url?: string;
    media_type?: 'image' | 'video' | 'audio' | 'document';
    direction: 'inbound' | 'outbound';
    sender: 'lead' | 'bot' | 'assessor';
    sender_user_id?: number;
    whatsapp_message_id?: string;
    is_read: boolean;
    sent_at: Date;
}
export interface Task {
    id: number;
    lead_id: number;
    created_by: number;
    assigned_to?: number;
    title: string;
    description?: string;
    category: 'ligacao' | 'documento' | 'reuniao' | 'prazo' | 'outro';
    priority: 'alta' | 'media' | 'baixa';
    status: 'pendente' | 'em_andamento' | 'concluida';
    due_date?: Date;
    completed_at?: Date;
    created_at: Date;
    updated_at: Date;
    lead?: Partial<Lead>;
}
export interface Document {
    id: number;
    lead_id: number;
    uploaded_by?: number;
    name: string;
    file_type?: string;
    file_url?: string;
    file_size_kb?: number;
    status: 'pendente' | 'recebido' | 'aprovado' | 'rejeitado';
    notes?: string;
    created_at: Date;
}
export interface Note {
    id: number;
    lead_id: number;
    author_type: 'user' | 'bot';
    author_user_id?: number;
    content: string;
    created_at: Date;
    author?: Partial<User>;
}
export interface BotSession {
    id: number;
    lead_id: number;
    session_token: string;
    step: 'greeting' | 'identify_topic' | 'collect_info' | 'submit' | 'done';
    collected_data?: Record<string, unknown>;
    ai_context?: Record<string, unknown>;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}
export interface JwtPayload {
    userId: number;
    email: string;
    role: string;
}
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
    pagination?: Pagination;
}
export interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}
export interface DashboardStats {
    totalLeads: number;
    activeLeads: number;
    approvedLeads: number;
    rejectedLeads: number;
    pendingTasks: number;
    todayTasks: number;
    overdueTasks: number;
    newLeadsToday: number;
    newLeadsWeek: number;
}
export interface DashboardCharts {
    leadsByFunnel: {
        funnel: string;
        count: number;
        color: string;
    }[];
    leadsByStage: {
        stage: string;
        count: number;
    }[];
    tasksByStatus: {
        status: string;
        count: number;
    }[];
    leadsOverTime: {
        date: string;
        count: number;
    }[];
}
export interface CreateLeadBody {
    name: string;
    phone: string;
    email?: string;
    cpf?: string;
    origin?: Lead['origin'];
    funnel_id: number;
    stage_id?: number;
    description?: string;
}
export interface UpdateLeadStageBody {
    stage_id: number;
}
export interface UpdateLeadStatusBody {
    status: Lead['status'];
    verdict_notes?: string;
}
export interface CreateTaskBody {
    lead_id: number;
    title: string;
    description?: string;
    category?: Task['category'];
    priority?: Task['priority'];
    due_date?: string;
    assigned_to?: number;
}
export interface CreateNoteBody {
    content: string;
}
export interface LoginBody {
    email: string;
    password: string;
}
//# sourceMappingURL=index.d.ts.map