import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, User, Hash, Mail, Phone, MapPin, FileText, Save, Loader2 } from "lucide-react";
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

export function LawyerForm({ lawyer, onClose }: LawyerFormProps) {
  const qc = useQueryClient();
  const isEdit = !!lawyer;

  const [form, setForm] = useState({
    name: lawyer?.name ?? "",
    oab: lawyer?.oab ?? "",
    cpf: lawyer?.cpf ?? "",
    email: lawyer?.email ?? "",
    phone: lawyer?.phone ?? "",
    address: lawyer?.address ?? "",
    city: lawyer?.city ?? "",
    state: lawyer?.state ?? "",
    additional_info: lawyer?.additional_info ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.oab.trim()) {
      setError("Nome e OAB são obrigatórios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        await phcApi.updateLawyer(lawyer!.id, form);
      } else {
        await phcApi.createLawyer(form);
      }
      qc.invalidateQueries({ queryKey: ["phc-lawyers"] });
      onClose();
    } catch {
      setError("Erro ao salvar advogado. Tente novamente.");
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
        onClick={(e) => e.target === e.currentTarget && onClose()}
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
                <User className="h-4 w-4 text-primary-foreground" />
              </div>
              <h2 className="text-base font-semibold text-card-foreground">
                {isEdit ? "Editar Advogado" : "Novo Advogado"}
              </h2>
            </div>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* Name */}
              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Nome Completo *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Dr. João da Silva"
                    className="w-full rounded-lg border border-border bg-muted py-2.5 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
              </div>

              {/* OAB */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  OAB *
                </label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    value={form.oab}
                    onChange={(e) => set("oab", e.target.value)}
                    placeholder="MG 123456"
                    className="w-full rounded-lg border border-border bg-muted py-2.5 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
              </div>

              {/* CPF */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  CPF
                </label>
                <input
                  value={form.cpf}
                  onChange={(e) => set("cpf", e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full rounded-lg border border-border bg-muted py-2.5 px-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>

              {/* Email */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="advogado@escritorio.com"
                    className="w-full rounded-lg border border-border bg-muted py-2.5 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Telefone
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="(31) 99999-0000"
                    className="w-full rounded-lg border border-border bg-muted py-2.5 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
              </div>

              {/* Address */}
              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Endereço
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                    placeholder="Rua das Flores, 123"
                    className="w-full rounded-lg border border-border bg-muted py-2.5 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
              </div>

              {/* City */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Cidade
                </label>
                <input
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  placeholder="Belo Horizonte"
                  className="w-full rounded-lg border border-border bg-muted py-2.5 px-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>

              {/* State */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Estado
                </label>
                <select
                  value={form.state}
                  onChange={(e) => set("state", e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted py-2.5 px-4 text-sm text-card-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
                >
                  <option value="">Selecionar...</option>
                  {ESTADOS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Additional Info */}
              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Informações Adicionais / Cláusulas
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <textarea
                    value={form.additional_info}
                    onChange={(e) => set("additional_info", e.target.value)}
                    placeholder="Cláusulas especiais, notas gerais sobre o advogado..."
                    rows={3}
                    className="w-full rounded-lg border border-border bg-muted py-2.5 pl-9 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/30">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary/60 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold gold-gradient text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isEdit ? "Salvar Alterações" : "Cadastrar Advogado"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default LawyerForm;
