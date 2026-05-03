import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Download, User, Briefcase, FileText, Hash,
  MapPin, Phone, Mail, Loader2, CheckCircle2
} from "lucide-react";
import { phcApi, PhcDocument } from "@/services/api";
import { useQueryClient } from "@tanstack/react-query";

interface PhcDetailModalProps {
  doc: PhcDocument;
  onClose: () => void;
}

const DOC_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  procuracao:      { label: "Procuração",                    color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  declaracao_hipo: { label: "Decl. de Hipossuficiência",     color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  contrato:        { label: "Contrato de Honorários",         color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "bg-secondary text-muted-foreground" },
  salvo:    { label: "Salvo",    color: "bg-green-500/15 text-green-400" },
  baixado:  { label: "Baixado",  color: "bg-accent/15 text-accent" },
};

function Row({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg bg-secondary/40 px-3 py-2.5">
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

export function PhcDetailModal({ doc, onClose }: PhcDetailModalProps) {
  const qc = useQueryClient();
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const docMeta  = DOC_TYPE_LABELS[doc.doc_type] ?? { label: doc.doc_type, color: "bg-secondary text-foreground" };
  const statusMeta = STATUS_LABELS[doc.status] ?? STATUS_LABELS.rascunho;

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await phcApi.downloadPdf(doc.id);
      const blob = new Blob([res.data as BlobPart], { type: "application/pdf" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `PHC_${doc.doc_type}_${doc.lead_name ?? "cliente"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloaded(true);
      qc.invalidateQueries({ queryKey: ["phc-documents"] });
    } catch {
      alert("Erro ao baixar o PDF. Tente novamente.");
    } finally {
      setDownloading(false);
    }
  };

  const leadAddress = [doc.lead_address, doc.lead_city, doc.lead_state].filter(Boolean).join(", ");
  const lawyerAddress = [doc.lawyer_address, doc.lawyer_city, doc.lawyer_state].filter(Boolean).join(", ");

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
          className="w-full max-w-lg rounded-2xl border border-border/40 bg-card shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/30">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg gold-gradient">
                <FileText className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-card-foreground">{docMeta.label}</h2>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${docMeta.color}`}>
                    {doc.doc_type.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                  {" · "}
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusMeta.color}`}>
                    {statusMeta.label}
                  </span>
                </p>
              </div>
            </div>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Cliente */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Cliente
              </p>
              <div className="space-y-1.5">
                <Row label="Nome"    value={doc.lead_name}  icon={<User className="h-3.5 w-3.5" />} />
                <Row label="CPF"     value={doc.lead_cpf}   icon={<Hash className="h-3.5 w-3.5" />} />
                <Row label="RG"      value={doc.lead_rg}    icon={<Hash className="h-3.5 w-3.5" />} />
                <Row label="Telefone" value={doc.lead_phone} icon={<Phone className="h-3.5 w-3.5" />} />
                <Row label="E-mail"  value={doc.lead_email} icon={<Mail className="h-3.5 w-3.5" />} />
                {leadAddress && <Row label="Endereço" value={leadAddress} icon={<MapPin className="h-3.5 w-3.5" />} />}
              </div>
            </div>

            {/* Advogado */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" /> Advogado
              </p>
              <div className="space-y-1.5">
                <Row label="Nome"   value={doc.lawyer_name} icon={<User className="h-3.5 w-3.5" />} />
                <Row label="OAB"    value={doc.lawyer_oab}  icon={<Hash className="h-3.5 w-3.5" />} />
                <Row label="CPF"    value={doc.lawyer_cpf}  icon={<Hash className="h-3.5 w-3.5" />} />
                {lawyerAddress && <Row label="Cidade/UF" value={lawyerAddress} icon={<MapPin className="h-3.5 w-3.5" />} />}
              </div>
            </div>

            {/* Notas */}
            {doc.notes && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Observações</p>
                <p className="text-sm text-muted-foreground bg-secondary/40 rounded-lg p-3 leading-relaxed">{doc.notes}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/30">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary/60 transition-colors">
              Fechar
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold gold-gradient text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : downloaded ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {downloaded ? "Baixado!" : "Baixar PDF"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default PhcDetailModal;
