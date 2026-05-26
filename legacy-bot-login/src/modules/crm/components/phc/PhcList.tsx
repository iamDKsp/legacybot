import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Scroll, Scale, Loader2, AlertCircle, Trash2, Filter,
  User, Hash, Calendar, Download, CheckCircle2, ChevronDown, Check,
  Folder, FolderOpen, ArrowLeft, CheckSquare, List, FolderClosed
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

// ── Custom Filter Dropdown ────────────────────────────────────────────────────
interface FilterOption { value: string; label: string }

interface FilterDropdownProps {
  value: string;
  onChange: (v: string) => void;
  options: FilterOption[];
  placeholder: string;
}

function FilterDropdown({ value, onChange, options, placeholder }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className={[
          "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium",
          "border transition-all duration-200 select-none",
          open
            ? "border-accent/60 bg-accent/10 text-accent shadow-[0_0_0_3px_hsl(var(--accent)/0.12)]"
            : "border-border bg-card text-card-foreground hover:border-accent/40 hover:bg-secondary/60",
        ].join(" ")}
      >
        <span>{selected?.label ?? placeholder}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full mt-2 z-50 min-w-[170px] rounded-xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/30 overflow-hidden"
          >
            <div className="p-1.5 flex flex-col gap-0.5">
              {options.map((opt) => {
                const isActive = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    className={[
                      "flex items-center justify-between gap-3 w-full px-3 py-2 rounded-lg text-xs font-medium",
                      "transition-all duration-150 text-left",
                      isActive
                        ? "bg-accent/15 text-accent"
                        : "text-card-foreground hover:bg-secondary/70 hover:text-foreground",
                    ].join(" ")}
                  >
                    <span>{opt.label}</span>
                    {isActive && <Check className="h-3 w-3 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Opções dos filtros ────────────────────────────────────────────────────────
const FUNNEL_OPTIONS: FilterOption[] = [
  { value: "", label: "Todos os funis" },
  { value: "trabalhista", label: "Trabalhista" },
  { value: "negativado", label: "Negativado" },
  { value: "golpe-pix", label: "Golpe Pix" },
  { value: "golpe-cibernetico", label: "Golpe Cibernético" },
];

const STATUS_OPTIONS: FilterOption[] = [
  { value: "", label: "Todos os status" },
  { value: "rascunho", label: "Rascunho" },
  { value: "salvo", label: "Salvo" },
  { value: "baixado", label: "Baixado" },
];

// ── PhcList ───────────────────────────────────────────────────────────────────
export function PhcList() {
  const qc = useQueryClient();
  const [funnelFilter, setFunnelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [deletingId,   setDeletingId]   = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<number>>(new Set());
  const [selectedDoc,  setSelectedDoc]  = useState<PhcDocument | null>(null);

  // Folder Navigation and Bulk Selection states
  const [viewMode, setViewMode] = useState<'folders' | 'list'>('folders');
  const [activeFolderKey, setActiveFolderKey] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set());
  const [downloadingBulk, setDownloadingBulk] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);

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
      setSelectedDocIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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

  // Group docs by clientKey (CPF if exists, else normalized name) to prevent duplicate folders for same client
  const clientFoldersMap = docs.reduce((acc: Record<string, { lead_name: string; lead_cpf?: string|null; funnel_slug?: string|null; docs: PhcDocument[] }>, doc: PhcDocument) => {
    const folderKey = doc.lead_cpf ? `cpf:${doc.lead_cpf}` : `name:${String(doc.lead_name).trim().toLowerCase()}`;
    if (!acc[folderKey]) {
      acc[folderKey] = {
        lead_name: doc.lead_name || "Cliente Sem Nome",
        lead_cpf: doc.lead_cpf,
        funnel_slug: doc.funnel_slug,
        docs: []
      };
    }
    acc[folderKey].docs.push(doc);
    return acc;
  }, {});

  const folders = Object.keys(clientFoldersMap).map((folderKey) => {
    return {
      key: folderKey,
      ...clientFoldersMap[folderKey]
    };
  });

  // Filter docs for internal folder view
  const visibleDocs = activeFolderKey !== null
    ? docs.filter((d: PhcDocument) => {
        const key = d.lead_cpf ? `cpf:${d.lead_cpf}` : `name:${String(d.lead_name).trim().toLowerCase()}`;
        return key === activeFolderKey;
      })
    : docs;

  // Selection helpers
  const toggleSelectDoc = (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (currentDocs: PhcDocument[]) => {
    const allSelected = currentDocs.every((d) => selectedDocIds.has(d.id));
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        currentDocs.forEach((d) => next.delete(d.id));
      } else {
        currentDocs.forEach((d) => next.add(d.id));
      }
      return next;
    });
  };

  // Folder level operations (Bulk)
  const handleDownloadFolder = async (folderDocs: PhcDocument[], e: React.MouseEvent) => {
    e.stopPropagation();
    if (downloadingBulk) return;
    setDownloadingBulk(true);
    for (const doc of folderDocs) {
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
      } catch (err) {
        console.error("Erro ao baixar documento", doc.id, err);
      }
      // Small sequential delay to avoid browser blocking sequential popups
      await new Promise((r) => setTimeout(r, 600));
    }
    setDownloadingBulk(false);
    qc.invalidateQueries({ queryKey: ["phc-documents"] });
  };

  const handleDeleteFolder = async (folderDocs: PhcDocument[], clientName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Remover todos os ${folderDocs.length} documentos da pasta de "${clientName}"?`)) return;
    setDeletingBulk(true);
    try {
      await Promise.all(folderDocs.map((d) => phcApi.deleteDocument(d.id)));
      qc.invalidateQueries({ queryKey: ["phc-documents"] });
    } catch (err) {
      console.error("Erro ao deletar documentos", err);
      alert("Erro ao excluir pasta.");
    } finally {
      setDeletingBulk(false);
    }
  };

  // Bulk operation actions (Floating Bar)
  const handleBulkDownload = async () => {
    if (downloadingBulk) return;
    setDownloadingBulk(true);
    const ids = Array.from(selectedDocIds);
    for (const id of ids) {
      const doc = docs.find((d) => d.id === id);
      if (!doc) continue;
      try {
        const res  = await phcApi.downloadPdf(id);
        const blob = new Blob([res.data as BlobPart], { type: "application/pdf" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `PHC_${doc.doc_type}_${doc.lead_name ?? "cliente"}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        setDownloadedIds(prev => new Set(prev).add(id));
      } catch (err) {
        console.error("Erro ao baixar documento", id, err);
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    setDownloadingBulk(false);
    setSelectedDocIds(new Set());
    qc.invalidateQueries({ queryKey: ["phc-documents"] });
  };

  const handleBulkDelete = async () => {
    if (deletingBulk) return;
    if (!confirm(`Excluir permanentemente os ${selectedDocIds.size} documentos selecionados?`)) return;
    setDeletingBulk(true);
    const ids = Array.from(selectedDocIds);
    let successCount = 0;
    try {
      for (const id of ids) {
        await phcApi.deleteDocument(id);
        successCount++;
        // Remover do set de selecionados conforme deleta com sucesso
        setSelectedDocIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
      qc.invalidateQueries({ queryKey: ["phc-documents"] });
    } catch (err) {
      console.error("Erro ao deletar em lote:", err);
      alert(`Erro ao excluir alguns documentos. Sucesso em ${successCount} de ${ids.length}. Tente novamente.`);
      qc.invalidateQueries({ queryKey: ["phc-documents"] });
    } finally {
      setDeletingBulk(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-5 p-4 pb-24 overflow-y-auto h-full w-full">
        {/* Header + Filters + Mode Switcher */}
        <div className="flex flex-col gap-4 border-b border-border/10 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              {/* Folder Breadcrumbs or Standard Title */}
              {viewMode === 'folders' && activeFolderKey !== null ? (
                <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground select-none">
                  <button
                    onClick={() => { setActiveFolderKey(null); setSelectedDocIds(new Set()); }}
                    className="hover:text-accent transition-colors flex items-center gap-1.5"
                  >
                    <Folder className="h-4 w-4 text-accent" /> PHCs Salvos
                  </button>
                  <span>/</span>
                  <span className="text-card-foreground flex items-center gap-1.5 bg-accent/15 border border-accent/20 px-2.5 py-0.5 rounded-lg text-accent font-bold">
                    <FolderOpen className="h-4 w-4" /> {clientFoldersMap[activeFolderKey]?.lead_name}
                  </span>
                </div>
              ) : (
                <div>
                  <h2 className="text-base font-semibold text-card-foreground">PHCs Salvos</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {viewMode === 'folders'
                      ? `${folders.length} pasta${folders.length !== 1 ? "s" : ""} de cliente`
                      : `${docs.length} documento${docs.length !== 1 ? "s" : ""}`
                    }
                  </p>
                </div>
              )}
            </div>

            {/* Mode Switcher + Filters */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Toggle switch between folders and flat list */}
              <div className="flex items-center p-1 rounded-xl bg-secondary/40 border border-border/30 shrink-0 select-none">
                <button
                  onClick={() => { setViewMode('folders'); setActiveFolderKey(null); setSelectedDocIds(new Set()); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    viewMode === 'folders'
                      ? 'bg-accent text-black shadow font-bold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                  }`}
                >
                  <FolderClosed className="h-3.5 w-3.5" />
                  Pastas
                </button>
                <button
                  onClick={() => { setViewMode('list'); setActiveFolderKey(null); setSelectedDocIds(new Set()); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    viewMode === 'list'
                      ? 'bg-accent text-black shadow font-bold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                  Lista Geral
                </button>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                <FilterDropdown
                  value={funnelFilter}
                  onChange={setFunnelFilter}
                  options={FUNNEL_OPTIONS}
                  placeholder="Todos os funis"
                />
                <FilterDropdown
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={STATUS_OPTIONS}
                  placeholder="Todos os status"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-accent" />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="flex flex-1 items-center justify-center flex-col gap-2 text-sm text-red-400 py-20">
            <AlertCircle className="h-8 w-8" />
            <p>Erro ao carregar PHCs.</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && docs.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border/40 bg-muted">
              <FileText className="h-7 w-7 opacity-40" />
            </div>
            <div className="text-center">
              <p className="font-medium text-sm">Nenhum PHC encontrado</p>
              <p className="text-xs mt-1 opacity-60">Crie um na aba "Nova PHC"</p>
            </div>
          </div>
        )}

        {/* FOLDERS GRID MODE */}
        {!isLoading && !error && viewMode === 'folders' && activeFolderKey === null && folders.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-in fade-in duration-300">
            {folders.map((folder) => (
              <div
                key={folder.key}
                onClick={() => setActiveFolderKey(folder.key)}
                className="group relative flex flex-col justify-between rounded-2xl border border-border/40 bg-card p-5 hover:border-accent/50 hover:bg-secondary/10 hover:shadow-xl hover:shadow-accent/5 transition-all duration-300 cursor-pointer overflow-hidden min-h-[145px]"
              >
                {/* Card top */}
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 border border-accent/20 text-accent group-hover:scale-105 transition-transform">
                    <Folder className="h-6 w-6 shrink-0" />
                  </div>
                  {/* Folder Quick Actions */}
                  <div className="opacity-0 group-hover:opacity-100 flex gap-1.5 transition-all duration-200 select-none z-10">
                    <button
                      onClick={(e) => handleDownloadFolder(folder.docs, e)}
                      disabled={downloadingBulk}
                      title="Baixar todos os documentos desta pasta"
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/25 text-accent hover:bg-accent/40 border border-accent/40 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteFolder(folder.docs, folder.lead_name, e)}
                      disabled={deletingBulk}
                      title="Excluir esta pasta inteira"
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/35 border border-red-500/30 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Card bottom */}
                <div className="mt-4">
                  <h4 className="font-bold text-sm text-card-foreground line-clamp-1 group-hover:text-accent transition-colors">
                    {folder.lead_name}
                  </h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5 font-medium tracking-wide">
                    {folder.lead_cpf ? `CPF: ${folder.lead_cpf}` : "CPF não informado"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-3">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-accent/15 border border-accent/20 text-accent">
                      {folder.docs.length} documento{folder.docs.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DETAILS TABLE MODE (Flat List or inside specific client folder) */}
        {!isLoading && !error && docs.length > 0 && (viewMode === 'list' || activeFolderKey !== null) && (
          <div className="rounded-xl border border-border/40 overflow-hidden bg-card animate-in fade-in duration-300">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 bg-secondary/30">
                  {/* Bulk Checkbox Column */}
                  <th className="px-4 py-3 text-left w-10">
                    <button
                      onClick={() => toggleSelectAll(visibleDocs)}
                      className="flex items-center justify-center h-4 w-4 text-muted-foreground hover:text-accent transition-colors"
                    >
                      {visibleDocs.length > 0 && visibleDocs.every(d => selectedDocIds.has(d.id)) ? (
                        <CheckSquare className="h-4 w-4 text-accent animate-in zoom-in-50 duration-200" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded border border-border/70 hover:border-accent transition-colors" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Advogado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Documento</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Data</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {visibleDocs.map((doc: PhcDocument, i: number) => {
                  const dt = DOC_TYPE_LABELS[doc.doc_type];
                  const st = STATUS_LABELS[doc.status];
                  const isDownloading = downloadingId === doc.id;
                  const wasDownloaded = downloadedIds.has(doc.id);
                  const isSelected = selectedDocIds.has(doc.id);
                  return (
                    <motion.tr
                      key={doc.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => setSelectedDoc(doc)}
                      className={`transition-colors cursor-pointer border-b border-border/10 last:border-0 ${
                        isSelected
                          ? "bg-accent/5 hover:bg-accent/10"
                          : "bg-card hover:bg-secondary/20"
                      }`}
                    >
                      {/* Checkbox column */}
                      <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => toggleSelectDoc(doc.id)}
                          className="flex items-center justify-center h-4 w-4 text-muted-foreground hover:text-accent transition-colors"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-accent animate-in zoom-in-50 duration-200" />
                          ) : (
                            <div className="h-3.5 w-3.5 rounded border border-border/70 hover:border-accent transition-colors" />
                          )}
                        </button>
                      </td>

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
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <select
                          value={doc.status}
                          onChange={(e) => handleUpdateStatus(doc.id, e.target.value as PhcStatus, e)}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-accent/50 bg-card cursor-pointer select-none ${st.color}`}
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
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
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
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400 animate-in zoom-in-50 duration-300" />
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

      {/* Floating Bulk Actions Bar */}
      <AnimatePresence>
        {selectedDocIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-3.5 rounded-2xl border border-accent/30 bg-card/90 backdrop-blur-xl shadow-2xl shadow-black/50"
          >
            <div className="flex items-center gap-2 border-r border-border/40 pr-4">
              <span className="text-xs font-bold text-accent px-2 py-0.5 rounded-lg bg-accent/15 font-mono">
                {selectedDocIds.size}
              </span>
              <span className="text-xs font-semibold text-muted-foreground select-none">
                item{selectedDocIds.size !== 1 ? "ns" : ""} selecionado{selectedDocIds.size !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkDownload}
                disabled={downloadingBulk}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-black bg-accent hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
              >
                {downloadingBulk ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Baixar Selecionados
              </button>

              <button
                onClick={handleBulkDelete}
                disabled={deletingBulk}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-all disabled:opacity-50 shrink-0"
              >
                {deletingBulk ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Excluir Selecionados
              </button>

              <button
                onClick={() => setSelectedDocIds(new Set())}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground px-2 py-1 transition-colors select-none"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      {selectedDoc && (
        <PhcDetailModal doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
      )}
    </>
  );
}

export default PhcList;
