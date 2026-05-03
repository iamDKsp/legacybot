import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Search,
  Eye,
  Download,
  X,
  User,
  Calendar,
  ChevronDown,
  Filter,
  ShieldCheck,
  Image,
  Loader2,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { databaseApi, VerifiedDoc } from "@/services/api";

// ── Helpers ───────────────────────────────────────────────────
const getFileTypeColor = (type: string) => {
  const ext = (type || "").toLowerCase().replace("image/", "").replace("jpeg", "jpg");
  switch (ext) {
    case "jpg":
      return "bg-amber-500/20 text-amber-400";
    case "png":
      return "bg-blue-500/20 text-blue-400";
    case "pdf":
      return "bg-red-500/20 text-red-400";
    default:
      return "bg-gray-500/20 text-gray-400";
  }
};

const getFileExt = (fileType?: string) => {
  if (!fileType) return "IMG";
  const clean = fileType.replace("image/", "").replace("jpeg", "jpg").toUpperCase();
  return clean.length <= 4 ? clean : "IMG";
};

const isImageType = (fileType?: string) => {
  return (fileType || "").startsWith("image/");
};

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString("pt-BR");
  } catch {
    return dateStr;
  }
};

// ── Document Card ─────────────────────────────────────────────
function DocumentCard({
  doc,
  index,
  onView,
}: {
  doc: VerifiedDoc;
  index: number;
  onView: (doc: VerifiedDoc) => void;
}) {
  const fileExt = getFileExt(doc.file_type);
  const funnelColor = doc.funnel_color || "#6366f1";
  const hasPreview = isImageType(doc.file_type) && !!doc.file_url;

  const handleDownload = () => {
    if (!doc.file_url) return;
    const link = document.createElement("a");
    link.href = doc.file_url;
    link.target = "_blank";
    link.download = `${doc.doc_type} - ${doc.lead_name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.35 }}
      className="group relative rounded-xl bg-card border border-border hover:border-primary/30 transition-all duration-300 overflow-hidden"
    >
      {/* Top section: thumbnail area */}
      <div className="relative h-36 bg-surface/50 flex items-center justify-center overflow-hidden">
        {hasPreview ? (
          <img
            src={doc.file_url!}
            alt={doc.doc_type}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-surface flex items-center justify-center border border-border">
            {isImageType(doc.file_type) ? (
              <Image className="w-8 h-8 text-muted-foreground/50" />
            ) : (
              <FileText className="w-8 h-8 text-muted-foreground/50" />
            )}
          </div>
        )}

        {/* File type badge */}
        <div
          className={`absolute top-3 left-3 px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider ${getFileTypeColor(doc.file_type || "")}`}
        >
          {fileExt}
        </div>

        {/* Status badge */}
        <div className="absolute top-3 right-3 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border bg-green-500/20 text-green-400 border-green-500/30">
          APROVADO
        </div>

        {/* Hover overlay */}
        {hasPreview && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        )}
      </div>

      {/* Content section */}
      <div className="p-4 space-y-3">
        {/* Title */}
        <h4 className="font-semibold text-foreground text-base">{doc.doc_type}</h4>

        {/* Owner */}
        <div className="flex items-center gap-2">
          <User className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{doc.lead_name}</span>
        </div>

        {/* Funnel tag + Date */}
        <div className="flex items-center justify-between">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium"
            style={{
              backgroundColor: `${funnelColor}15`,
              color: funnelColor,
            }}
          >
            <FileText className="w-3 h-3" />
            <span className="truncate max-w-[100px]">{doc.funnel_name || "Geral"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            {formatDate(doc.verified_at)}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onView(doc)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-surface hover:bg-surface-hover border border-border hover:border-primary/30 text-sm text-muted-foreground hover:text-foreground transition-all duration-200"
          >
            <Eye className="w-4 h-4" />
            Ver
          </button>
          <button
            onClick={handleDownload}
            disabled={!doc.file_url}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-surface hover:bg-surface-hover border border-border hover:border-primary/30 text-sm text-muted-foreground hover:text-foreground transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Baixar
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Document Viewer Modal ─────────────────────────────────────
function DocumentViewer({
  doc,
  onClose,
}: {
  doc: VerifiedDoc;
  onClose: () => void;
}) {
  const funnelColor = doc.funnel_color || "#6366f1";
  const fileExt = getFileExt(doc.file_type);

  const handleDownload = () => {
    if (!doc.file_url) return;
    const link = document.createElement("a");
    link.href = doc.file_url;
    link.target = "_blank";
    link.download = `${doc.doc_type} - ${doc.lead_name}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", bounce: 0.2 }}
        className="relative w-full max-w-3xl max-h-[85vh] bg-card rounded-2xl border border-border overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">{doc.doc_type}</h3>
              <p className="text-sm text-muted-foreground">
                {doc.lead_name} • {formatDate(doc.verified_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wider border bg-green-500/20 text-green-400 border-green-500/30">
              APROVADO
            </span>
            {doc.file_url && (
              <button
                onClick={handleDownload}
                className="p-2 rounded-lg hover:bg-surface transition-colors text-muted-foreground hover:text-foreground"
                title="Baixar"
              >
                <Download className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surface transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal content */}
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-background/50">
          {doc.file_url && isImageType(doc.file_type) ? (
            <img
              src={doc.file_url}
              alt={doc.doc_type}
              className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-2xl"
            />
          ) : doc.file_url ? (
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
              <FileText className="w-16 h-16 opacity-30" />
              <p className="text-sm">Preview não disponível para este tipo de arquivo</p>
              <a
                href={doc.file_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                <Download className="w-4 h-4" />
                Abrir / Baixar
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <FileText className="w-16 h-16 opacity-30" />
              <p className="text-sm">Arquivo não disponível</p>
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-surface/30">
          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider ${getFileTypeColor(doc.file_type || "")}`}
            >
              {fileExt}
            </span>
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium"
              style={{
                backgroundColor: `${funnelColor}15`,
                color: funnelColor,
              }}
            >
              <span>{doc.funnel_name || "Geral"}</span>
            </div>
          </div>
          {doc.file_url && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              <Download className="w-4 h-4" />
              Baixar Documento
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────
export function VerifiedDocuments() {
  const [search, setSearch] = useState("");
  const [selectedFunnel, setSelectedFunnel] = useState("Todos os funis");
  const [funnelDropdownOpen, setFunnelDropdownOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<VerifiedDoc | null>(null);

  // Fetch from real API
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["verified-docs", search],
    queryFn: async () => {
      const res = await databaseApi.getVerifiedDocuments(search ? { search } : undefined);
      return res.data.data;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Unique funnels for filter
  const funnelOptions = useMemo(() => {
    const names = ["Todos os funis", ...new Set(docs.map((d) => d.funnel_name || "Geral"))];
    return names;
  }, [docs]);

  // Filtered documents
  const filteredDocs = useMemo(() => {
    return docs.filter((doc) => {
      const matchesSearch =
        !search ||
        doc.doc_type.toLowerCase().includes(search.toLowerCase()) ||
        doc.lead_name.toLowerCase().includes(search.toLowerCase());

      const matchesFunnel =
        selectedFunnel === "Todos os funis" || (doc.funnel_name || "Geral") === selectedFunnel;

      return matchesSearch && matchesFunnel;
    });
  }, [docs, search, selectedFunnel]);

  return (
    <div className="space-y-6">
      {/* Search + Filter row */}
      <div className="flex items-center gap-4">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar documentos por tipo ou titular..."
            className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          />
        </div>

        {/* Funnel filter dropdown */}
        <div className="relative">
          <button
            onClick={() => setFunnelDropdownOpen(!funnelDropdownOpen)}
            className="flex items-center gap-3 px-5 py-3.5 rounded-xl bg-card border border-border text-sm text-foreground hover:border-primary/30 transition-all min-w-[200px] justify-between"
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" />
              <span>{selectedFunnel}</span>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${
                funnelDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          <AnimatePresence>
            {funnelDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-full bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-20"
              >
                {funnelOptions.map((funnel) => (
                  <button
                    key={funnel}
                    onClick={() => {
                      setSelectedFunnel(funnel);
                      setFunnelDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                      selectedFunnel === funnel
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-surface"
                    }`}
                  >
                    {funnel}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Document count */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="w-4 h-4 text-green-500" />
        <span>
          {isLoading ? "Carregando..." : `${filteredDocs.length} documento${filteredDocs.length !== 1 ? "s" : ""} verificado${filteredDocs.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Documents Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filteredDocs.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-20 text-center text-muted-foreground"
        >
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Nenhum documento encontrado</p>
          <p className="text-sm mt-1 opacity-60">
            {docs.length === 0
              ? "Documentos aprovados pela Sofia aparecerão aqui"
              : "Tente ajustar sua busca ou filtro"}
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDocs.map((doc, i) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              index={i}
              onView={setViewingDoc}
            />
          ))}
        </div>
      )}

      {/* Document viewer modal */}
      <AnimatePresence>
        {viewingDoc && (
          <DocumentViewer
            doc={viewingDoc}
            onClose={() => setViewingDoc(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
