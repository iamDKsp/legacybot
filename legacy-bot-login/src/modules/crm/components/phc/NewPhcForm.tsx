import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Search, User, ChevronDown, FileText, Scroll, Scale,
  Eye, Save, Loader2, AlertCircle, CheckCircle2, X
} from "lucide-react";
import { phcApi, leadsApi, PhcDocType, Lawyer, Lead } from "@/services/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const DOC_TYPES: { id: PhcDocType; label: string; icon: React.ReactNode; description: string }[] = [
  {
    id: "procuracao",
    label: "Procuração",
    icon: <Scroll className="h-4 w-4" />,
    description: "Autoriza o advogado a representar o cliente",
  },
  {
    id: "declaracao_hipo",
    label: "Decl. Hipossuficiência",
    icon: <Scale className="h-4 w-4" />,
    description: "Declara condição econômica do cliente",
  },
  {
    id: "contrato",
    label: "Contrato",
    icon: <FileText className="h-4 w-4" />,
    description: "Contrato de prestação de serviços",
  },
];

interface NewPhcFormProps {
  onSuccess?: () => void;
}

export function NewPhcForm({ onSuccess }: NewPhcFormProps) {

  const qc = useQueryClient();

  const [leadSearch, setLeadSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedLawyer, setSelectedLawyer] = useState<Lawyer | null>(null);
  const [selectedDocTypes, setSelectedDocTypes] = useState<Set<PhcDocType>>(new Set());
  const [notes, setNotes] = useState("");
  const [showLeadDropdown, setShowLeadDropdown] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Lawyers list
  const { data: lawyers = [] } = useQuery({
    queryKey: ["phc-lawyers"],
    queryFn: () => phcApi.getLawyers().then((r) => r.data.data),
  });

  // Lead search
  const { data: leadResults = [], isFetching: isSearching } = useQuery({
    queryKey: ["lead-search", leadSearch],
    queryFn: () =>
      leadSearch.length >= 2
        ? leadsApi.getAll({ search: leadSearch, limit: 10 }).then((r) => r.data.data)
        : Promise.resolve([]),
    enabled: leadSearch.length >= 2,
    staleTime: 0,
  });


  const toggleDocType = (t: PhcDocType) => {
    setSelectedDocTypes((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedLead) { setError("Selecione um lead."); return; }
    if (!selectedLawyer) { setError("Selecione um advogado."); return; }
    if (selectedDocTypes.size === 0) { setError("Selecione ao menos um tipo de documento."); return; }

    setSaving(true);
    setError("");
    try {
      for (const doc_type of Array.from(selectedDocTypes)) {
        await phcApi.createDocument({
          lead_id: selectedLead.id,
          lawyer_id: selectedLawyer.id,
          doc_type,
          funnel_slug: selectedLead.funnel_slug,
          notes,
        });
      }
      qc.invalidateQueries({ queryKey: ["phc-documents"] });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setSelectedLead(null);
        setSelectedLawyer(null);
        setSelectedDocTypes(new Set());
        setNotes("");
        setLeadSearch("");
        setShowPreview(false);
        onSuccess?.();
      }, 2000);

    } catch {
      setError("Erro ao salvar PHC. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const canPreview = selectedLead && selectedLawyer && selectedDocTypes.size > 0;

  if (success) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", duration: 0.5 }}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30"
        >
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </motion.div>
        <div>
          <p className="font-semibold text-card-foreground">PHC criado com sucesso!</p>
          <p className="text-sm text-muted-foreground mt-1">
            {selectedDocTypes.size} documento{selectedDocTypes.size !== 1 ? "s" : ""} salvo{selectedDocTypes.size !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-24 overflow-y-auto h-full max-w-2xl mx-auto w-full">
      <div>
        <h2 className="text-base font-semibold text-card-foreground">Criar Novo PHC</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Vincule um lead e um advogado para gerar os documentos
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError("")} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Step 1 — Lead */}
      <div className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">1</div>
          <h3 className="text-sm font-semibold text-card-foreground">Selecionar Cliente</h3>
        </div>

        {selectedLead ? (
          <div className="flex items-center justify-between rounded-lg border border-accent/30 bg-accent/5 px-4 py-3">
            <div>
              <p className="font-medium text-sm text-card-foreground">{selectedLead.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedLead.phone} · {selectedLead.funnel_name ?? selectedLead.funnel_slug} · {selectedLead.cpf ?? "Sem CPF"}
              </p>
            </div>
            <button
              onClick={() => { setSelectedLead(null); setLeadSearch(""); }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-accent" />
            )}
            <input
              value={leadSearch}
              onChange={(e) => { setLeadSearch(e.target.value); setShowLeadDropdown(true); }}
              onFocus={() => setShowLeadDropdown(true)}
              onBlur={() => setTimeout(() => setShowLeadDropdown(false), 200)}
              placeholder="Buscar cliente por nome, telefone ou CPF…"
              className="w-full rounded-lg border border-border bg-muted py-2.5 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            {showLeadDropdown && leadSearch.length >= 2 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-20 rounded-xl border border-border/40 bg-card shadow-xl overflow-hidden">
                {isSearching ? (
                  <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                    Buscando clientes…
                  </div>
                ) : leadResults.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    Nenhum cliente encontrado para "{leadSearch}"
                  </div>
                ) : (
                  leadResults.map((lead: Lead) => (
                    <button
                      key={lead.id}
                      onMouseDown={() => { setSelectedLead(lead); setShowLeadDropdown(false); setLeadSearch(""); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/10 transition-colors text-left border-b border-border/20 last:border-0"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary shrink-0">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-card-foreground truncate">{lead.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{lead.phone} · {lead.funnel_name ?? lead.funnel_slug ?? "Geral"}</p>
                      </div>
                      {!lead.cpf && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 shrink-0">Sem CPF</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* CPF warning after selection */}
        {selectedLead && !selectedLead.cpf && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 mt-2">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400">
              Este cliente não tem CPF cadastrado. O PHC será gerado com "CPF não informado".
              Complete os dados do cliente no card do CRM antes de gerar.
            </p>
          </div>
        )}
      </div>


      {/* Step 2 — Lawyer */}
      <div className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">2</div>
          <h3 className="text-sm font-semibold text-card-foreground">Selecionar Advogado</h3>
        </div>

        {lawyers.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Nenhum advogado cadastrado. Vá para a aba <strong>Advogados</strong> para cadastrar.
          </p>
        ) : (
          <div className="relative">
            <select
              value={selectedLawyer?.id ?? ""}
              onChange={(e) => {
                const l = lawyers.find((x) => x.id === Number(e.target.value));
                setSelectedLawyer(l ?? null);
              }}
              className="w-full rounded-lg border border-border bg-muted py-2.5 px-4 text-sm text-card-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 appearance-none"
            >
              <option value="">Selecionar advogado...</option>
              {lawyers.map((l) => (
                <option key={l.id} value={l.id}>{l.name} — OAB {l.oab}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        )}
      </div>

      {/* Step 3 — Document Types */}
      <div className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">3</div>
          <h3 className="text-sm font-semibold text-card-foreground">Documentos a Gerar</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {DOC_TYPES.map((dt) => {
            const isSelected = selectedDocTypes.has(dt.id);
            return (
              <button
                key={dt.id}
                onClick={() => toggleDocType(dt.id)}
                className={`relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-all duration-200 ${
                  isSelected
                    ? "border-accent bg-accent/10 shadow-md shadow-accent/10"
                    : "border-border/40 bg-muted hover:border-accent/40 hover:bg-accent/5"
                }`}
              >
                {isSelected && (
                  <div className="absolute right-2.5 top-2.5">
                    <CheckCircle2 className="h-4 w-4 text-accent" />
                  </div>
                )}
                <span className={`${isSelected ? "text-accent" : "text-muted-foreground"}`}>
                  {dt.icon}
                </span>
                <div>
                  <p className={`text-sm font-semibold ${isSelected ? "text-accent" : "text-card-foreground"}`}>
                    {dt.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{dt.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Optional Notes */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <label className="mb-2 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Observações (opcional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas sobre este PHC..."
          rows={2}
          className="w-full rounded-lg border border-border bg-muted py-2.5 px-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
        />
      </div>

      {/* Preview */}
      {canPreview && showPreview && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-accent/20 bg-accent/5 p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-accent flex items-center gap-2">
            <Eye className="h-4 w-4" /> Preview dos Dados
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Cliente</p>
              <div className="space-y-1">
                <p><span className="text-muted-foreground">Nome:</span> <span className="text-card-foreground font-medium">{selectedLead.name}</span></p>
                <p><span className="text-muted-foreground">CPF:</span> <span className="text-card-foreground font-mono">{selectedLead.cpf ?? "—"}</span></p>
                <p><span className="text-muted-foreground">Tel.:</span> <span className="text-card-foreground">{selectedLead.phone}</span></p>
                <p><span className="text-muted-foreground">Funil:</span> <span className="text-card-foreground">{selectedLead.funnel_name ?? selectedLead.funnel_slug}</span></p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Advogado</p>
              <div className="space-y-1">
                <p><span className="text-muted-foreground">Nome:</span> <span className="text-card-foreground font-medium">{selectedLawyer.name}</span></p>
                <p><span className="text-muted-foreground">OAB:</span> <span className="text-card-foreground font-mono">{selectedLawyer.oab}</span></p>
                <p><span className="text-muted-foreground">CPF:</span> <span className="text-card-foreground font-mono">{selectedLawyer.cpf ?? "—"}</span></p>
                {selectedLawyer.city && (
                  <p><span className="text-muted-foreground">Cidade:</span> <span className="text-card-foreground">{selectedLawyer.city}/{selectedLawyer.state}</span></p>
                )}
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Documentos selecionados</p>
            <div className="flex flex-wrap gap-2">
              {Array.from(selectedDocTypes).map((t) => {
                const dt = DOC_TYPES.find((x) => x.id === t)!;
                return (
                  <span key={t} className="flex items-center gap-1.5 rounded-lg bg-accent/15 border border-accent/30 px-3 py-1 text-xs font-medium text-accent">
                    {dt.icon} {dt.label}
                  </span>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center gap-3">
        {canPreview && (
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border/40 text-sm font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
          >
            <Eye className="h-4 w-4" />
            {showPreview ? "Ocultar Preview" : "Ver Preview"}
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !canPreview}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg gold-gradient text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 ml-auto"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar PHC
        </button>
      </div>
    </div>
  );
}

export default NewPhcForm;
