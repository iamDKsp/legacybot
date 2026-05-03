import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useEffect } from "react";
import { Save, RotateCcw, Sparkles, Eye, Code2, Bold, Italic, Heading1, Heading2, List, ListOrdered, Minus } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { databaseApi } from "@/services/api";

interface PromptEditorProps {
  activeFunnel: string;
}

type ViewMode = "edit" | "preview" | "split";

export function PromptEditor({ activeFunnel }: PromptEditorProps) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");

  // Load prompt from API
  useEffect(() => {
    setLoading(true);
    databaseApi.getPrompt(activeFunnel)
      .then((res) => {
        setContent(res.data.data.content);
        setOriginalContent(res.data.data.content);
      })
      .catch(() => toast.error("Erro ao carregar prompt"))
      .finally(() => setLoading(false));
  }, [activeFunnel]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await databaseApi.savePrompt(activeFunnel, content);
      setOriginalContent(content);
      toast.success("Prompt salvo com sucesso!");
    } catch {
      toast.error("Erro ao salvar prompt");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setContent(originalContent);
    toast.info("Prompt restaurado ao salvo");
  };

  const insertMarkdown = useCallback((prefix: string, suffix: string = "") => {
    const textarea = document.getElementById("prompt-textarea") as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);
    const newText = content.substring(0, start) + prefix + selected + suffix + content.substring(end);
    setContent(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  }, [content]);

  const toolbarButtons = [
    { icon: Bold, action: () => insertMarkdown("**", "**"), label: "Negrito" },
    { icon: Italic, action: () => insertMarkdown("*", "*"), label: "Itálico" },
    { icon: Heading1, action: () => insertMarkdown("# "), label: "Título 1" },
    { icon: Heading2, action: () => insertMarkdown("## "), label: "Título 2" },
    { icon: List, action: () => insertMarkdown("- "), label: "Lista" },
    { icon: ListOrdered, action: () => insertMarkdown("1. "), label: "Lista numerada" },
    { icon: Minus, action: () => insertMarkdown("\n---\n"), label: "Separador" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="animate-pulse">Carregando prompt...</div>
      </div>
    );
  }

  return (
    <motion.div
      key={activeFunnel}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col flex-1 min-h-0 h-full"
    >
      {/* Header */}
      <div className="flex-none flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Prompt da I.A</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            disabled={content === originalContent}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground text-sm transition-all disabled:opacity-40"
          >
            <RotateCcw className="w-4 h-4" />
            Restaurar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-none flex items-center justify-between p-2 rounded-t-xl bg-sidebar border border-b-0 border-border">
        <div className="flex items-center gap-0.5">
          {toolbarButtons.map(({ icon: Icon, action, label }) => (
            <button
              key={label}
              onClick={action}
              title={label}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface transition-all"
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <div className="flex items-center bg-surface rounded-lg p-0.5">
          {([
            { mode: "edit" as ViewMode, icon: Code2, label: "Editor" },
            { mode: "split" as ViewMode, icon: undefined, label: "Split" },
            { mode: "preview" as ViewMode, icon: Eye, label: "Preview" },
          ]).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === mode
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Editor / Preview */}
      <div className={`flex-1 min-h-0 border border-border rounded-b-xl overflow-hidden ${viewMode === "split" ? "grid grid-cols-2" : ""}`}>
        {(viewMode === "edit" || viewMode === "split") && (
          <div className={`relative h-full ${viewMode === "split" ? "border-r border-border" : ""}`}>
            <div className="absolute top-3 right-3 z-10 pointer-events-none">
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-widest">Markdown</span>
            </div>
            <textarea
              id="prompt-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-full p-6 bg-card text-foreground placeholder:text-muted-foreground resize-none focus:outline-none font-mono text-sm leading-relaxed scrollbar-thin"
              placeholder="Escreva o prompt da I.A para este funil..."
              spellCheck={false}
            />
          </div>
        )}

        {(viewMode === "preview" || viewMode === "split") && (
          <div className="h-full relative bg-card overflow-y-auto scrollbar-thin">
            <div className="absolute top-3 right-3 z-10 pointer-events-none">
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-widest">Preview</span>
            </div>
            <div className="prompt-preview prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-xl font-bold text-foreground mb-3 mt-6 first:mt-0">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-semibold text-primary mb-2 mt-5">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-base font-semibold text-foreground mb-2 mt-4">{children}</h3>,
                  p: ({ children }) => <p className="text-sm text-foreground leading-relaxed mb-3">{children}</p>,
                  ul: ({ children }) => <ul className="space-y-1.5 mb-4 ml-1">{children}</ul>,
                  ol: ({ children }) => <ol className="space-y-1.5 mb-4 ml-1 list-decimal list-inside">{children}</ol>,
                  li: ({ children }) => <li className="text-sm text-foreground flex gap-2 items-start"><span className="text-primary mt-1.5 text-[6px]">●</span><span>{children}</span></li>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-primary pl-4 py-1 my-3 bg-primary/5 rounded-r-lg">
                      {children}
                    </blockquote>
                  ),
                  strong: ({ children }) => <strong className="font-semibold text-primary">{children}</strong>,
                  em: ({ children }) => <em className="text-muted-foreground italic">{children}</em>,
                  hr: () => <hr className="border-border my-4" />,
                  table: ({ children }) => (
                    <div className="my-4 rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-sm">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
                  th: ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{children}</th>,
                  td: ({ children }) => <td className="px-3 py-2 text-sm text-foreground border-t border-border">{children}</td>,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      <div className="flex-none flex items-center justify-between mt-3">
        <p className="text-xs text-muted-foreground">
          Este prompt define o roteiro, personalidade e plano da I.A para a triagem deste funil.
        </p>
        <p className="text-xs text-muted-foreground">
          {content.length} caracteres • {content.split(/\s+/).filter(Boolean).length} palavras
        </p>
      </div>
    </motion.div>
  );
}
