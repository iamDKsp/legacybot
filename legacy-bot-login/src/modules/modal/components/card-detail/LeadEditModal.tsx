import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, User, MapPin, FileText, Save, Loader2,
  Hash, Globe, Calendar, Heart
} from "lucide-react";
import { leadsApi, Lead } from "@/services/api";
import { useQueryClient } from "@tanstack/react-query";

interface LeadEditModalProps {
  lead: Lead & Record<string, unknown>;
  onClose: () => void;
}

const ESTADOS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

const ESTADO_CIVIL = [
  { value: "solteiro",   label: "Solteiro(a)" },
  { value: "casado",     label: "Casado(a)" },
  { value: "divorciado", label: "Divorciado(a)" },
  { value: "viuvo",      label: "Viúvo(a)" },
  { value: "outro",      label: "Outro" },
];

export function LeadEditModal({ lead, onClose }: LeadEditModalProps) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    // Basic
    name:    lead.name ?? "",
    email:   (lead.email as string) ?? "",
    cpf:     (lead.cpf  as string) ?? "",
    // Address (may already be extracted by bot from comprovante)
    address:        (lead.address        as string) ?? "",
    city:           (lead.city           as string) ?? "",
    state:          (lead.state          as string) ?? "",
    // Legal
    rg:             (lead.rg             as string) ?? "",
    marital_status: (lead.marital_status as string) ?? "",
    nationality:    (lead.nationality    as string) ?? "brasileiro(a)",
    birthdate:      (lead.birthdate      as string) ?? "",
  });

  const set = (k: keyof typeof form, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await leadsApi.update(lead.id, form as Parameters<typeof leadsApi.update>[1]);
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      setSuccess(true);
      setTimeout(onClose, 900);
    } catch {
      setError("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 20 }}
          transition={{ type: "spring", duration: 0.35 }}
          className="w-full max-w-xl rounded-2xl border border-border/40 bg-card shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/30 bg-card/80 backdrop-blur-xl">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg gold-gradient">
                <FileText className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-card-foreground">Complementar Dados do Cliente</h2>
                <p className="text-xs text-muted-foreground">Necessário para geração dos documentos PHC</p>
              </div>
            </div>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-400">
                ✅ Dados salvos com sucesso!
              </div>
            )}

            {/* Section: Dados Básicos */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Dados Básicos
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome Completo</label>
                  <input value={form.name} onChange={e => set("name", e.target.value)}
                    className="w-full rounded-lg border border-border bg-muted py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">CPF</label>
                  <input value={form.cpf} onChange={e => set("cpf", e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full rounded-lg border border-border bg-muted py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Hash className="h-3 w-3" /> RG / Identidade
                  </label>
                  <input value={form.rg} onChange={e => set("rg", e.target.value)}
                    placeholder="MG-12.345.678"
                    className="w-full rounded-lg border border-border bg-muted py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Heart className="h-3 w-3" /> Estado Civil
                  </label>
                  <select value={form.marital_status} onChange={e => set("marital_status", e.target.value)}
                    className="w-full rounded-lg border border-border bg-muted py-2.5 px-3 text-sm text-card-foreground focus:outline-none focus:ring-2 focus:ring-accent/50">
                    <option value="">Selecionar...</option>
                    {ESTADO_CIVIL.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Globe className="h-3 w-3" /> Nacionalidade
                  </label>
                  <input value={form.nationality} onChange={e => set("nationality", e.target.value)}
                    placeholder="brasileiro(a)"
                    className="w-full rounded-lg border border-border bg-muted py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Data de Nascimento
                  </label>
                  <input type="date" value={form.birthdate} onChange={e => set("birthdate", e.target.value)}
                    className="w-full rounded-lg border border-border bg-muted py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
                </div>
              </div>
            </div>

            {/* Section: Endereço */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Endereço
                {lead.address && <span className="text-green-400 text-[10px] font-medium bg-green-400/10 px-1.5 py-0.5 rounded">extraído pelo bot</span>}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Endereço completo</label>
                  <input value={form.address} onChange={e => set("address", e.target.value)}
                    placeholder="Rua das Flores, 123, Bairro"
                    className="w-full rounded-lg border border-border bg-muted py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Cidade</label>
                  <input value={form.city} onChange={e => set("city", e.target.value)}
                    placeholder="Belo Horizonte"
                    className="w-full rounded-lg border border-border bg-muted py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Estado</label>
                  <select value={form.state} onChange={e => set("state", e.target.value)}
                    className="w-full rounded-lg border border-border bg-muted py-2.5 px-3 text-sm text-card-foreground focus:outline-none focus:ring-2 focus:ring-accent/50">
                    <option value="">Selecionar...</option>
                    {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/30">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary/60 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold gold-gradient text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Dados
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default LeadEditModal;
