import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadsApi, Lead, CreateLeadBody } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

// ── Fetch all leads (with optional filters) ──────────────────
export function useLeads(params?: Record<string, unknown>) {
    return useQuery({
        queryKey: ['leads', params],
        queryFn: async () => {
            const response = await leadsApi.getAll(params);
            return response.data.data;
        },
        staleTime: 30_000,
    });
}

// ── Fetch a single lead ───────────────────────────────────────
export function useLead(id: number) {
    return useQuery({
        queryKey: ['lead', id],
        queryFn: async () => {
            const response = await leadsApi.getById(id);
            return response.data.data;
        },
        enabled: !!id,
        staleTime: 30_000,
    });
}

// ── Fetch funnels list ────────────────────────────────────────
export function useFunnels() {
    return useQuery({
        queryKey: ['funnels'],
        queryFn: async () => {
            const response = await leadsApi.getFunnels();
            return response.data.data;
        },
        staleTime: 5 * 60_000, // funnels rarely change
    });
}

// ── Fetch stages list (optionally filtered by funnel) ─────────
export function useStages(funnelSlug?: string | null) {
    return useQuery({
        queryKey: ['stages', funnelSlug ?? 'all'],
        queryFn: async () => {
            const params = funnelSlug ? { funnel_slug: funnelSlug } : {};
            const response = await leadsApi.getStages(params);
            return response.data.data;
        },
        staleTime: 5 * 60_000,
        enabled: true,
    });
}

// ── Create a lead ─────────────────────────────────────────────
export function useCreateLead() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: (data: CreateLeadBody) => leadsApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            toast({ title: 'Lead criado com sucesso!' });
        },
        onError: (err: unknown) => {
            const error = err as { response?: { data?: { error?: string } } };
            toast({
                title: 'Erro ao criar lead',
                description: error?.response?.data?.error || 'Tente novamente',
                variant: 'destructive',
            });
        },
    });
}

// ── Update lead stage (drag-and-drop / kanban) ────────────────
export function useUpdateLeadStage() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: ({ id, stage_id }: { id: number; stage_id: number }) =>
            leadsApi.updateStage(id, stage_id),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['lead', variables.id] });
        },
        onError: () => {
            toast({ title: 'Erro ao mover lead', variant: 'destructive' });
            // Invalidate to revert optimistic state
            queryClient.invalidateQueries({ queryKey: ['leads'] });
        },
    });
}

// ── Update lead status (approve/reject) ───────────────────────
export function useUpdateLeadStatus() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: ({ id, status, verdict_notes }: { id: number; status: string; verdict_notes?: string }) =>
            leadsApi.updateStatus(id, status, verdict_notes),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['lead', variables.id] });
            const statusLabels: Record<string, string> = {
                approved: 'Lead aprovado!',
                rejected: 'Lead reprovado',
                archived: 'Lead arquivado',
                active: 'Lead reativado',
            };
            toast({ title: statusLabels[variables.status] || 'Status atualizado' });
        },
        onError: () => {
            toast({ title: 'Erro ao atualizar status', variant: 'destructive' });
        },
    });
}

// ── Update lead (full edit) ───────────────────────────────────
export function useUpdateLead() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<Lead> }) =>
            leadsApi.update(id, data),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['lead', variables.id] });
            toast({ title: 'Lead atualizado com sucesso' });
        },
        onError: () => {
            toast({ title: 'Erro ao atualizar lead', variant: 'destructive' });
        },
    });
}

// ── Toggle bot active ─────────────────────────────────────────
export function useToggleBotStatus() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => leadsApi.toggleBot(id),
        onSuccess: (_, id) => {
            queryClient.invalidateQueries({ queryKey: ['lead', id] });
        },
    });
}

// ── Delete (archive) a lead ───────────────────────────────────
export function useDeleteLead() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: (id: number) => leadsApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            toast({ title: 'Lead arquivado com sucesso' });
        },
        onError: () => {
            toast({ title: 'Erro ao arquivar lead', variant: 'destructive' });
        },
    });
}

// ── Lead notes ────────────────────────────────────────────────
export function useLeadNotes(leadId: number) {
    return useQuery({
        queryKey: ['lead-notes', leadId],
        queryFn: async () => (await leadsApi.getNotes(leadId)).data.data,
        enabled: !!leadId,
    });
}

export function useCreateNote() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: ({ leadId, content }: { leadId: number; content: string }) =>
            leadsApi.createNote(leadId, content),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['lead-notes', variables.leadId] });
            toast({ title: 'Nota adicionada' });
        },
    });
}

// ── Lead conversations ────────────────────────────────────────
export function useLeadConversations(leadId: number) {
    return useQuery({
        queryKey: ['lead-conversations', leadId],
        queryFn: async () => (await leadsApi.getConversations(leadId)).data.data,
        enabled: !!leadId,
        refetchInterval: 5000, // Poll for new messages every 5 seconds
    });
}

// ── Lead documents ────────────────────────────────────────────
export function useLeadDocuments(leadId: number) {
    return useQuery({
        queryKey: ['lead-documents', leadId],
        queryFn: async () => (await leadsApi.getDocuments(leadId)).data.data,
        enabled: !!leadId,
    });
}

// ── Lead checklist (document collection progress) ─────────
export function useLeadChecklist(leadId: number) {
    return useQuery({
        queryKey: ['lead-checklist', leadId],
        queryFn: async () => (await leadsApi.getChecklist(leadId)).data.data,
        enabled: !!leadId,
        staleTime: 15_000,
        refetchInterval: 15_000,
    });
}
