import { useState, useMemo, useEffect } from "react";
import { Search, Loader2, Plus, AlertCircle, ShieldAlert, Scale, UserX, QrCode } from "lucide-react";
import { FunnelTabs } from "./FunnelTabs";
import KanbanColumn from "./KanbanColumn";
import { useLeads, useFunnels, useStages } from "@/hooks/useLeads";
import { Lead } from "@/services/api";
import NewLeadModal from "@/components/modals/NewLeadModal";
import { useQueryClient } from "@tanstack/react-query";

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

export function KanbanBoard() {
  const [activeFunnelId, setActiveFunnelId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showNewLead, setShowNewLead] = useState(false);
  const queryClient = useQueryClient();

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

  const { data: leads = [], isLoading: leadsLoading, error } = useLeads(
    currentFunnelId ? { funnel_id: currentFunnelId, status: "active" } : undefined
  );

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
        <button
          onClick={() => setShowNewLead(true)}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Novo Lead
        </button>
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
              (l: Lead) => l.stage_id === stage.id || l.stage_slug === stage.slug
            );
            return (
              <KanbanColumn
                key={stage.slug}
                stageId={stage.slug}
                stageLabel={stage.name}
                leads={stageLeads}
                index={i}
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
