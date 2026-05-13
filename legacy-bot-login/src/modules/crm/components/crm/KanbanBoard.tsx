import { useState, useMemo, useEffect } from "react";
import { Search, Loader2, Plus, AlertCircle, ShieldAlert, Scale, UserX, QrCode, Copy, Filter } from "lucide-react";
import { FunnelTabs } from "./FunnelTabs";
import KanbanColumn from "./KanbanColumn";
import { useLeads, useFunnels, useStages } from "@/hooks/useLeads";
import { Lead, leadsApi } from "@/services/api";
import NewLeadModal from "@/components/modals/NewLeadModal";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// ── Banner de contexto por funil ──────────────────────────────────────────────
type BannerVariant = "amber" | "blue" | "red" | "purple";

interface FunnelBanner {
  icon: React.ReactNode;
  message: string;
  variant: BannerVariant;
}

const VARIANT_STYLES: Record<BannerVariant, string> = {
  amber:  "border-amber-500/30  bg-amber-500/10  text-amber-400",
  blue:   "border-blue-500/30   bg-blue-500/10   text-blue-400",
  red:    "border-red-500/30    bg-red-500/10    text-red-400",
  purple: "border-purple-500/30 bg-purple-500/10 text-purple-400",
};

const FUNNEL_BANNERS: Record<string, FunnelBanner> = {
  "trabalhista": {
    icon: <Scale className="h-4 w-4 shrink-0" />,
    variant: "blue",
    message:
      "Funil Trabalhista — clientes com direitos violados (FGTS, rescisão, horas extras etc.). " +
      "Solicite documentos admissionais e colete dados do vínculo empregatício.",
  },
  "negativado": {
    icon: <UserX className="h-4 w-4 shrink-0" />,
    variant: "purple",
    message:
      "Funil Cliente Negativado — CPF com restrição no SPC/Serasa. " +
      "Verifique a origem da dívida e oriente sobre possibilidade de contestação ou negociação.",
  },
  "golpe-pix": {
    icon: <QrCode className="h-4 w-4 shrink-0" />,
    variant: "red",
    message:
      "Funil Golpe do Pix — cliente foi vítima de transferência fraudulenta via Pix. " +
      "Oriente a registrar B.O. imediatamente e colete comprovantes da transação para acionamento bancário.",
  },
  "golpe-cibernetico": {
    icon: <ShieldAlert className="h-4 w-4 shrink-0" />,
    variant: "amber",
    message:
      "Funil de alto risco: Golpe Cibernético — conta bancária hackeada ou com acesso restrito indevido. " +
      "Solicite bloqueio imediato junto ao banco e colete prints/logs das movimentações suspeitas.",
  },
};

// ── Status filter options ─────────────────────────────────────────────────────
type StatusFilter = "active" | "all" | "approved" | "rejected" | "archived";

const STATUS_FILTERS: { key: StatusFilter; label: string; activeClass: string }[] = [
  { key: "active",   label: "Ativos",     activeClass: "text-green-400  border-green-500/40  bg-green-500/10" },
  { key: "all",      label: "Todos",      activeClass: "text-foreground border-border/60      bg-secondary" },
  { key: "approved", label: "Aprovados",  activeClass: "text-blue-400   border-blue-500/40   bg-blue-500/10" },
  { key: "rejected", label: "Rejeitados", activeClass: "text-red-400    border-red-500/40    bg-red-500/10" },
  { key: "archived", label: "Arquivados", activeClass: "text-zinc-400   border-zinc-500/40   bg-zinc-500/10" },
];

export const STATUS_BADGE: Record<string, string> = {
  approved: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  rejected: "bg-red-500/20 text-red-400 border border-red-500/30",
  archived: "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30",
};

export function KanbanBoard() {
  const [activeFunnelId, setActiveFunnelId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showNewLead, setShowNewLead] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: funnels = [], isLoading: funnelsLoading } = useFunnels();

  // Active funnel defaults to the first one when loaded
  const currentFunnelId = activeFunnelId ?? funnels[0]?.id ?? null;

  // Resolve the current funnel slug from the funnels list
  const currentFunnelSlug = useMemo(
    () => funnels.find((f) => f.id === currentFunnelId)?.slug ?? null,
    [funnels, currentFunnelId]
  );

  // Fetch ONLY the stages for the active funnel (from funnel_stages table in backend)
  const { data: funnelStages = [], isLoading: stagesLoading } = useStages(currentFunnelSlug);

  // Build query params — status="all" shows everything (pass no status param)
  const leadsQueryParams = useMemo(() => {
    if (!currentFunnelId) return undefined;
    const params: Record<string, unknown> = { funnel_id: currentFunnelId };
    if (statusFilter !== "all") params.status = statusFilter;
    return params;
  }, [currentFunnelId, statusFilter]);

  const { data: leads = [], isLoading: leadsLoading, error } = useLeads(leadsQueryParams);

  const filteredLeads = useMemo(() => {
    if (!search) return leads;
    const term = search.toLowerCase();
    return leads.filter(
      (l: Lead) =>
        l.name.toLowerCase().includes(term) ||
        l.phone.includes(term) ||
        (l.email && l.email.toLowerCase().includes(term))
    );
  }, [leads, search]);

  const handleCopyAllConversations = async () => {
    try {
      setIsCopying(true);
      let allText = '';
      
      for (const lead of filteredLeads) {
        const { data } = await leadsApi.getConversations(lead.id);
        const msgs = data?.data || [];
        if (msgs.length > 0) {
          allText += `\n--- Conversa com ${lead.name} (${lead.phone}) ---\n\n`;
          msgs.forEach((msg: any) => {
            const senderName = msg.sender === 'lead' ? lead.name : msg.sender === 'bot' ? 'Bot' : 'Atendente';
            const date = new Date(msg.sent_at).toLocaleString('pt-BR');
            allText += `[${date}] ${senderName}: ${msg.content}\n`;
          });
          allText += `\n`;
        }
      }

      if (!allText) {
         toast({ title: "Nenhuma conversa encontrada.", variant: "destructive" });
         return;
      }

      await navigator.clipboard.writeText(allText.trim());
      toast({ title: "Conversas copiadas!", description: "Todas as conversas foram copiadas para a área de transferência." });
    } catch (error) {
      console.error(error);
      toast({ title: "Erro ao copiar", description: "Ocorreu um erro ao buscar as conversas.", variant: "destructive" });
    } finally {
      setIsCopying(false);
    }
  };

  // Listen for stage_changed WebSocket events → refresh board in real time
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.type === "stage_changed" || data?.event === "stage_changed") {
          queryClient.invalidateQueries({ queryKey: ["leads"] });
        }
      } catch {
        // ignore non-JSON messages
      }
    };
    window.addEventListener("ws_message", handleMessage as EventListener);
    return () => window.removeEventListener("ws_message", handleMessage as EventListener);
  }, [queryClient]);

  const isLoading = funnelsLoading || leadsLoading || stagesLoading;
  const funnelBanner = currentFunnelSlug ? FUNNEL_BANNERS[currentFunnelSlug] ?? null : null;

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Funnel context banner */}
      {funnelBanner && (
        <div className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm ${VARIANT_STYLES[funnelBanner.variant]}`}>
          {funnelBanner.icon}
          <span>{funnelBanner.message}</span>
        </div>
      )}

      {/* Top Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar lead por nome ou telefone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-muted py-2 pl-9 pr-4 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="relative flex flex-col items-end">
          <button
            onClick={() => setShowNewLead(true)}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Novo Lead
          </button>
          <button
            onClick={handleCopyAllConversations}
            disabled={isCopying}
            className="absolute -bottom-6 right-2 p-1 text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
            title="Copiar todas as conversas desta tela"
          >
            {isCopying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Funnel Tabs */}
      {!funnelsLoading && funnels.length > 0 && (
        <FunnelTabs
          funnels={funnels}
          activeFunnelId={currentFunnelId}
          onSelect={(id) => setActiveFunnelId(id)}
          leads={leads}
        />
      )}

      {/* ── Status Filter Bar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            id={`status-filter-${f.key}`}
            onClick={() => setStatusFilter(f.key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all duration-150 ${
              statusFilter === f.key
                ? f.activeClass
                : "text-muted-foreground border-transparent hover:border-border hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
        {statusFilter !== "active" && (
          <span className="text-[10px] text-amber-400/70 italic ml-1">
            {statusFilter === "all"
              ? "Mostrando todos os leads"
              : `Mostrando apenas leads ${STATUS_FILTERS.find((s) => s.key === statusFilter)?.label.toLowerCase()}`}
          </span>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="flex flex-1 items-center justify-center flex-col gap-2 text-sm text-red-400">
          <AlertCircle className="h-8 w-8" />
          <p>Erro ao carregar leads. Verifique a conexão com o servidor.</p>
        </div>
      )}

      {/* Kanban — columns come from the DB per funnel, not hardcoded */}
      {!isLoading && !error && (
        <div className="flex flex-1 gap-3 overflow-x-auto pb-4 kanban-scroll-x">
          {funnelStages.map((stage: { id: number; name: string; slug: string }, i: number) => {
            const stageLeads = filteredLeads.filter(
              (l: Lead) => l.stage_id === stage.id || (l as any).stage_slug === stage.slug
            );
            return (
              <KanbanColumn
                key={stage.slug}
                stageId={stage.slug}
                stageLabel={stage.name}
                leads={stageLeads}
                index={i}
                showStatusBadge={statusFilter !== "active"}
              />
            );
          })}
        </div>
      )}

      {/* New Lead Modal */}
      {showNewLead && (
        <NewLeadModal
          funnels={funnels}
          currentFunnelId={currentFunnelId}
          onClose={() => setShowNewLead(false)}
        />
      )}
    </div>
  );
}

export default KanbanBoard;
