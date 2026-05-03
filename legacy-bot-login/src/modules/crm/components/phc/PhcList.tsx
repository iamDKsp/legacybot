import { useState } from "react";
import { motion } from "framer-motion";
import {
  FileText, Scroll, Scale, Loader2, AlertCircle, Trash2, Filter,
  User, Hash, Calendar, Download, CheckCircle2
} from "lucide-react";
import { phcApi, PhcDocument, PhcDocType, PhcStatus } from "@/services/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PhcDetailModal } from "./PhcDetailModal";

const DOC_TYPE_LABELS: Record<PhcDocType, { label: string; icon: React.ReactNode; color: string }> = {
  procuracao:       { label: "Procuração",  icon: <Scroll className="h-3.5 w-3.5" />,   color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  declaracao_hipo:  { label: "Decl. Hipo.", icon: <Scale className="h-3.5 w-3.5" />,    color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
  contrato:         { label: "Contrato",    icon: <FileText className="h-3.5 w-3.5" />, color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
};

const STATUS_LABELS: Record<PhcStatus, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "text-muted-foreground bg-secondary border-border/40" },
  salvo:    { label: "Salvo",    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  baixado:  { label: "Baixado",  color: "text-accent bg-accent/10 border-accent/30" },
};

export function PhcList() {
  const qc = useQueryClient();
  const [funnelFilter, setFunnelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [deletingId,   setDeletingId]   = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<number>>(new Set());
  const [selectedDoc,  setSelectedDoc]  = useState<PhcDocument | null>(null);

  const { data: docs = [], isLoading, error } = useQuery({
    queryKey: ["phc-documents", funnelFilter, statusFilter],
    queryFn: () =>
      phcApi
        .getDocuments({
          funnel_slug: funnelFilter || undefined,
          status: statusFilter || undefined,
        })
        .then((r) => r.data.data),
  });

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Remover este PHC?")) return;
    setDeletingId(id);
    try {
      await phcApi.deleteDocument(id);
      qc.invalidateQueries({ queryKey: ["phc-documents"] });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = async (doc: PhcDocument, e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloadingId === doc.id) return;
    setDownloadingId(doc.id);
    try {
      const res  = await phcApi.downloadPdf(doc.id);
      const blob = new Blob([res.data as BlobPart], { type: "application/pdf" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `PHC_${doc.doc_type}_${doc.lead_name ?? "cliente"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadedIds(prev => new Set(prev).add(doc.id));
      qc.invalidateQueries({ queryKey: ["phc-documents"] });
    } catch {
      alert("Erro ao baixar o PDF. Tente novamente.");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleUpdateStatus = async (id: number, status: PhcStatus, e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    try {
      await phcApi.updateStatus(id, status);
      qc.invalidateQueries({ queryKey: ["phc-documents"] });
    } catch { /* silent */ }
  };

  return (
    <>
      <div className="flex flex-col gap-4 p-4 pb-24 overflow-y-auto h-full">
        {/* Header + Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            <h2 className="text-base font-semibold text-card-foreground">PHCs Salvos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {docs.length} documento{docs.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <select
              value={funnelFilter}
              onChange={(e) => setFunnelFilter(e.target.value)}
              className="rounded-lg border border-border bg-muted py-1.5 px-3 text-xs text-card-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="">Todos os funis</option>
              <option value="trabalhista">Trabalhista</option>
              <option value="negativado">Negativado</option>
              <option value="golpe-pix">Golpe Pix</option>
              <option value="golpe-cibernetico">Golpe Cibernético</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-border bg-muted py-1.5 px-3 text-xs text-card-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="">Todos os status</option>
              <option value="rascunho">Rascunho</option>
              <option value="salvo">Salvo</option>
              <option value="baixado">Baixado</option>
            </select>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-accent" />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="flex flex-1 items-center justify-center flex-col gap-2 text-sm text-red-400">
            <AlertCircle className="h-8 w-8" />
            <p>Erro ao carregar PHCs.</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && docs.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border/40 bg-muted">
              <FileText className="h-7 w-7 opacity-40" />
            </div>
            <div className="text-center">
              <p className="font-medium text-sm">Nenhum PHC encontrado</p>
              <p className="text-xs mt-1 opacity-60">Crie um na aba "Nova PHC"</p>
            </div>
          </div>
        )}

        {/* Table */}
        {!isLoading && !error && docs.length > 0 && (
          <div className="rounded-xl border border-border/40 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-secondary/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Advogado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Documento</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Data</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {docs.map((doc: PhcDocument, i: number) => {
                  const dt = DOC_TYPE_LABELS[doc.doc_type];
                  const st = STATUS_LABELS[doc.status];
                  const isDownloading = downloadingId === doc.id;
                  const wasDownloaded = downloadedIds.has(doc.id);
                  return (
                    <motion.tr
                      key={doc.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => setSelectedDoc(doc)}
                      className="bg-card hover:bg-secondary/20 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary shrink-0">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium text-card-foreground text-xs">{doc.lead_name}</p>
                            {doc.lead_cpf && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">CPF: {doc.lead_cpf}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div>
                          <p className="text-xs text-card-foreground">{doc.lawyer_name}</p>
                          {doc.lawyer_oab && (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Hash className="h-2.5 w-2.5" />{doc.lawyer_oab}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium ${dt.color}`}>
                          {dt.icon} {dt.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={doc.status}
                          onChange={(e) => handleUpdateStatus(doc.id, e.target.value as PhcStatus, e)}
                          onClick={e => e.stopPropagation()}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-accent/50 bg-transparent cursor-pointer ${st.color}`}
                        >
                          <option value="rascunho">Rascunho</option>
                          <option value="salvo">Salvo</option>
                          <option value="baixado">Baixado</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Download button */}
                          <button
                            onClick={(e) => handleDownload(doc, e)}
                            disabled={isDownloading}
                            title="Baixar PDF"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                          >
                            {isDownloading
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : wasDownloaded
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                              : <Download className="h-3.5 w-3.5" />
                            }
                          </button>
                          {/* Delete button */}
                          <button
                            onClick={(e) => handleDelete(doc.id, e)}
                            disabled={deletingId === doc.id}
                            title="Remover PHC"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                          >
                            {deletingId === doc.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />
                            }
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedDoc && (
        <PhcDetailModal doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
      )}
    </>
  );
}

export default PhcList;
