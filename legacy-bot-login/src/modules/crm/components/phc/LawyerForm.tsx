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
    // endereço dividido (v2)
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

  const inputBase = "w-full rounded-xl bg-secondary/40 border border-border px-4 py-3 text-sm text-card-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50 transition-all";
  const label = "block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5";

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
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-2xl border border-border/60 bg-card shadow-2xl shadow-black/40 overflow-y-auto max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl gold-gradient shadow">
                <User className="h-4 w-4 text-primary-foreground" />
              </div>
              <h2 className="text-base font-bold text-card-foreground">
                {isEdit ? "Editar Advogado" : "Novo Advogado"}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Nome completo */}
            <div>
              <label className={label}>Nome Completo *</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <input
                  className={inputBase + " pl-10"}
                  placeholder="Dr. João da Silva"
                  value={form.name}
                  onChange={e => set("name", e.target.value)}
                />
              </div>
            </div>

            {/* OAB + CPF */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>OAB *</label>
                <div className="relative">
                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                  <input
                    className={inputBase + " pl-10"}
                    placeholder="MG 123456"
                    value={form.oab}
                    onChange={e => set("oab", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className={label}>CPF</label>
                <input
                  className={inputBase}
                  placeholder="000.000.000-00"
                  value={form.cpf}
                  onChange={e => set("cpf", e.target.value)}
                />
              </div>
            </div>

            {/* E-mail + Telefone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                  <input
                    className={inputBase + " pl-10"}
                    placeholder="advogado@escritorio.com"
                    type="email"
                    value={form.email}
                    onChange={e => set("email", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className={label}>Telefone</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                  <input
                    className={inputBase + " pl-10"}
                    placeholder="(31) 99999-0000"
                    type="tel"
                    value={form.phone}
                    onChange={e => set("phone", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Separador — Endereço */}
            <div className="flex items-center gap-3 pt-1">
              <MapPin className="h-3.5 w-3.5 text-accent shrink-0" />
              <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Endereço</span>
              <div className="flex-1 h-px bg-border/40" />
            </div>

            {/* CEP */}
            <div>
              <label className={label}>CEP</label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <input
                  className={inputBase + " pl-10 pr-10"}
                  placeholder="00000-000"
                  value={form.cep}
                  onChange={e => set("cep", formatCep(e.target.value))}
                  onBlur={handleCepBlur}
                  maxLength={9}
                />
                {cepLoading && (
                  <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-accent" />
                )}
                {!cepLoading && (
                  <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-1">Digite o CEP para preenchimento automático</p>
            </div>

            {/* Rua + Número */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className={label}>Rua / Logradouro</label>
                <input
                  className={inputBase}
                  placeholder="Rua das Flores"
                  value={form.street}
                  onChange={e => set("street", e.target.value)}
                />
              </div>
              <div>
                <label className={label}>Número</label>
                <input
                  className={inputBase}
                  placeholder="123"
                  value={form.street_number}
                  onChange={e => set("street_number", e.target.value)}
                />
              </div>
            </div>

            {/* Bairro + Complemento */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Bairro</label>
                <input
                  className={inputBase}
                  placeholder="Centro"
                  value={form.neighborhood}
                  onChange={e => set("neighborhood", e.target.value)}
                />
              </div>
              <div>
                <label className={label}>Complemento</label>
                <input
                  className={inputBase}
                  placeholder="Sala 201, Apto..."
                  value={form.complement}
                  onChange={e => set("complement", e.target.value)}
                />
              </div>
            </div>

            {/* Cidade + Estado */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Cidade</label>
                <input
                  className={inputBase}
                  placeholder="Belo Horizonte"
                  value={form.city}
                  onChange={e => set("city", e.target.value)}
                />
              </div>
              <div>
                <label className={label}>Estado</label>
                <select
                  className={inputBase + " cursor-pointer"}
                  value={form.state}
                  onChange={e => set("state", e.target.value)}
                >
                  <option value="">Selecionar...</option>
                  {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Informações adicionais */}
            <div>
              <label className={label}>Informações Adicionais / Cláusulas</label>
              <div className="relative">
                <FileText className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60" />
                <textarea
                  className={inputBase + " pl-10 resize-none min-h-[80px]"}
                  placeholder="Cláusulas especiais, notas gerais sobre o advogado..."
                  value={form.additional_info}
                  onChange={e => set("additional_info", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/40 bg-secondary/20">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-secondary/60 transition-colors"
            >
              Cancelar
            </button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {saving
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />
              }
              {isEdit ? "Salvar Alterações" : "Cadastrar Advogado"}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default LawyerForm;
