import { Lead } from "@/services/api";
import { MessageCircle, User, Phone, CheckCircle2, Clock, Trash2, Copy, Check, Link2, Archive, ThumbsUp, ThumbsDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useLeadChecklist, useDeleteLead } from "@/hooks/useLeads";
import { useState } from "react";
import { formatPhoneDisplay } from "@/utils/formatters";

interface LeadCardProps {
  lead: Lead & Record<string, unknown>;
  index: number;
  showStatusBadge?: boolean;
}

// ── Status visual config ──────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  approved: {
    label: "Aprovado",
    icon: <ThumbsUp className="w-2.5 h-2.5" />,
    className: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  },
  rejected: {
    label: "Rejeitado",
    icon: <ThumbsDown className="w-2.5 h-2.5" />,
    className: "bg-red-500/20 text-red-400 border border-red-500/30",
  },
  archived: {
    label: "Arquivado",
    icon: <Archive className="w-2.5 h-2.5" />,
    className: "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30",
  },
};

const LeadCard = ({ lead, index, showStatusBadge = false }: LeadCardProps) => {
  const navigate = useNavigate();
  const { data: checklist } = useLeadChecklist(lead.id);
  const deleteLead = useDeleteLead();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `${lead.name}\n${lead.phone}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const hasChecklist = checklist && checklist.totalCount > 0;
  const progress = hasChecklist
    ? Math.round((checklist.receivedCount / checklist.totalCount) * 100)
    : 0;

  // Etapas onde docs ainda não são solicitados — esconde checklist normal
  const PRE_DOC_STAGES = new Set(['recebido', 'geral', 'abordagem', 'pre_analise', 'coleta_info']);
  const stageSlug  = (lead as Record<string, unknown>).stage_slug  as string | undefined;
  const funnelSlug = (lead as Record<string, unknown>).funnel_slug as string | undefined;
  const botStage   = (lead as Record<string, unknown>).bot_stage   as string | undefined;
  const parentLeadId = lead.parent_lead_id;

  const showChecklist = hasChecklist && !PRE_DOC_STAGES.has(stageSlug ?? '');

  // Lead em TRIAGEM: mostrar "Tipo de causa" em vez de checklist
  const isTriagem = funnelSlug === 'geral';
  // Identificado quando Sofia avançou para approach ou além (não é mais 'reception')
  const causeIdentified = isTriagem && !!botStage && botStage !== 'reception';

  const statusConfig = showStatusBadge && lead.status !== 'active'
    ? STATUS_CONFIG[lead.status] ?? null
    : null;

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(true);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteLead.mutate(lead.id);
    setConfirmDelete(false);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  };

  const handleGoToParent = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate("/client-hub", { state: { lead: { id: parentLeadId } } });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      onClick={() => navigate("/client-hub", { state: { lead } })}
      className={`glass-card rounded-lg p-3 cursor-pointer hover:border-primary/40 transition-all duration-200 group relative ${
        lead.status === 'archived' ? 'opacity-60' :
        lead.status === 'rejected' ? 'opacity-70 border-red-500/20' :
        lead.status === 'approved' ? 'border-blue-500/20' : ''
      }`}
    >
      {/* Action buttons */}
      <button
        id={`delete-lead-${lead.id}`}
        onClick={handleDeleteClick}
        title="Excluir lead"
        className="absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center
                   opacity-0 group-hover:opacity-100 transition-opacity duration-150
                   bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300 z-10"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <button
        id={`copy-lead-${lead.id}`}
        onClick={handleCopyClick}
        title="Copiar nome e telefone"
        className="absolute top-2 right-9 w-6 h-6 rounded-md flex items-center justify-center
                   opacity-0 group-hover:opacity-100 transition-opacity duration-150
                   bg-secondary hover:bg-secondary/70 text-muted-foreground hover:text-foreground z-10"
      >
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      </button>

      {/* Confirmação inline de exclusão */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 z-20 rounded-lg bg-background/95 backdrop-blur-sm border border-red-500/40
                       flex flex-col items-center justify-center gap-2 p-3"
          >
            <p className="text-xs font-semibold text-foreground text-center leading-tight">
              Excluir <span className="text-red-400">{lead.name}</span>?
            </p>
            <p className="text-[10px] text-muted-foreground text-center">
              O lead será arquivado (não apagado).
            </p>
            <div className="flex gap-2 mt-1">
              <button
                id={`confirm-delete-lead-${lead.id}`}
                onClick={handleConfirmDelete}
                disabled={deleteLead.isPending}
                className="px-3 py-1 text-[11px] font-semibold rounded-md
                           bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
              >
                {deleteLead.isPending ? 'Arquivando...' : 'Sim, arquivar'}
              </button>
              <button
                id={`cancel-delete-lead-${lead.id}`}
                onClick={handleCancelDelete}
                className="px-3 py-1 text-[11px] font-semibold rounded-md
                           bg-secondary hover:bg-secondary/70 text-foreground transition-colors"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground leading-tight">{lead.name}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {formatPhoneDisplay(lead.phone)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 mr-7">
          {lead.origin === "whatsapp" && (
            <MessageCircle className="w-4 h-4 text-green-500" />
          )}
          {/* Status badge para leads não-ativos */}
          {statusConfig && (
            <span className={`flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${statusConfig.className}`}>
              {statusConfig.icon}
              {statusConfig.label}
            </span>
          )}
        </div>
      </div>

      {/* Badge de lead vinculado (retornou de arquivado) — só exibe se o lead atual NÃO for arquivado */}
      {parentLeadId && lead.status !== 'archived' && (
        <button
          onClick={handleGoToParent}
          className="flex items-center gap-1 text-[10px] text-amber-400/80 hover:text-amber-400 transition-colors mb-2"
          title={`Ver lead anterior #${parentLeadId}`}
        >
          <Link2 className="w-3 h-3" />
          Lead anterior #{parentLeadId}
        </button>
      )}

      {/* ── TRIAGEM: item único "Tipo de causa" ── */}
      {isTriagem && (
        <div className="mt-2 pt-2 border-t border-border/40">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
            Triagem
          </span>
          <div className="flex items-center gap-1.5">
            {causeIdentified ? (
              <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
            ) : (
              <Clock className="w-3 h-3 text-amber-400/70 flex-shrink-0" />
            )}
            <span className={`text-[10px] leading-tight ${
              causeIdentified ? 'text-green-400/80 line-through' : 'text-muted-foreground'
            }`}>
              Tipo de causa
            </span>
          </div>
        </div>
      )}

      {/* ── Outros funis: checklist de docs (só a partir de doc_request) ── */}
      {!isTriagem && showChecklist && (
        <div className="mt-2 pt-2 border-t border-border/40">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Documentos
            </span>
            <span className={`text-[10px] font-semibold ${checklist.complete ? "text-green-400" : "text-amber-400"}`}>
              {checklist.receivedCount}/{checklist.totalCount}
            </span>
          </div>
          <div className="w-full h-1 rounded-full bg-border/60 overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                checklist.complete ? "bg-green-500" : progress > 50 ? "bg-amber-400" : "bg-red-400/70"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            {checklist.flowItems?.map((item: any) => (
              <div key={item.name} className="flex items-center gap-1.5">
                {item.received ? (
                  <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                ) : (
                  <Clock className="w-3 h-3 text-amber-400/70 flex-shrink-0" />
                )}
                <span className={`text-[10px] leading-tight ${
                  item.received ? "text-green-400/80 line-through" : "text-muted-foreground"
                }`}>
                  {item.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-muted-foreground">
          {lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR') : ''}
        </span>
        {!isTriagem && showChecklist && checklist?.complete && (
          <span className="text-[10px] font-semibold text-green-400 bg-green-400/10 rounded px-1.5 py-0.5">
            ✓ Completo
          </span>
        )}
      </div>
    </motion.div>
  );
};

export default LeadCard;
