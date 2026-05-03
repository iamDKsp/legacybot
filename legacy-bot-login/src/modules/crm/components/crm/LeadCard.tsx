import { Lead } from "@/services/api";
import { MessageCircle, User, Phone, CheckCircle2, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useLeadChecklist } from "@/hooks/useLeads";

interface LeadCardProps {
  lead: Lead & Record<string, unknown>;
  index: number;
}

const LeadCard = ({ lead, index }: LeadCardProps) => {
  const navigate = useNavigate();
  const { data: checklist } = useLeadChecklist(lead.id);

  const hasChecklist = checklist && checklist.totalCount > 0;
  const progress = hasChecklist
    ? Math.round((checklist.receivedCount / checklist.totalCount) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      onClick={() => navigate("/client-hub", { state: { lead } })}
      className="glass-card rounded-lg p-3 cursor-pointer hover:border-primary/40 transition-all duration-200 group"
    >
      {/* Header: avatar + name + WhatsApp icon */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground leading-tight">{lead.name}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {lead.phone}
            </p>
          </div>
        </div>
        {lead.origin === "whatsapp" && (
          <MessageCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
        )}
      </div>

      {/* Document Checklist Mini-View */}
      {hasChecklist && (
        <div className="mt-2 pt-2 border-t border-border/40">
          {/* Progress bar */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Documentos
            </span>
            <span
              className={`text-[10px] font-semibold ${
                checklist.complete ? "text-green-400" : "text-amber-400"
              }`}
            >
              {checklist.receivedCount}/{checklist.totalCount}
            </span>
          </div>
          <div className="w-full h-1 rounded-full bg-border/60 overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                checklist.complete
                  ? "bg-green-500"
                  : progress > 50
                  ? "bg-amber-400"
                  : "bg-red-400/70"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Individual doc items */}
          <div className="flex flex-col gap-0.5">
            {checklist.flowItems?.map((item: any) => (
              <div key={item.name} className="flex items-center gap-1.5">
                {item.received ? (
                  <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                ) : (
                  <Clock className="w-3 h-3 text-amber-400/70 flex-shrink-0" />
                )}
                <span
                  className={`text-[10px] leading-tight ${
                    item.received
                      ? "text-green-400/80 line-through"
                      : "text-muted-foreground"
                  }`}
                >
                  {item.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer: date */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-muted-foreground">{lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR') : ''}</span>
        {checklist?.complete && (
          <span className="text-[10px] font-semibold text-green-400 bg-green-400/10 rounded px-1.5 py-0.5">
            ✓ Completo
          </span>
        )}
      </div>
    </motion.div>
  );
};

export default LeadCard;
