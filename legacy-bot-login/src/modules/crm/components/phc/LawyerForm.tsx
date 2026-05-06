import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Hash, Mail, Phone, MapPin, FileText, Save, Loader2, Search } from "lucide-react";
import { phcApi, Lawyer } from "@/services/api";
import { useQueryClient } from "@tanstack/react-query";

interface LawyerFormProps {
  lawyer?: Lawyer;
  onClose: () => void;
}

const ESTADOS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

function formatCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return digits;
}

export function LawyerForm({ lawyer, onClose }: LawyerFormProps) {
  const qc = useQueryClient();
  const isEdit = !!lawyer;

  const [form, setForm] = useState({
    name: lawyer?.name ?? "",
    oab: lawyer?.oab ?? "",
    cpf: lawyer?.cpf ?? "",
    email: lawyer?.email ?? "",
    phone: lawyer?.phone ?? "",
    cep: (lawyer as any)?.cep ?? "",
    street: (lawyer as any)?.street ?? "",
    street_number: (lawyer as any)?.street_number ?? "",
    neighborhood: (lawyer as any)?.neighborhood ?? "",
    complement: (lawyer as any)?.complement ?? "",
    city: lawyer?.city ?? "",
    state: lawyer?.state ?? "",
    additional_info: lawyer?.additional_info ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [cepLoading, setCepLoading] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleCepBlur = async () => {
    const digits = form.cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm(f => ({
          ...f,
          street: data.logradouro || f.street,
          neighborhood: data.bairro || f.neighborhood,
          city: data.localidade || f.city,
          state: data.uf || f.state,
        }));
      }
    } catch { /* silent */ }
    finally { setCepLoading(false); }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.oab.trim()) {
      setError("Nome e OAB são obrigatórios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        await phcApi.updateLawyer(lawyer!.id, form as any);
      } else {
        await phcApi.createLawyer(form as any);
      }
      qc.invalidateQueries({ queryKey: ["phc-lawyers"] });
      onClose();
    } catch {
      setError("Erro ao salvar advogado. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  // Compact input style
  const inp = "w-full rounded-lg bg-secondary/50 border border-border/60 px-3 py-2 text-sm text-card-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/40 transition-all";
  const lbl = "block text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl rounded-2xl border border-border/60 bg-card shadow-2xl shadow-black/40"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl gold-gradient shadow">
                <User className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <h2 className="text-sm font-bold text-card-foreground">
                {isEdit ? "Editar Advogado" : "Novo Advogado"}
              </h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5">
            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400 mb-4"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── 2-column layout ───────────────────────────────── */}
            <div className="grid grid-cols-2 gap-x-5 gap-y-3">

              {/* ── LEFT COLUMN — Identificação ─────────────────── */}
              <div className="space-y-3">
                <p className="text-[9px] font-bold text-accent/80 uppercase tracking-widest flex items-center gap-1.5">
                  <User className="h-2.5 w-2.5" /> Identificação
                </p>

                {/* Nome */}
                <div>
                  <label className={lbl}>Nome Completo *</label>
                  <div className="relative">
                    <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                    <input className={inp + " pl-8"} placeholder="Dr. João da Silva" value={form.name} onChange={e => set("name", e.target.value)} />
                  </div>
                </div>

                {/* OAB + CPF inline */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>OAB *</label>
                    <div className="relative">
                      <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                      <input className={inp + " pl-8"} placeholder="MG 123456" value={form.oab} onChange={e => set("oab", e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className={lbl}>CPF</label>
                    <input className={inp} placeholder="000.000.000-00" value={form.cpf} onChange={e => set("cpf", e.target.value)} />
                  </div>
                </div>

                {/* E-mail */}
                <div>
                  <label className={lbl}>E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                    <input className={inp + " pl-8"} placeholder="advogado@escritorio.com" type="email" value={form.email} onChange={e => set("email", e.target.value)} />
                  </div>
                </div>

                {/* Telefone */}
                <div>
                  <label className={lbl}>Telefone</label>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                    <input className={inp + " pl-8"} placeholder="(31) 99999-0000" type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} />
                  </div>
                </div>

                {/* Cláusulas */}
                <div>
                  <label className={lbl}>Cláusulas / Observações</label>
                  <div className="relative">
                    <FileText className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/50" />
                    <textarea
                      className={inp + " pl-8 resize-none"}
                      placeholder="Cláusulas especiais, notas gerais..."
                      rows={3}
                      value={form.additional_info}
                      onChange={e => set("additional_info", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* ── RIGHT COLUMN — Endereço ─────────────────────── */}
              <div className="space-y-3">
                <p className="text-[9px] font-bold text-accent/80 uppercase tracking-widest flex items-center gap-1.5">
                  <MapPin className="h-2.5 w-2.5" /> Endereço
                </p>

                {/* CEP */}
                <div>
                  <label className={lbl}>CEP</label>
                  <div className="relative">
                    <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                    <input
                      className={inp + " pl-8 pr-8"}
                      placeholder="00000-000"
                      value={form.cep}
                      onChange={e => set("cep", formatCep(e.target.value))}
                      onBlur={handleCepBlur}
                      maxLength={9}
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      {cepLoading
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                        : <Search className="h-3.5 w-3.5 text-muted-foreground/30" />
                      }
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground/40 mt-0.5">Auto-preenchimento via CEP</p>
                </div>

                {/* Rua + Número */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className={lbl}>Rua / Logradouro</label>
                    <input className={inp} placeholder="Rua das Flores" value={form.street} onChange={e => set("street", e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>Nº</label>
                    <input className={inp} placeholder="123" value={form.street_number} onChange={e => set("street_number", e.target.value)} />
                  </div>
                </div>

                {/* Bairro + Complemento */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={lbl}>Bairro</label>
                    <input className={inp} placeholder="Centro" value={form.neighborhood} onChange={e => set("neighborhood", e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>Complemento</label>
                    <input className={inp} placeholder="Sala 201" value={form.complement} onChange={e => set("complement", e.target.value)} />
                  </div>
                </div>

                {/* Cidade + Estado */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className={lbl}>Cidade</label>
                    <input className={inp} placeholder="Belo Horizonte" value={form.city} onChange={e => set("city", e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>Estado</label>
                    <select className={inp + " cursor-pointer"} value={form.state} onChange={e => set("state", e.target.value)}>
                      <option value="">UF</option>
                      {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-border/40 bg-secondary/20 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs text-muted-foreground hover:bg-secondary/60 transition-colors">
              Cancelar
            </button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-accent text-accent-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {isEdit ? "Salvar Alterações" : "Cadastrar Advogado"}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default LawyerForm;
