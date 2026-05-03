import { Upload, FileText, Trash2, File, CheckCircle, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { databaseApi, KnowledgeFile } from "@/services/api";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];
const MAX_SIZE = 25 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UploadingFile {
  name: string;
  progress: number; // 0–100, real XHR progress
  error?: string;
}

interface DocumentUploadProps {
  activeFunnel: string;
}

export function DocumentUpload({ activeFunnel }: DocumentUploadProps) {
  const [docs, setDocs] = useState<KnowledgeFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // Load files from API
  useEffect(() => {
    databaseApi.getKnowledgeFiles(activeFunnel)
      .then((res) => setDocs(res.data.data))
      .catch(() => setDocs([]));
  }, [activeFunnel]);

  const handleDelete = async (docId: number) => {
    try {
      await databaseApi.deleteKnowledgeFile(docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      toast.success("Documento removido");
    } catch {
      toast.error("Erro ao remover documento");
    }
  };

  // ── Real XHR upload with progress ─────────────────────────────
  const uploadFile = useCallback((file: File, index: number) => {
    const token = localStorage.getItem("legacy_token");
    const apiBase = (import.meta.env.VITE_API_URL as string) || "http://localhost:3001/api";

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 95); // 95% = uploading, 100% = server processed
        setUploadingFiles((prev) =>
          prev.map((f, i) => (i === index ? { ...f, progress: pct } : f))
        );
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText);
          setUploadingFiles((prev) =>
            prev.map((f, i) => (i === index ? { ...f, progress: 100 } : f))
          );
          // Add to list
          if (result.data) {
            setDocs((prev) => [result.data, ...prev]);
          }
          const chars = result.chars_extracted ?? 0;
          const msg = chars > 0
            ? `${file.name} enviado — ${chars.toLocaleString()} caracteres extraídos ✅`
            : `${file.name} enviado (sem texto extraído)`;
          toast.success(msg);
        } catch {
          toast.success(`${file.name} enviado com sucesso`);
        }
        // Remove from uploading list after a short delay
        setTimeout(() => {
          setUploadingFiles((prev) => prev.filter((_, i) => i !== index));
        }, 1200);
      } else {
        let errMsg = "Erro ao enviar arquivo";
        try {
          const result = JSON.parse(xhr.responseText);
          errMsg = result.error || errMsg;
        } catch { /* ignore */ }
        setUploadingFiles((prev) =>
          prev.map((f, i) => (i === index ? { ...f, progress: 0, error: errMsg } : f))
        );
        toast.error(`${file.name}: ${errMsg}`);
        setTimeout(() => {
          setUploadingFiles((prev) => prev.filter((_, i) => i !== index));
        }, 3000);
      }
    };

    xhr.onerror = () => {
      setUploadingFiles((prev) =>
        prev.map((f, i) => (i === index ? { ...f, progress: 0, error: "Erro de rede" } : f))
      );
      toast.error(`${file.name}: Erro de rede`);
      setTimeout(() => {
        setUploadingFiles((prev) => prev.filter((_, i) => i !== index));
      }, 3000);
    };

    xhr.open("POST", `${apiBase}/database/knowledge/${activeFunnel}`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(formData);
  }, [activeFunnel]);

  const processFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    const errors: string[] = [];

    fileArray.forEach((file) => {
      if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(pdf|docx?|txt)$/i)) {
        errors.push(`${file.name}: tipo não suportado`);
      } else if (file.size > MAX_SIZE) {
        errors.push(`${file.name}: excede 25MB`);
      } else {
        validFiles.push(file);
      }
    });

    errors.forEach((err) => toast.error(err));
    if (validFiles.length === 0) return;

    // Add to uploading list
    const offset = uploadingFiles.length;
    const newUploading: UploadingFile[] = validFiles.map((f) => ({ name: f.name, progress: 0 }));
    setUploadingFiles((prev) => [...prev, ...newUploading]);

    // Start real XHR upload for each file
    validFiles.forEach((file, i) => {
      uploadFile(file, offset + i);
    });
  }, [uploadingFiles.length, uploadFile]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false); dragCounter.current = 0;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  }, [processFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = "";
    }
  }, [processFiles]);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("pt-BR");

  return (
    <motion.div
      key={activeFunnel}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Upload Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300 ${
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt"
          onChange={handleFileSelect}
          className="hidden"
        />
        <motion.div
          animate={isDragging ? { scale: 1.15, y: -4 } : { scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300 }}
          className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all ${
            isDragging ? "bg-primary" : "bg-surface"
          }`}
        >
          <Upload className={`w-6 h-6 ${isDragging ? "text-primary-foreground" : "text-primary"}`} />
        </motion.div>
        <div className="text-center">
          <p className="text-foreground font-medium">
            {isDragging ? "Solte os arquivos aqui!" : "Arraste e solte seus arquivos aqui"}
          </p>
          <p className="text-muted-foreground text-sm mt-1">PDF, DOCX, TXT — Máx. 25MB por arquivo</p>
          <p className="text-muted-foreground/60 text-xs mt-1">O texto é extraído automaticamente e injetado no contexto da Sofia ✨</p>
        </div>
        {!isDragging && (
          <span className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
            Selecionar Arquivos
          </span>
        )}
        {isDragging && (
          <motion.div
            className="absolute inset-0 rounded-xl border-2 border-primary"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </div>

      {/* Uploading progress — REAL XHR progress */}
      <AnimatePresence>
        {uploadingFiles.map((file, i) => (
          <motion.div
            key={`uploading-${i}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={`flex items-center gap-3 p-4 rounded-lg bg-card border ${
              file.error ? "border-red-500/30" : "border-primary/30"
            }`}
          >
            <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center">
              {file.error
                ? <AlertCircle className="w-5 h-5 text-red-400" />
                : <Upload className="w-5 h-5 text-primary animate-pulse" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
              {file.error ? (
                <p className="text-xs text-red-400 mt-1">{file.error}</p>
              ) : (
                <div className="mt-1.5 h-1.5 bg-surface rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${file.progress}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
              )}
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {file.error ? "Erro" : file.progress === 100 ? "✅" : `${file.progress}%`}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Document List */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Documentos Ativos ({docs.length})
        </h3>
        <AnimatePresence mode="popLayout">
          {docs.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-12 text-center text-muted-foreground"
            >
              <File className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nenhum documento anexado a este funil</p>
            </motion.div>
          ) : (
            docs.map((doc) => (
              <motion.div
                key={doc.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10, scale: 0.95 }}
                className="flex items-center justify-between p-4 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{doc.original_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground">
                        {doc.file_size_kb ? formatFileSize(doc.file_size_kb * 1024) : "—"} • {formatDate(doc.created_at)}
                      </p>
                      {/* Show if text was extracted */}
                      {(doc as KnowledgeFile & { extracted_text?: string }).extracted_text && (
                        <span className="text-[10px] text-green-500/80 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                          texto extraído ✓
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-red-500/10 text-red-500 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
