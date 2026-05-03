import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, CheckCircle, XCircle, MessageSquare, Bot, BotOff,
  FileText, ClipboardList, User, Phone, Mail, Calendar,
  Send, Loader2, Plus, Download, Upload, Info, RefreshCw,
  MessageCircle, Edit2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Lead } from "@/modules/crm/types/crm";
import { useLeadNotes, useCreateNote, useLeadConversations, useLeadDocuments, useUpdateLeadStatus, useToggleBotStatus, useLeadChecklist } from "@/hooks/useLeads";
import { leadsApi } from "@/services/api";
import { LeadEditModal } from "./LeadEditModal";

import { CheckSquare } from "lucide-react";


// ─── Types ────────────────────────────────────────────────────
type TabKey = "conversas" | "info" | "documentos" | "checklist";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "conversas", label: "Conversas", icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { key: "info", label: "Informações", icon: <Info className="w-3.5 h-3.5" /> },
  { key: "documentos", label: "Documentos", icon: <FileText className="w-3.5 h-3.5" /> },
  { key: "checklist", label: "Checklist", icon: <CheckSquare className="w-3.5 h-3.5" /> },
];

// ─── Conversation / Chat Panel ────────────────────────────────
function ConversationsPanel({ leadId }: { leadId: number }) {
  const { data: messages = [], isLoading, refetch } = useLeadConversations(leadId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await leadsApi.sendMessage(leadId, draft.trim());
      setDraft("");
      await refetch();
    } catch { /* silent */ }
    finally { setSending(false); }
  };

  if (isLoading) return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-accent" />
    </div>
  );

  if (messages.length === 0) return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <MessageCircle className="h-10 w-10 opacity-30" />
      <p className="text-sm">Nenhuma mensagem ainda</p>
      <p className="text-xs opacity-60">A conversa aparecerá aqui quando o lead entrar em contato pelo WhatsApp</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin pb-3">
        {messages.map((msg: Record<string, unknown>) => {
          const isOutbound = msg.direction === "outbound";
          const sentAt = msg.sent_at ? new Date(msg.sent_at as string).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
          const isImage = msg.media_type === 'image' || (msg.content as string || '').startsWith('[Imagem recebida');
          const imageUrl = withToken(msg.image_url as string | null);
          return (
            <div key={String(msg.id)} className={cn("flex gap-2", isOutbound && "flex-row-reverse")}>
              <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1",
                isOutbound ? "bg-accent/20" : "bg-secondary")}>
                {isOutbound
                  ? <User className="w-3.5 h-3.5 text-accent" />
                  : <Bot className="w-3.5 h-3.5 text-muted-foreground" />}
              </div>
              <div className={cn("max-w-[76%] rounded-xl px-3.5 py-2.5",
                isOutbound ? "bg-accent/15 rounded-tr-sm" : "bg-secondary rounded-tl-sm")}>
                {isImage && imageUrl ? (
                  <img
                    src={imageUrl}
                    alt="documento"
                    className="max-w-[200px] max-h-[180px] rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(imageUrl, '_blank')}
                  />
                ) : isImage ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground italic">
                    <FileText className="w-4 h-4" />
                    {String(msg.content)}
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{String(msg.content)}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">{sentAt}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Send bar */}
      <div className="flex gap-2 pt-3 border-t border-border">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Enviar mensagem como assessor…"
          className="flex-1 bg-secondary rounded-lg px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/50 transition-all"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          className="p-2.5 rounded-lg bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── Info Panel ────────────────────────────────────────────────
function InfoPanel({ lead, onEdit }: { lead: Lead & Record<string, unknown>; onEdit: () => void }) {
  const rows: { icon: React.ReactNode; label: string; value: string | undefined }[] = [
    { icon: <Phone className="w-3.5 h-3.5" />, label: "Telefone", value: lead.phone },
    { icon: <Mail className="w-3.5 h-3.5" />, label: "E-mail", value: lead.email || "—" },
    { icon: <User className="w-3.5 h-3.5" />, label: "CPF", value: (lead.cpf as string) || "—" },
    { icon: <User className="w-3.5 h-3.5" />, label: "RG", value: (lead.rg as string) || undefined },
    { icon: <ClipboardList className="w-3.5 h-3.5" />, label: "Funil", value: (lead.funnel_name as string) || "—" },
    { icon: <ClipboardList className="w-3.5 h-3.5" />, label: "Endereço", value: (lead.address as string) || undefined },
    { icon: <Calendar className="w-3.5 h-3.5" />, label: "Origem", value: lead.origin },
    { icon: <Calendar className="w-3.5 h-3.5" />, label: "Criado em", value: lead.createdAt || (lead.created_at ? new Date(lead.created_at as string).toLocaleDateString("pt-BR") : "—") },
  ];

  const hasCpf = !!lead.cpf;
  const hasAddress = !!(lead.address as string);

  return (
    <div className="space-y-4">
      {/* PHC readiness alert */}
      {(!hasCpf || !hasAddress) && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <FileText className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-400">Dados incompletos para PHC</p>
            <p className="text-[11px] text-amber-400/70 mt-0.5">
              {!hasCpf && "CPF não informado. "}{!hasAddress && "Endereço não extraído."}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {rows.filter(r => r.value).map(({ icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 rounded-lg bg-secondary/40 px-3 py-2.5">
            <span className="text-muted-foreground">{icon}</span>
            <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
            <span className="text-sm font-medium flex-1 truncate">{value}</span>
          </div>
        ))}
      </div>

      {lead.description && (
        <div className="rounded-lg bg-secondary/40 px-3 py-3">
          <p className="text-xs text-muted-foreground mb-1.5">Descrição / Observação</p>
          <p className="text-sm leading-relaxed">{lead.description as string}</p>
        </div>
      )}

      <button
        onClick={onEdit}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border/40 text-xs font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
      >
        <Edit2 className="h-3.5 w-3.5" /> Editar / Complementar Dados do Cliente
      </button>
    </div>
  );
}


// ─── Documents Panel ───────────────────────────────────────────
// Helper: append the local JWT token to a backend URL for unauthenticated requests (img/a href)
function withToken(url: string | null): string | null {
  if (!url) return null;
  const token = localStorage.getItem('legacy_token');
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

function DocumentsPanel({ leadId }: { leadId: number }) {
  const { data: docs = [], isLoading } = useLeadDocuments(leadId);

  const statusStyles: Record<string, string> = {
    pendente: "bg-yellow-500/15 text-yellow-400",
    recebido: "bg-blue-500/15 text-blue-400",
    aprovado: "bg-emerald-500/15 text-emerald-400",
    rejeitado: "bg-red-500/15 text-red-400",
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;

  if (docs.length === 0) return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
      <Upload className="h-10 w-10 opacity-30" />
      <p className="text-sm">Nenhum documento recebido</p>
      <p className="text-xs opacity-60">Documentos enviados pelo WhatsApp aparecerão aqui</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {(docs as Record<string, unknown>[]).map((doc) => {
        const status = String(doc.status || 'recebido');
        const docName = String(doc.name || doc.file_name || 'Documento');
        const rawFileUrl = doc.file_url as string | null;
        const fileUrl = withToken(rawFileUrl);
        const isImage = (doc.file_type as string || '').startsWith('image/');
        return (
          <div key={String(doc.id)} className="rounded-lg bg-secondary/40 hover:bg-secondary transition-colors group overflow-hidden border border-border/30">
            {/* Thumbnail if image available */}
            {fileUrl && isImage && (
              <div className="relative h-24 bg-secondary cursor-pointer overflow-hidden" onClick={() => window.open(fileUrl, '_blank')}>
                <img src={fileUrl} alt={docName} className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              </div>
            )}
            <div className="flex items-center gap-3 p-2.5">
              <div className="w-8 h-8 rounded-md bg-card flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{docName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{String(doc.file_type || 'arquivo')}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusStyles[status] || statusStyles.recebido}`}>{status}</span>
                </div>
              </div>
              {fileUrl && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-md hover:bg-card transition-colors"
                    title="Ver / Baixar"
                  >
                    <Download className="w-3.5 h-3.5 text-muted-foreground" />
                  </a>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Checklist Panel ───────────────────────────────────────────────
function ChecklistPanel({ leadId }: { leadId: number }) {
  const { data, isLoading, refetch } = useLeadChecklist(leadId);

  // Auto-refresh the checklist every 15s to pick up new OCR extractions
  useEffect(() => {
    const interval = setInterval(() => refetch(), 15000);
    return () => clearInterval(interval);
  }, [refetch]);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;

  if (!data) return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
      <ClipboardList className="h-10 w-10 opacity-30" />
      <p className="text-sm">Nenhum dado do checklist</p>
    </div>
  );

  const { standardFields = [], flowItems = [], funnelLabel, receivedCount, totalCount, complete } = data;

  return (
    <div className="flex flex-col h-full gap-4 overflow-y-auto scrollbar-thin pr-1 pb-4">
      
      {/* Informações Padrão */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">
          1. Informações Padrão
        </h3>
        <div className="space-y-2">
          {standardFields.map((field: any) => (
            <div key={field.key} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40 border border-border/50">
              <div className="flex items-center gap-3">
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px]", field.filled ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-500")}>
                  {field.filled ? <CheckCircle className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">{field.label}</p>
                  <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                    {field.value || <span className="italic opacity-50">Aguardando preenchimento...</span>}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Informações do Fluxo */}
      <div className="space-y-3 mt-2">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="text-sm font-semibold text-foreground">
            2. Informações do Fluxo
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
            {funnelLabel} ({receivedCount}/{totalCount})
          </span>
        </div>
        
        {flowItems.length === 0 ? (
           <p className="text-xs text-muted-foreground italic py-2">Nenhum documento exigido para este fluxo.</p>
        ) : (
          <div className="space-y-2">
            {flowItems.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40 border border-border/50">
                <div className="flex items-center gap-3">
                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px]", item.received ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-500")}>
                    {item.received ? <CheckCircle className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5" />}
                  </div>
                  <p className="text-xs font-medium text-foreground">{item.name}</p>
                </div>
                {!item.received && (
                  <span className="text-[10px] text-yellow-500/70">Pendente</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {complete && (
        <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-400">Checklist Completo!</p>
            <p className="text-xs text-emerald-400/80 mt-1">Todas as informações obrigatórias e documentos do fluxo foram coletados pela Sofia.</p>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
interface CardDetailViewProps {
  initialLead?: Lead & Record<string, unknown>;
}

const CardDetailView = ({ initialLead }: CardDetailViewProps) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("conversas");
  const [showEditModal, setShowEditModal] = useState(false);
  const updateStatus = useUpdateLeadStatus();
  const toggleBot = useToggleBotStatus();


  if (!initialLead) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 text-muted-foreground">
        <User className="h-12 w-12 opacity-30" />
        <p>Nenhum lead selecionado</p>
        <button onClick={() => navigate("/crm")} className="text-accent text-sm hover:underline">
          ← Voltar ao CRM
        </button>
      </div>
    );
  }

  const lead = initialLead;
  const leadId = Number(lead.id);
  const isBotActive = Boolean(lead.bot_active);
  const verdict = lead.status as string;

  const handleVerdict = (newStatus: "approved" | "rejected") => {
    const toggled = verdict === newStatus ? "active" : newStatus;
    updateStatus.mutate({ id: leadId, status: toggled });
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 shrink-0">
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          {/* Back + name */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground hover:text-foreground transition flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-bold truncate leading-tight">{lead.name}</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Phone className="w-3 h-3" /> {lead.phone}
                {lead.funnel_name && <><span className="opacity-40">·</span><span>{String(lead.funnel_name)}</span></>}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Approve */}
            <button
              onClick={() => handleVerdict("approved")}
              disabled={updateStatus.isPending}
              title="Aprovar lead"
              className={cn("p-2 rounded-lg transition-all",
                verdict === "approved"
                  ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                  : "hover:bg-secondary text-muted-foreground")}
            >
              <CheckCircle className="w-5 h-5" />
            </button>
            {/* Reject */}
            <button
              onClick={() => handleVerdict("rejected")}
              disabled={updateStatus.isPending}
              title="Reprovar lead"
              className={cn("p-2 rounded-lg transition-all",
                verdict === "rejected"
                  ? "bg-red-500/15 text-red-400 ring-1 ring-red-500/30"
                  : "hover:bg-secondary text-muted-foreground")}
            >
              <XCircle className="w-5 h-5" />
            </button>

            <div className="w-px h-5 bg-border mx-0.5" />

            {/* Gerar PHC */}
            <button
              onClick={() => navigate("/crm", { state: { openPhc: true, phcLead: lead } })}
              title="Gerar PHC para este lead"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ring-1 transition-all bg-amber-500/10 text-amber-400 ring-amber-500/30 hover:bg-amber-500/20"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Gerar PHC</span>
            </button>

            <div className="w-px h-5 bg-border mx-0.5" />

            {/* Bot toggle */}
            <button
              onClick={() => toggleBot.mutate(leadId)}
              disabled={toggleBot.isPending}
              title={isBotActive ? "Parar bot" : "Ativar bot"}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ring-1 transition-all",
                isBotActive
                  ? "bg-red-500/10 text-red-400 ring-red-500/30 hover:bg-red-500/20"
                  : "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30 hover:bg-emerald-500/20")}
            >
              {toggleBot.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : isBotActive ? <BotOff className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isBotActive ? "Parar Bot" : "Ativar Bot"}</span>
            </button>
          </div>

        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto px-4 gap-1 pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors",
                activeTab === tab.key
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              )}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
          <button
            onClick={() => window.location.reload()}
            className="ml-auto p-1.5 rounded-md hover:bg-secondary text-muted-foreground transition"
            title="Atualizar"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 px-4 py-4 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="h-full"
          >
            {activeTab === "conversas" && <ConversationsPanel leadId={leadId} />}
            {activeTab === "info" && <div className="overflow-y-auto h-full scrollbar-thin"><InfoPanel lead={lead} onEdit={() => setShowEditModal(true)} /></div>}
            {activeTab === "documentos" && <div className="overflow-y-auto h-full scrollbar-thin"><DocumentsPanel leadId={leadId} /></div>}
            {activeTab === "checklist" && <ChecklistPanel leadId={leadId} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Lead Edit Modal */}
      {showEditModal && (
        <LeadEditModal lead={lead} onClose={() => setShowEditModal(false)} />
      )}
    </div>
  );
};


export default CardDetailView;
