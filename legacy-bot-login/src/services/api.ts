import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

// ============================================================
// Axios instance configured for the Legacy CRM API
// ============================================================
const BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3001/api';

const api: AxiosInstance = axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
});

// ── Request interceptor: attach JWT token ──────────────────
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('legacy_token');
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// ── Response interceptor: handle 401 redirect ─────────────
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('legacy_token');
            localStorage.removeItem('legacy_user');
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

// ============================================================
// Auth API
// ============================================================
export const authApi = {
    login: (email: string, password: string) =>
        api.post<{ success: boolean; data: { token: string; user: User } }>('/auth/login', { email, password }),

    me: () =>
        api.get<{ success: boolean; data: User }>('/auth/me'),

    changePassword: (currentPassword: string, newPassword: string) =>
        api.put('/auth/change-password', { currentPassword, newPassword }),
};

// ============================================================
// Leads API
// ============================================================
export const leadsApi = {
    getAll: (params?: Record<string, unknown>) =>
        api.get<{ success: boolean; data: Lead[]; pagination: Pagination }>('/leads', { params }),

    getById: (id: number) =>
        api.get<{ success: boolean; data: Lead }>(`/leads/${id}`),

    create: (data: CreateLeadBody) =>
        api.post<{ success: boolean; data: Lead }>('/leads', data),

    update: (id: number, data: Partial<CreateLeadBody>) =>
        api.put<{ success: boolean; data: Lead }>(`/leads/${id}`, data),

    updateStage: (id: number, stage_id: number) =>
        api.patch(`/leads/${id}/stage`, { stage_id }),

    updateStatus: (id: number, status: string, verdict_notes?: string) =>
        api.patch(`/leads/${id}/status`, { status, verdict_notes }),

    toggleBot: (id: number) =>
        api.patch(`/leads/${id}/bot`),

    delete: (id: number) =>
        api.delete(`/leads/${id}`),

    getNotes: (id: number) =>
        api.get<{ success: boolean; data: Note[] }>(`/leads/${id}/notes`),

    createNote: (id: number, content: string) =>
        api.post<{ success: boolean; data: Note }>(`/leads/${id}/notes`, { content }),

    getDocuments: (id: number) =>
        api.get<{ success: boolean; data: Document[] }>(`/leads/${id}/documents`),

    createDocument: (id: number, data: Partial<Document>) =>
        api.post<{ success: boolean; data: Document }>(`/leads/${id}/documents`, data),

    getConversations: (id: number) =>
        api.get<{ success: boolean; data: Message[] }>(`/leads/${id}/conversations`),

    sendMessage: (id: number, content: string) =>
        api.post(`/leads/${id}/messages`, { content }),

    getFunnels: () =>
        api.get<{ success: boolean; data: Funnel[] }>('/leads/funnels'),

    getStages: (params?: Record<string, string>) =>
        api.get<{ success: boolean; data: Stage[] }>('/leads/stages', { params }),

    getChecklist: (id: number) =>
        api.get<{ success: boolean; data: Checklist }>(`/leads/${id}/checklist`),

};

// ============================================================
// Tasks API
// ============================================================
export const tasksApi = {
    getAll: (params?: Record<string, unknown>) =>
        api.get<{ success: boolean; data: Task[] }>('/tasks', { params }),

    create: (data: CreateTaskBody) =>
        api.post<{ success: boolean; data: Task }>('/tasks', data),

    update: (id: number, data: Partial<Task>) =>
        api.put<{ success: boolean; data: Task }>(`/tasks/${id}`, data),

    toggleStatus: (id: number) =>
        api.patch<{ success: boolean; data: { status: string } }>(`/tasks/${id}/toggle`),

    delete: (id: number) =>
        api.delete(`/tasks/${id}`),
};

// ============================================================
// Dashboard API
// ============================================================
export const dashboardApi = {
    getStats: () =>
        api.get<{ success: boolean; data: DashboardStats }>('/dashboard/stats'),

    getCharts: () =>
        api.get<{ success: boolean; data: DashboardCharts }>('/dashboard/charts'),
};

// ============================================================
// WhatsApp / Bot Setup API
// ============================================================
export const whatsappApi = {
    /** Trigger connection (returns QR code if not already connected) */
    connect: () =>
        api.post('/webhook/whatsapp/connect'),

    /** Get current connection status from Evolution API */
    getStatus: () =>
        api.get<{ success: boolean; data: { state: string; phone?: string; instance?: string } }>('/webhook/whatsapp/status'),

    /** Fetch the latest QR code base64 */
    getQR: () =>
        api.get('/webhook/whatsapp/qr'),

    /** Send a test WhatsApp message */
    sendTest: (phone: string, message: string) =>
        api.post('/webhook/whatsapp/test', { phone, message }),

    /** Disconnect / logout from WhatsApp and clear session */
    disconnect: () =>
        api.delete('/webhook/whatsapp/disconnect'),
};

// ============================================================
// Database Module API (Oracle-Core integration)
// ============================================================
export const databaseApi = {
    // Bot Prompts
    getPrompt: (funnel: string) =>
        api.get<{ success: boolean; data: { id: number; funnel_slug: string; content: string } }>(`/database/prompts/${funnel}`),

    savePrompt: (funnel: string, content: string) =>
        api.put<{ success: boolean; message: string }>(`/database/prompts/${funnel}`, { content }),

    // Knowledge Base
    getKnowledgeFiles: (funnel: string) =>
        api.get<{ success: boolean; data: KnowledgeFile[] }>(`/database/knowledge/${funnel}`),

    addKnowledgeFile: (funnel: string, original_name: string, file_size_kb?: number) =>
        api.post<{ success: boolean; data: KnowledgeFile }>(`/database/knowledge/${funnel}`, { original_name, file_size_kb }),

    uploadKnowledgeFile: (funnel: string, file: File, onProgress?: (pct: number) => void) =>
        new Promise<{ data: KnowledgeFile; chars_extracted: number }>((resolve, reject) => {
            const token = localStorage.getItem('legacy_token');
            const baseUrl = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3001/api';
            const formData = new FormData();
            formData.append('file', file);
            const xhr = new XMLHttpRequest();
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 95));
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    if (onProgress) onProgress(100);
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(JSON.parse(xhr.responseText)?.error || 'Upload failed'));
                }
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.open('POST', `${baseUrl}/database/knowledge/${funnel}`);
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.send(formData);
        }),

    deleteKnowledgeFile: (id: number) =>
        api.delete(`/database/knowledge/${id}`),

    // Collected Leads
    getCollectedLeads: (params?: { search?: string; funnel?: string }) =>
        api.get<{ success: boolean; data: CollectedLead[] }>('/database/leads', { params }),

    // Verified Documents
    getVerifiedDocuments: (params?: { search?: string }) =>
        api.get<{ success: boolean; data: VerifiedDoc[] }>('/database/verified-docs', { params }),
};

// ============================================================
// AI Config API (Humanization Settings)
// ============================================================
export const aiConfigApi = {
    /** Get all AI humanization settings + stats */
    getConfig: () =>
        api.get<{ success: boolean; data: { settings: Record<string, string>; stats: { activeMemoryPatterns: number; totalLeads: number; botActiveLeads: number } } }>('/ai-config'),

    /** Update one or more AI settings */
    updateConfig: (settings: Record<string, string>) =>
        api.put<{ success: boolean; updated: number }>('/ai-config', settings),
};

// ============================================================
// Users Management API (admin-only)
// ============================================================
export const usersApi = {
    getAll: () =>
        api.get<{ success: boolean; data: User[] }>('/users'),

    create: (data: { name: string; email: string; password: string; role: 'admin' | 'assessor' }) =>
        api.post<{ success: boolean; data: User }>('/users', data),

    update: (id: number, data: { name?: string; email?: string; password?: string; role?: 'admin' | 'assessor'; is_active?: boolean }) =>
        api.put<{ success: boolean; data: User }>(`/users/${id}`, data),

    delete: (id: number) =>
        api.delete<{ success: boolean; message: string }>(`/users/${id}`),
};

// ============================================================
// PHC API (Procuração + Decl. Hipossuficiência + Contrato)
// ============================================================
export const phcApi = {
    // Lawyers
    getLawyers: () =>
        api.get<{ success: boolean; data: Lawyer[] }>('/phc/lawyers'),

    createLawyer: (data: Partial<Lawyer>) =>
        api.post<{ success: boolean; data: Lawyer }>('/phc/lawyers', data),

    updateLawyer: (id: number, data: Partial<Lawyer>) =>
        api.put<{ success: boolean; data: Lawyer }>(`/phc/lawyers/${id}`, data),

    deleteLawyer: (id: number) =>
        api.delete<{ success: boolean; message: string }>(`/phc/lawyers/${id}`),

    // PHC Documents
    getDocuments: (params?: { lead_id?: number; funnel_slug?: string; status?: string }) =>
        api.get<{ success: boolean; data: PhcDocument[] }>('/phc/documents', { params }),

    getDocumentById: (id: number) =>
        api.get<{ success: boolean; data: PhcDocument }>(`/phc/documents/${id}`),

    createDocument: (data: { lead_id: number; lawyer_id: number; doc_type: PhcDocType; funnel_slug?: string; notes?: string }) =>
        api.post<{ success: boolean; data: PhcDocument }>('/phc/documents', data),

    updateStatus: (id: number, status: PhcStatus) =>
        api.patch<{ success: boolean; data: PhcDocument }>(`/phc/documents/${id}/status`, { status }),

    deleteDocument: (id: number) =>
        api.delete<{ success: boolean; message: string }>(`/phc/documents/${id}`),

    /** Download PDF — returns blob for client-side save */
    downloadPdf: (id: number) =>
        api.get(`/phc/documents/${id}/pdf`, { responseType: 'blob' }),
};


// ============================================================
// TypeScript Types (mirrors backend types)
// ============================================================
export interface User {
    id: number;
    name: string;
    email: string;
    role: 'admin' | 'assessor';
    avatar_url?: string;
}

export interface Funnel {
    id: number;
    name: string;
    slug: string;
    color: string;
    description?: string;
    lead_count?: number;
}

export interface Stage {
    id: number;
    name: string;
    slug: string;
    display_order: number;
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
    bot_active: boolean;
    created_at: string;
    updated_at: string;
    // Legal/juridical complement fields (filled by assessor or extracted by bot)
    address?: string;
    city?: string;
    state?: string;
    rg?: string;
    marital_status?: 'solteiro' | 'casado' | 'divorciado' | 'viuvo' | 'outro';
    nationality?: string;
    birthdate?: string;
    // Joined fields from API
    funnel_name?: string;
    funnel_slug?: string;
    funnel_color?: string;
    stage_name?: string;
    stage_slug?: string;
    stage_order?: number;
    assigned_user_name?: string;
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
    due_date?: string;
    completed_at?: string;
    created_at: string;
    updated_at: string;
    // Joined
    lead_name?: string;
    lead_phone?: string;
    funnel_name?: string;
    funnel_color?: string;
}

export interface Note {
    id: number;
    lead_id: number;
    author_type: 'user' | 'bot';
    author_user_id?: number;
    content: string;
    created_at: string;
    author_name?: string;
}

export interface Document {
    id: number;
    lead_id: number;
    name: string;
    file_type?: string;
    file_url?: string;
    status: 'pendente' | 'recebido' | 'aprovado' | 'rejeitado';
    notes?: string;
    created_at: string;
}

export interface Message {
    id: number;
    conversation_id: number;
    lead_id: number;
    content: string;
    direction: 'inbound' | 'outbound';
    sender: 'lead' | 'bot' | 'assessor';
    sent_at: string;
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
    leadsByFunnel: { funnel: string; count: number; color: string }[];
    leadsByStage: { stage: string; count: number }[];
    tasksByStatus: { status: string; count: number }[];
    leadsOverTime: { date: string; count: number }[];
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

export interface CreateTaskBody {
    lead_id: number;
    title: string;
    description?: string;
    category?: Task['category'];
    priority?: Task['priority'];
    due_date?: string;
    assigned_to?: number;
}

// Oracle-Core database module types
export interface KnowledgeFile {
    id: number;
    funnel_slug: string;
    original_name: string;
    file_size_kb?: number;
    file_type?: string;
    extracted_text?: string;
    created_at: string;
}

export interface CollectedLead {
    id: number;
    name: string;
    phone: string;
    email?: string;
    cpf?: string;
    status: string;
    origin: string;
    bot_stage: string;
    bot_active: boolean;
    created_at: string;
    updated_at: string;
    funnel_name?: string;
    funnel_slug?: string;
    stage_name?: string;
    message_count: number;
}

export interface VerifiedDoc {
    id: number;
    lead_id: number;
    lead_name: string;
    lead_phone: string;
    doc_type: string;
    description: string;
    verified_at: string;
    file_url?: string | null;
    file_type?: string;
    funnel_name?: string;
    funnel_slug?: string;
    funnel_color?: string;
}

export interface ChecklistItem {
    name: string;
    received: boolean;
}

export interface Checklist {
    funnelSlug: string;
    items: ChecklistItem[];
    receivedCount: number;
    totalCount: number;
    complete: boolean;
}

export type PhcDocType = 'procuracao' | 'declaracao_hipo' | 'contrato';
export type PhcStatus = 'rascunho' | 'salvo' | 'baixado';

export interface Lawyer {
    id: number;
    name: string;
    oab: string;
    cpf?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    additional_info?: string;
    created_at: string;
    updated_at?: string;
}

export interface PhcDocument {
    id: number;
    lead_id: number;
    lawyer_id: number;
    doc_type: PhcDocType;
    funnel_slug?: string;
    status: PhcStatus;
    notes?: string;
    file_path?: string;
    created_at: string;
    updated_at?: string;
    // Joined lead fields
    lead_name?: string;
    lead_phone?: string;
    lead_cpf?: string;
    lead_email?: string;
    lead_description?: string;
    lead_address?: string;
    lead_city?: string;
    lead_state?: string;
    lead_rg?: string;
    lead_marital_status?: string;
    lead_nationality?: string;
    lead_funnel_slug?: string;
    funnel_name?: string;
    // Joined lawyer fields
    lawyer_name?: string;
    lawyer_oab?: string;
    lawyer_cpf?: string;
    lawyer_email?: string;
    lawyer_phone?: string;
    lawyer_address?: string;
    lawyer_city?: string;
    lawyer_state?: string;
    lawyer_additional_info?: string;
}


export default api;
