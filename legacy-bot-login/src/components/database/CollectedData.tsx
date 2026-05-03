import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, User, Phone, Mail, Calendar, X, MessageSquare, ChevronRight, Loader2, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { databaseApi, CollectedLead } from "@/services/api";

export function CollectedData() {
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<CollectedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<CollectedLead | null>(null);
  const navigate = useNavigate();

  const handleOpenConversation = (lead: CollectedLead) => {
    // Map CollectedLead to the CRM Lead shape expected by ClientHub
    const crmLead = {
      id: String(lead.id),
      name: lead.name,
      phone: lead.phone,
      origin: (lead.origin === "whatsapp" ? "whatsapp" : "manual") as "whatsapp" | "manual",
      createdAt: new Date(lead.created_at).toLocaleDateString("pt-BR"),
      funnel: lead.funnel_slug || "trabalhista",
      stage: lead.stage_name || "recebido",
    };
    navigate("/client-hub", { state: { lead: crmLead } });
  };

  useEffect(() => {
    setLoading(true);
    databaseApi.getCollectedLeads({ search: search || undefined })
      .then((res) => setLeads(res.data.data))
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));
  }, [search]);

  const statusColor = (status: string, botStage: string) => {
    if (botStage === "done") return "bg-green-500/10 text-green-500";
    if (status === "approved") return "bg-green-500/10 text-green-500";
    if (status === "active") return "bg-primary/10 text-primary";
    return "bg-surface text-muted-foreground";
  };

  const statusLabel = (lead: CollectedLead) => {
    if (lead.bot_stage === "done") return "Finalizado";
    if (lead.bot_stage === "cpf_collection") return "Documentação";
    if (lead.bot_stage === "document_request") return "Docs Pedidos";
    if (lead.status === "approved") return "Qualificado";
    return "Em Atendimento";
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR");
  };

  return (
    <div className="relative">
      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, telefone ou email..."
          className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Carregando dados coletados...
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            {leads.length} pessoa{leads.length !== 1 ? "s" : ""} encontrada{leads.length !== 1 ? "s" : ""}
          </p>

          <div className="space-y-2">
            {leads.map((lead, i) => (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => setSelectedLead(lead)}
                className="flex items-center justify-between p-4 rounded-xl bg-card border border-border hover:border-primary/30 cursor-pointer transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-surface flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{lead.name}</p>
                    <p className="text-sm text-muted-foreground">{lead.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs px-3 py-1 rounded-full bg-surface text-muted-foreground">
                    {lead.funnel_name || "—"}
                  </span>
                  <span className={`text-xs px-3 py-1 rounded-full ${statusColor(lead.status, lead.bot_stage)}`}>
                    {statusLabel(lead)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </motion.div>
            ))}

            {leads.length === 0 && (
              <div className="py-20 text-center text-muted-foreground">
                <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Nenhum lead encontrado</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Side Drawer */}
      <AnimatePresence>
        {selectedLead && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLead(null)}
              className="fixed inset-0 bg-background/60 z-40"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-card border-l border-border z-50 overflow-y-auto"
            >
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-foreground">Perfil</h2>
                  <button
                    onClick={() => setSelectedLead(null)}
                    className="p-2 rounded-lg hover:bg-surface transition-colors"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                {/* Avatar & Name */}
                <div className="text-center py-4">
                  <div className="w-20 h-20 rounded-full bg-surface mx-auto flex items-center justify-center mb-4">
                    <User className="w-9 h-9 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{selectedLead.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedLead.funnel_name}</p>
                </div>

                {/* Info Cards */}
                <div className="space-y-3">
                  {[
                    { icon: Phone, label: "Telefone", value: selectedLead.phone },
                    { icon: Mail, label: "Email", value: selectedLead.email || "Não informado" },
                    { icon: Calendar, label: "Data de Entrada", value: formatDate(selectedLead.created_at) },
                    { icon: MessageSquare, label: "Mensagens", value: `${selectedLead.message_count} mensagem${selectedLead.message_count !== 1 ? 's' : ''} trocada${selectedLead.message_count !== 1 ? 's' : ''}` },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center gap-3 p-3 rounded-lg bg-background border border-border">
                      <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-sm text-foreground">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Details */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Detalhes</h4>
                  <div className="p-4 rounded-lg bg-background border border-border space-y-2">
                    {selectedLead.cpf && (
                      <div className="flex justify-between">
                        <span className="text-xs text-muted-foreground">CPF</span>
                        <span className="text-sm text-foreground">{selectedLead.cpf}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Etapa atual bot</span>
                      <span className="text-sm text-foreground font-mono">{selectedLead.bot_stage}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Status</span>
                      <span className="text-sm text-primary font-medium">{statusLabel(selectedLead)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Bot ativo</span>
                      <span className={`text-sm font-medium ${selectedLead.bot_active ? 'text-green-500' : 'text-red-500'}`}>
                        {selectedLead.bot_active ? 'Sim' : 'Não'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Funil</span>
                      <span className="text-sm text-foreground">{selectedLead.funnel_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Etapa CRM</span>
                      <span className="text-sm text-foreground">{selectedLead.stage_name || "—"}</span>
                    </div>
                  </div>
                </div>

                {/* Open Conversation Button */}
                {selectedLead.message_count > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleOpenConversation(selectedLead)}
                    className="w-full flex items-center justify-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/30 text-primary font-semibold hover:bg-primary/20 transition-all duration-200 group"
                  >
                    <ExternalLink className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                    Abrir Conversa
                  </motion.button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
