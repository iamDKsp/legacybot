import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, CheckCircle, XCircle, MessageSquare, Bot, BotOff,
  FileText, ClipboardList, User, Phone, Mail, Calendar,
  Send, Loader2, Plus, Download, Upload, Info, RefreshCw,
  MessageCircle, Pencil, Check, X as XIcon,
  MapPin, Hash, Heart, Globe, Copy, ImageIcon, Mic, Navigation, Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Lead } from "@/modules/crm/types/crm";
import { useLeadNotes, useCreateNote, useLeadConversations, useLeadDocuments, useUpdateLeadStatus, useToggleBotStatus, useLeadChecklist, useUploadLeadDocument } from "@/hooks/useLeads";
import { leadsApi } from "@/services/api";
import { useQueryClient } from "@tanstack/react-query";
import { CheckSquare } from "lucide-react";
import { StyledSelect } from "@/components/ui/StyledSelect";
import { formatPhoneDisplay } from "@/utils/formatters";
import { Eye } from "lucide-react";

// ─── Lightbox Modal ───────────────────────────────────────────
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        key="lightbox"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.85, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="relative max-w-[90vw] max-h-[90vh]"
          onClick={e => e.stopPropagation()}
        >
          <img src={url} alt="Mídia" className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl" />
          <button
            onClick={onClose}
            className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <XIcon className="w-4 h-4" />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="absolute -bottom-3 right-0 flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <Download className="w-3 h-3" /> Baixar
          </a>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Extract Button (✨ fill lead fields from approved document) ──
function ExtractButton({ leadId, docId, onSuccess }: { leadId: number; docId: number; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const handleExtract = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('legacy_token') || localStorage.getItem('token') || '';
      const baseUrl = ((import.meta.env.VITE_API_URL as string) || 'http://localhost:3001/api').replace(/\/api$/, '');
      const url = `${baseUrl}/api/leads/${leadId}/documents/${docId}/extract`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const filled = Object.keys(data.updated || {}).length;
        showToast(filled > 0 ? `✅ ${filled} campo${filled > 1 ? 's' : ''} preenchido${filled > 1 ? 's' : ''}` : 'ℹ️ Todos os campos já estavam preenchidos', true);
        onSuccess();
      } else {
        showToast(`❌ ${data.error || 'Erro ao extrair'}`, false);
      }
    } catch {
      showToast('❌ Erro de conexão', false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleExtract}
        title="Extrair dados para o cadastro"
        className="p-1 rounded hover:bg-yellow-400/15 text-muted-foreground hover:text-yellow-400 transition-colors"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
      </button>
      {toast && (
        <div className={`absolute bottom-7 right-0 z-50 text-[11px] whitespace-nowrap px-2.5 py-1.5 rounded-lg shadow-lg font-medium
          ${toast.ok ? 'bg-emerald-900/90 text-emerald-200 border border-emerald-700' : 'bg-red-900/90 text-red-200 border border-red-700'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── Custom Audio Player ──────────────────────────────────────
function AudioPlayer({ src, transcription }: { src: string; transcription?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); } else { a.play(); }
    setPlaying(!playing);
  };

  const handleTimeUpdate = () => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    setCurrentTime(a.currentTime);
    setProgress((a.currentTime / a.duration) * 100);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    a.currentTime = ratio * a.duration;
  };

  return (
    <div className="flex flex-col gap-1.5 min-w-[240px] max-w-[280px]">
      {/* Header row */}
      <div className="flex items-center gap-1.5 text-[11px] text-purple-400 font-semibold">
        <Mic className="w-3 h-3" />
        <span>Áudio do cliente</span>
      </div>

      {/* Player card */}
      <div className="flex items-center gap-2.5 bg-purple-500/10 border border-purple-500/20 rounded-2xl px-3 py-2.5">
        {/* Play/Pause button */}
        <button
          onClick={toggle}
          className="w-8 h-8 rounded-full bg-purple-500 hover:bg-purple-400 flex items-center justify-center shrink-0 transition-colors shadow-sm shadow-purple-500/30"
        >
          {playing ? (
            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24" style={{ marginLeft: '1px' }}>
              <path d="M8 5v14l11-7z"/>
            </svg>
          )}
        </button>

        {/* Waveform + Progress */}
        <div className="flex-1 flex flex-col gap-1">
          {/* Fake waveform bars + clickable progress track */}
          <div
            className="relative h-7 flex items-center gap-px cursor-pointer"
            onClick={handleSeek}
          >
            {/* Waveform bars */}
            {[4, 7, 5, 9, 6, 8, 4, 7, 10, 6, 8, 5, 7, 9, 5, 6, 8, 4, 7, 6].map((h, i) => {
              const pct = (i / 19) * 100;
              const filled = pct <= progress;
              return (
                <div
                  key={i}
                  className="rounded-full flex-1 transition-colors"
                  style={{
                    height: `${h * 2.5}px`,
                    backgroundColor: filled ? 'rgb(168 85 247)' : 'rgba(168,85,247,0.25)',
                  }}
                />
              );
            })}
          </div>

          {/* Time display */}
          <div className="flex justify-between text-[9px] text-purple-300/70 font-mono px-0.5">
            <span>{fmt(currentTime)}</span>
            <span>{duration ? fmt(duration) : '–:––'}</span>
          </div>
        </div>
      </div>

      {/* Transcription */}
      {transcription && (
        <p className="text-[11px] text-muted-foreground italic px-1">
          📝 {transcription}
        </p>
      )}

      {/* Hidden native audio */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }}
        className="hidden"
      />
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────
type TabKey = "conversas" | "info" | "documentos" | "checklist";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "conversas", label: "Conversas", icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { key: "info", label: "Informações", icon: <Info className="w-3.5 h-3.5" /> },
  { key: "documentos", label: "Documentos", icon: <FileText className="w-3.5 h-3.5" /> },
  { key: "checklist", label: "Checklist", icon: <CheckSquare className="w-3.5 h-3.5" /> },
];

// ─── Conversation / Chat Panel ────────────────────────────────
function ConversationsPanel({ leadId }: { leadId: number }) {
  const { data: messages = [], isLoading, refetch } = useLeadConversations(leadId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  const [copied, setCopied] = useState(false);

  const handleCopyConversation = () => {
    const text = (messages as Record<string, unknown>[]).map((msg) => {
      const dir = msg.direction === 'outbound' ? 'Sofia' : 'Cliente';
      const time = msg.sent_at ? new Date(msg.sent_at as string).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      const content = msg.media_type === 'image' ? '[Imagem]' : msg.media_type === 'audio' ? '[Áudio]' : String(msg.content || '');
      return `[${time}] ${dir}: ${content}`;
    }).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await leadsApi.sendMessage(leadId, draft.trim());
      setDraft("");
      await refetch();
    } catch { /* silent */ }
    finally { setSending(false); }
  };

  if (isLoading) return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-accent" />
    </div>
  );

  if (messages.length === 0) return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <MessageCircle className="h-10 w-10 opacity-30" />
      <p className="text-sm">Nenhuma mensagem ainda</p>
      <p className="text-xs opacity-60">A conversa aparecerá aqui quando o lead entrar em contato pelo WhatsApp</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Lightbox */}
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      {/* Copy button */}
      <div className="flex justify-end pb-1">
        <button
          onClick={handleCopyConversation}
          title="Copiar conversa"
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copiado!' : 'Copiar conversa'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin pb-3">
        {(messages as Record<string, unknown>[])
          .filter((msg) => {
            const content = String(msg.content || '').trim();
            const lc = content.toLowerCase();

            // Only drop truly empty messages
            if (lc === '' || lc === 'undefined' || lc === 'null') return false;

            // Drop image stubs that have NEITHER image_url NOR any recognizable content
            if (msg.media_type === 'image' && !msg.image_url && (lc === '[imagem]' || lc === '[media]' || lc === '[mídia]')) {
                // Don’t drop — show a placeholder so assessor knows client sent an image
                // We still show it, just styled differently
            }

            // Drop audio stubs with no url and no transcription
            if (msg.media_type === 'audio' && !msg.audio_url && lc.startsWith('[áudio recebido')) return false;

            return true;
          })
          .map((msg) => {
            const isOutbound = msg.direction === "outbound";
            const sentAt = msg.sent_at
              ? new Date(msg.sent_at as string).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
              : "";
            const isImage = msg.media_type === 'image';
            const isAudio = msg.media_type === 'audio';
            const imageUrl = withToken(msg.image_url as string | null);
            const audioUrl = withToken(msg.audio_url as string | null);

            return (
              <div key={String(msg.id)} className={cn("flex gap-2", isOutbound && "flex-row-reverse")}>
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1",
                  isOutbound ? "bg-accent/20" : "bg-secondary"
                )}>
                  {isOutbound
                    ? <User className="w-3.5 h-3.5 text-accent" />
                    : isAudio
                    ? <Mic className="w-3.5 h-3.5 text-purple-400" />
                    : <Bot className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>

                <div className={cn(
                  "max-w-[78%] rounded-xl px-3.5 py-2.5",
                  isOutbound ? "bg-accent/15 rounded-tr-sm" : "bg-secondary rounded-tl-sm"
                )}>
                  {/* ── Image message ── */}
                  {isImage && imageUrl ? (
                    <div className="relative group cursor-pointer" onClick={() => setLightboxUrl(imageUrl)}>
                      <img
                        src={imageUrl}
                        alt="mídia"
                        className="max-w-[200px] max-h-[180px] rounded-lg object-contain hover:opacity-90 transition-opacity"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition-opacity">
                        <Eye className="w-6 h-6 text-white drop-shadow" />
                      </div>
                    </div>
                  ) : isImage ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground italic py-0.5">
                      <ImageIcon className="w-4 h-4 opacity-60" />
                      <span>Imagem enviada</span>
                    </div>

                  /* ── Audio message ── */
                  ) : isAudio && audioUrl ? (
                    <AudioPlayer
                      src={audioUrl}
                      transcription={
                        msg.content && !String(msg.content).startsWith('[Áudio')
                          ? String(msg.content)
                          : undefined
                      }
                    />
                  ) : isAudio ? (
                    <div className="flex flex-col gap-1 min-w-[180px]">
                      <div className="flex items-center gap-2 text-xs text-purple-400/70 italic">
                        <Mic className="w-3.5 h-3.5" />
                        <span>Áudio recebido</span>
                      </div>
                      {msg.content && !String(msg.content).startsWith('[Áudio') && (
                        <p className="text-sm leading-relaxed">{String(msg.content)}</p>
                      )}
                    </div>

                  /* ── Unknown/unsupported media placeholder ── */
                  ) : (() => {
                    const c = String(msg.content || '').trim();
                    const tag = c.toLowerCase();
                    if (tag === '[sticker]' || tag === '[figurinha]') return (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground/60 italic">
                        <span className="text-base">😄</span><span>Sticker</span>
                      </div>
                    );
                    if (tag === '[vídeo]' || tag === '[video]') return (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground/60 italic">
                        <span className="text-base">🎬</span><span>Vídeo recebido</span>
                      </div>
                    );
                    if (tag === '[pdf]' || tag.startsWith('[pdf recebido')) return (
                      <div className="flex items-center gap-2 text-xs text-blue-400/80 italic">
                        <span className="text-base">📄</span><span>PDF recebido</span>
                      </div>
                    );
                    if (tag === '[imagem]' || tag === '[image]') return (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground/60 italic">
                        <ImageIcon className="w-4 h-4 opacity-50" /><span>Imagem não carregada</span>
                      </div>
                    );
                    // Default: regular text
                    return <p className="text-sm leading-relaxed whitespace-pre-wrap">{c}</p>;
                  })()}

                  <p className="text-[10px] text-muted-foreground mt-1">{sentAt}</p>
                </div>
              </div>
            );
          })}
        <div ref={bottomRef} />
      </div>

      {/* Send bar */}
      <div className="flex gap-2 pt-3 border-t border-border">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Enviar mensagem como assessor…"
          className="flex-1 bg-secondary rounded-lg px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/50 transition-all"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          className="p-2.5 rounded-lg bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── Inline-editable field row ────────────────────────────────
const ESTADOS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const ESTADO_CIVIL = [
  { value: "solteiro",   label: "Solteiro(a)" },
  { value: "casado",     label: "Casado(a)" },
  { value: "divorciado", label: "Divorciado(a)" },
  { value: "viuvo",      label: "Viúvo(a)" },
  { value: "outro",      label: "Outro" },
];

interface FieldRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  fieldKey: string;
  type?: "text" | "email" | "date" | "select-state" | "select-civil" | "select-uf" | "tel";
  placeholder?: string;
  readOnly?: boolean;
  onSave: (key: string, value: string) => Promise<void>;
}

function FieldRow({ icon, label, value, fieldKey, type = "text", placeholder, readOnly, onSave }: FieldRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<"ok" | "err" | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = useCallback(async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(fieldKey, draft);
      setFlash("ok");
      setTimeout(() => setFlash(null), 1500);
      setEditing(false);
    } catch {
      setFlash("err");
      setTimeout(() => setFlash(null), 2000);
    } finally { setSaving(false); }
  }, [draft, value, fieldKey, onSave]);

  const cancel = () => { setDraft(value); setEditing(false); };

  const inputClass = "flex-1 bg-muted rounded-md px-2 py-0.5 text-sm text-card-foreground border border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/60 min-w-0";

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
        editing ? "bg-accent/5 ring-1 ring-accent/20" : "bg-secondary/40 hover:bg-secondary/60",
        flash === "ok" && "ring-1 ring-green-500/40",
        flash === "err" && "ring-1 ring-red-500/40",
        !readOnly && !editing && "cursor-pointer",
      )}
      onClick={() => { if (!readOnly && !editing) { setDraft(value); setEditing(true); } }}
    >
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>

      {editing ? (
        <>
          {type === "select-state" ? (
            <StyledSelect
              value={draft}
              onChange={(v) => { setDraft(v); }}
              placeholder="Selecionar..."
              options={ESTADOS.map(s => ({ value: s, label: s }))}
              className="flex-1 min-w-0"
            />
          ) : type === "select-civil" ? (
            <StyledSelect
              value={draft}
              onChange={(v) => { setDraft(v); }}
              placeholder="Selecionar..."
              options={ESTADO_CIVIL.map(s => ({ value: s.value, label: s.label }))}
              className="flex-1 min-w-0"
            />
          ) : type === "select-uf" ? (
            <StyledSelect
              value={draft}
              onChange={(v) => { setDraft(v); }}
              placeholder="UF..."
              options={ESTADOS.map(s => ({ value: s, label: s }))}
              className="flex-1 min-w-0"
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type={type}
              value={draft}
              placeholder={placeholder}
              onChange={e => setDraft(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
              className={cn(inputClass, type === "date" && "date-input text-card-foreground")}
            />
          )}
          <button onClick={(e) => { e.stopPropagation(); commit(); }} disabled={saving}
            className="p-1 rounded-md text-green-400 hover:bg-green-400/10 transition-colors shrink-0 disabled:opacity-40">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); cancel(); }}
            className="p-1 rounded-md text-muted-foreground hover:bg-secondary/80 transition-colors shrink-0">
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <>
          <span className={cn(
            "text-sm font-medium flex-1 truncate",
            flash === "ok" && "text-green-400",
            flash === "err" && "text-red-400",
          )}>
            {flash === "ok" ? "✓ Salvo!" : flash === "err" ? "Erro ao salvar" : (value || <span className="text-muted-foreground/40 italic">—</span>)}
          </span>
          {!readOnly && (
            <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-60 transition-all shrink-0" />
          )}
        </>
      )}
    </div>
  );
}


// ─── Info Panel ────────────────────────────────────────────────
function InfoPanel({ lead, onLeadUpdated }: { lead: Lead & Record<string, unknown>; onLeadUpdated: (updated: Partial<Lead>) => void }) {
  const qc = useQueryClient();

  const handleSave = useCallback(async (key: string, value: string) => {
    await leadsApi.update(lead.id, { [key]: value } as Parameters<typeof leadsApi.update>[1]);
    // Invalidate queries so the Kanban and other views refresh
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["lead", lead.id] });
    onLeadUpdated({ [key]: value } as Partial<Lead>);
  }, [lead.id, qc, onLeadUpdated]);

  const hasCpf = !!(lead.cpf as string);
  const hasAddress = !!(lead.address as string) || !!(lead.street as string);

  const ESTADO_CIVIL_LABEL: Record<string, string> = {
    solteiro: "Solteiro(a)", casado: "Casado(a)", divorciado: "Divorciado(a)",
    viuvo: "Viúvo(a)", outro: "Outro",
  };

  return (
    <div className="space-y-4">
      {/* PHC readiness alert */}
      {(!hasCpf || !hasAddress) && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <FileText className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-400">Dados incompletos para PHC</p>
            <p className="text-[11px] text-amber-400/70 mt-0.5">
              {!hasCpf && "CPF não informado. "}{!hasAddress && "Endereço não extraído."}
            </p>
          </div>
        </div>
      )}

      {/* Section: Dados Básicos */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest px-1 flex items-center gap-1.5">
          <User className="h-3 w-3" /> Dados Básicos
        </p>
        <FieldRow icon={<User className="w-3.5 h-3.5"/>}    label="Nome"       fieldKey="name"           value={lead.name ?? ""}                           onSave={handleSave} />
        <FieldRow icon={<Phone className="w-3.5 h-3.5"/>}   label="Telefone"   fieldKey="phone"          value={lead.phone ?? ""}          type="tel"        onSave={handleSave} />
        <FieldRow icon={<Mail className="w-3.5 h-3.5"/>}    label="E-mail"     fieldKey="email"          value={(lead.email as string) ?? ""}  type="email" onSave={handleSave} />
        <FieldRow icon={<Hash className="w-3.5 h-3.5"/>}    label="CPF"        fieldKey="cpf"            value={(lead.cpf as string) ?? ""}    placeholder="000.000.000-00" onSave={handleSave} />
        <FieldRow icon={<Hash className="w-3.5 h-3.5"/>}    label="RG"         fieldKey="rg"             value={(lead.rg as string) ?? ""}     placeholder="12.345.678" onSave={handleSave} />
        <FieldRow icon={<Hash className="w-3.5 h-3.5"/>}    label="Org. Emis." fieldKey="org_emissor"   value={(lead.org_emissor as string) ?? "SSP"} placeholder="SSP" onSave={handleSave} />
        <FieldRow icon={<Hash className="w-3.5 h-3.5"/>}    label="UF Emis."   fieldKey="uf_emissor"   value={(lead.uf_emissor as string) ?? "SP"} type="select-uf" onSave={handleSave} />
        <FieldRow icon={<Heart className="w-3.5 h-3.5"/>}   label="Est. Civil" fieldKey="marital_status" value={ESTADO_CIVIL_LABEL[(lead.marital_status as string) ?? ""] ?? (lead.marital_status as string) ?? ""} type="select-civil" onSave={async (key, val) => handleSave(key, val)} />
        <FieldRow icon={<Globe className="w-3.5 h-3.5"/>}   label="Nacion."    fieldKey="nationality"    value={(lead.nationality as string) ?? "brasileiro(a)"} placeholder="brasileiro(a)" onSave={handleSave} />
      </div>

      {/* Section: Endereço */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest px-1 flex items-center gap-1.5">
          <MapPin className="h-3 w-3" /> Endereço
        </p>
        {/* Bot-extracted full address — read-only reference when present */}
        {(lead.address as string) && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/8 border border-amber-500/20 text-[11px] text-amber-400/80">
            <Bot className="w-3 h-3 shrink-0" />
            <span className="italic truncate">Extraído pelo bot: {lead.address as string}</span>
          </div>
        )}
        <FieldRow icon={<MapPin className="w-3.5 h-3.5"/>} label="Rua"     fieldKey="street"       value={(lead.street as string) ?? ""}       placeholder="Rua das Flores"   onSave={handleSave} />
        <FieldRow icon={<MapPin className="w-3.5 h-3.5"/>} label="Número"  fieldKey="number"       value={(lead.number as string) ?? ""}       placeholder="123"              onSave={handleSave} />
        <FieldRow icon={<MapPin className="w-3.5 h-3.5"/>} label="Bairro"  fieldKey="neighborhood" value={(lead.neighborhood as string) ?? ""} placeholder="Centro"           onSave={handleSave} />
        <FieldRow icon={<MapPin className="w-3.5 h-3.5"/>} label="CEP"     fieldKey="zip_code"     value={(lead.zip_code as string) ?? ""}     placeholder="00000-000"        onSave={handleSave} />
        <FieldRow icon={<MapPin className="w-3.5 h-3.5"/>} label="Cidade"  fieldKey="city"         value={(lead.city as string) ?? ""}         placeholder="Belo Horizonte"   onSave={handleSave} />
        <FieldRow icon={<MapPin className="w-3.5 h-3.5"/>} label="Estado"  fieldKey="state"        value={(lead.state as string) ?? ""}        type="select-state"            onSave={handleSave} />
      </div>

      {/* Section: Outros */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest px-1 flex items-center gap-1.5">
          <Info className="h-3 w-3" /> Outros
        </p>
        <FieldRow icon={<ClipboardList className="w-3.5 h-3.5"/>} label="Funil"    fieldKey="funnel_name" value={(lead.funnel_name as string) ?? "—"} readOnly onSave={handleSave} />
        <FieldRow icon={<Calendar className="w-3.5 h-3.5"/>}      label="Origem"   fieldKey="origin"      value={lead.origin ?? "—"} readOnly onSave={handleSave} />
        <FieldRow icon={<Calendar className="w-3.5 h-3.5"/>}      label="Criado em" fieldKey="created_at"  value={lead.created_at ? new Date(lead.created_at as string).toLocaleDateString("pt-BR") : "—"} readOnly onSave={handleSave} />
      </div>
    </div>
  );
}


// ─── Documents Panel ───────────────────────────────────────────
// Helper: append the local JWT token to a backend URL for unauthenticated requests (img/a href)
function withToken(url: string | null): string | null {
  if (!url) return null;
  
  let fullUrl = url;
  if (!url.startsWith('http')) {
    const baseUrl = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3001/api';
    if (url.startsWith('/api') && baseUrl.endsWith('/api')) {
      fullUrl = baseUrl.replace(/\/api$/, '') + url;
    } else {
      fullUrl = baseUrl.replace(/\/$/, '') + (url.startsWith('/') ? url : `/${url}`);
    }
  }

  const token = localStorage.getItem('legacy_token') || localStorage.getItem('token');
  if (!token) return fullUrl;
  const sep = fullUrl.includes('?') ? '&' : '?';
  return `${fullUrl}${sep}token=${encodeURIComponent(token)}`;
}

function DocumentsPanel({ leadId }: { leadId: number }) {
  const { data: docs = [], isLoading, refetch: refetchDocs } = useLeadDocuments(leadId);
  const uploadDoc = useUploadLeadDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState('RG');
  const [showUpload, setShowUpload] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);


  const statusStyles: Record<string, string> = {
    pendente: "bg-yellow-500/15 text-yellow-400",
    recebido: "bg-blue-500/15 text-blue-400",
    aprovado: "bg-emerald-500/15 text-emerald-400",
    rejeitado: "bg-red-500/15 text-red-400",
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64Full = ev.target?.result as string;
      const base64 = base64Full.split(',')[1] || base64Full;
      
      uploadDoc.mutate(
        {
          leadId,
          data: {
            fileBase64: base64,
            mimeType: file.type || 'image/jpeg',
            docType: docType
          }
        },
        {
          onSettled: () => {
            if (fileInputRef.current) fileInputRef.current.value = '';
            setShowUpload(false);
          }
        }
      );
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;

  return (
    <div className="space-y-4">
      {/* Lightbox for documents */}
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      {/* Upload Header/Form */}
      <div className="bg-card rounded-lg p-3 border border-border flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Documentos</h3>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="text-xs flex items-center gap-1.5 bg-accent/20 text-accent hover:bg-accent/30 px-3 py-1.5 rounded-md transition-colors font-medium"
          >
            {showUpload ? <XIcon className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showUpload ? "Cancelar" : "Anexar"}
          </button>
        </div>

        {showUpload && (
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="flex-1 bg-secondary text-sm rounded-md px-2 py-1.5 border border-border focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="RG">RG / CNH</option>
              <option value="Comprovante de Residência">Comprovante de Residência</option>
              <option value="Carteira de Trabalho">Carteira de Trabalho</option>
              <option value="Holerite">Holerite</option>
              <option value="Comprovante Pix">Comprovante Pix</option>
              <option value="Outro">Outro</option>
            </select>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/*,application/pdf"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadDoc.isPending}
              className="flex items-center gap-1.5 bg-accent text-accent-foreground px-3 py-1.5 rounded-md text-sm font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {uploadDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploadDoc.isPending ? "Analisando IA..." : "Selecionar Arquivo"}
            </button>
          </div>
        )}
      </div>

      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground">
          <FileText className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhum documento recebido</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {(docs as Record<string, unknown>[]).map((doc) => {
            const status = String(doc.status || 'recebido');
            const docName = String(doc.name || doc.file_name || 'Documento');
            const rawFileUrl = doc.file_url as string | null;
            const fileUrl = withToken(rawFileUrl);
            const isImage = (doc.file_type as string || '').startsWith('image/');
            const isPdf = (doc.file_type as string || '').includes('pdf');
            return (
              <div key={String(doc.id)} className="rounded-xl bg-secondary/40 hover:bg-secondary transition-all group overflow-hidden border border-border/40 flex flex-col">
                {fileUrl && isImage ? (
                <div
                    className="relative h-28 bg-black/10 cursor-pointer overflow-hidden shrink-0 border-b border-border/30"
                    onClick={() => setLightboxUrl(fileUrl)}
                  >
                    <img src={fileUrl} alt={docName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
                      <Eye className="w-6 h-6 text-white" />
                    </div>
                  </div>
                ) : fileUrl && isPdf ? (
                  <div
                    className="relative h-28 bg-white cursor-pointer overflow-hidden shrink-0 border-b border-border/30"
                    onClick={() => window.open(fileUrl, '_blank')}
                  >
                    <iframe
                      src={`${fileUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                      className="w-full h-full pointer-events-none"
                      title={docName}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
                      <Eye className="w-6 h-6 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="relative h-28 bg-card/40 flex flex-col items-center justify-center shrink-0 border-b border-border/30">
                    <FileText className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  </div>
                )}
                <div className="flex flex-col p-3 flex-1 items-center text-center">
                  <p className="text-sm font-semibold truncate text-foreground w-full px-1" title={docName}>{docName}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{String(doc.file_type || 'arquivo')}</p>
                  
                  <div className="flex items-center gap-2 mt-2.5">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${statusStyles[status] || statusStyles.recebido}`}>{status}</span>
                    {fileUrl && (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 rounded hover:bg-accent/15 text-muted-foreground hover:text-accent transition-colors"
                        title="Baixar"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {status === 'aprovado' && (
                      <ExtractButton leadId={leadId} docId={Number(doc.id)} onSuccess={() => refetchDocs()} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Checklist Panel ───────────────────────────────────────────────
function ChecklistPanel({ leadId }: { leadId: number }) {
  const { data, isLoading, refetch } = useLeadChecklist(leadId);

  // Auto-refresh the checklist every 15s to pick up new OCR extractions
  useEffect(() => {
    const interval = setInterval(() => refetch(), 15000);
    return () => clearInterval(interval);
  }, [refetch]);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;

  if (!data) return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
      <ClipboardList className="h-10 w-10 opacity-30" />
      <p className="text-sm">Nenhum dado do checklist</p>
    </div>
  );

  const { standardFields = [], flowItems = [], funnelLabel, receivedCount, totalCount, complete } = data;

  return (
    <div className="flex flex-col h-full gap-4 overflow-y-auto scrollbar-thin pr-1 pb-4">
      
      {/* Informações Padrão */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">
          1. Informações Padrão
        </h3>
        <div className="space-y-2">
          {standardFields.map((field: any) => (
            <div key={field.key} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40 border border-border/50">
              <div className="flex items-center gap-3">
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px]", field.filled ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-500")}>
                  {field.filled ? <CheckCircle className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">{field.label}</p>
                  <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                    {field.value || <span className="italic opacity-50">Aguardando preenchimento...</span>}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Informações do Fluxo */}
      <div className="space-y-3 mt-2">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="text-sm font-semibold text-foreground">
            2. Informações do Fluxo
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
            {funnelLabel} ({receivedCount}/{totalCount})
          </span>
        </div>
        
        {flowItems.length === 0 ? (
           <p className="text-xs text-muted-foreground italic py-2">Nenhum documento exigido para este fluxo.</p>
        ) : (
          <div className="space-y-2">
            {flowItems.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-secondary/40 border border-border/50">
                <div className="flex items-center gap-3">
                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px]", item.received ? "bg-emerald-500/20 text-emerald-400" : "bg-yellow-500/20 text-yellow-500")}>
                    {item.received ? <CheckCircle className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5" />}
                  </div>
                  <p className="text-xs font-medium text-foreground">{item.name}</p>
                </div>
                {!item.received && (
                  <span className="text-[10px] text-yellow-500/70">Pendente</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {complete && (
        <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-400">Checklist Completo!</p>
            <p className="text-xs text-emerald-400/80 mt-1">Todas as informações obrigatórias e documentos do fluxo foram coletados pela Sofia.</p>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────
interface CardDetailViewProps {
  initialLead?: Lead & Record<string, unknown>;
}

const CardDetailView = ({ initialLead }: CardDetailViewProps) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("conversas");
  const updateStatus = useUpdateLeadStatus();
  const toggleBot = useToggleBotStatus();

  // ── Lead location state ──
  const [locationData, setLocationData] = useState<Record<string, unknown> | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);

  const handleLocate = async () => {
    if (!initialLead) return;
    setLocationLoading(true);
    setShowLocationModal(true);
    try {
      const token = localStorage.getItem('legacy_token') || '';
      const baseUrl = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3001/api';
      const res = await fetch(`${baseUrl}/leads/${initialLead.id}/location`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setLocationData(json.data);
    } catch { /* silent */ }
    finally { setLocationLoading(false); }
  };

  // Local lead state so inline edits reflect immediately without reload
  const [lead, setLead] = useState(initialLead);
  useEffect(() => { setLead(initialLead); }, [initialLead]);

  // Inline name editing in header
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editingName) nameInputRef.current?.focus(); }, [editingName]);

  const handleLeadUpdated = useCallback((updated: Partial<Lead>) => {
    setLead(prev => prev ? { ...prev, ...updated } : prev);
  }, []);

  if (!lead) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 text-muted-foreground">
        <User className="h-12 w-12 opacity-30" />
        <p>Nenhum lead selecionado</p>
        <button onClick={() => navigate("/crm")} className="text-accent text-sm hover:underline">
          ← Voltar ao CRM
        </button>
      </div>
    );
  }

  const leadId = Number(lead.id);
  const isBotActive = Boolean(lead.bot_active);
  const verdict = lead.status as string;

  const handleVerdict = (newStatus: "approved" | "rejected") => {
    const toggled = verdict === newStatus ? "active" : newStatus;
    updateStatus.mutate({ id: leadId, status: toggled });
  };

  const commitName = async () => {
    if (!nameDraft.trim() || nameDraft === lead.name) { setEditingName(false); return; }
    setNameSaving(true);
    try {
      await leadsApi.update(lead.id, { name: nameDraft.trim() } as Parameters<typeof leadsApi.update>[1]);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      setLead(prev => prev ? { ...prev, name: nameDraft.trim() } : prev);
      setEditingName(false);
    } catch { /* silent */ }
    finally { setNameSaving(false); }
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">

      {/* ── Lead Location Modal ── */}
      <AnimatePresence>
        {showLocationModal && (
          <motion.div
            key="loc-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowLocationModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="bg-card border border-border rounded-2xl p-6 w-[360px] shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-accent" /> Localização no Funil
                </h2>
                <button onClick={() => setShowLocationModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <XIcon className="w-4 h-4" />
                </button>
              </div>

              {locationLoading ? (
                <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
              ) : locationData ? (
                <div className="space-y-3">
                  <div className="bg-secondary/60 rounded-xl p-4 space-y-3">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Funil</p>
                      <p className="text-sm font-semibold mt-0.5">{String(locationData.funnel_name)}</p>
                    </div>
                    <div className="border-t border-border/40 pt-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Etapa</p>
                      <p className="text-sm font-semibold mt-0.5">{String(locationData.stage_name)}</p>
                    </div>
                    <div className="border-t border-border/40 pt-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Estágio do Bot</p>
                      <p className="text-sm font-semibold mt-0.5 font-mono text-accent">{String(locationData.bot_stage || '—')}</p>
                    </div>
                  </div>

                  {(locationData.issues as string[])?.length > 0 ? (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                      <p className="text-xs text-red-400 font-semibold mb-1">⚠️ Motivos do lead estar invisível:</p>
                      <ul className="text-xs text-red-300/80 space-y-0.5">
                        {(locationData.issues as string[]).map((issue, i) => (
                          <li key={i}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-emerald-400">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Lead visível no Kanban</span>
                    </div>
                  )}

                  {locationData.funnel_slug && (
                    <button
                      onClick={() => { setShowLocationModal(false); navigate(`/crm?funnel=${String(locationData.funnel_slug)}`); }}
                      className="w-full mt-1 flex items-center justify-center gap-2 text-xs px-4 py-2.5 rounded-xl bg-accent/15 text-accent hover:bg-accent/25 transition-colors font-medium"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      Ir para o Funil "{String(locationData.funnel_name)}"
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Erro ao carregar localização</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}

      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 shrink-0">
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          {/* Back + name */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground hover:text-foreground transition flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={nameInputRef}
                    value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") commitName(); if (e.key === "Escape") setEditingName(false); }}
                    className="bg-muted text-sm font-bold rounded-md px-2 py-0.5 border border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/60 w-44"
                  />
                  <button onClick={commitName} disabled={nameSaving} className="p-1 text-green-400 hover:bg-green-400/10 rounded transition-colors">
                    {nameSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => setEditingName(false)} className="p-1 text-muted-foreground hover:bg-secondary/60 rounded transition-colors">
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="group flex items-center gap-1.5">
                  <h1 className="text-base font-bold truncate leading-tight">{lead.name}</h1>
                  <button
                    onClick={() => { setNameDraft(lead.name); setEditingName(true); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-accent transition-all"
                    title="Editar nome"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                <Phone className="w-3 h-3" /> {formatPhoneDisplay(lead.phone)}
                {lead.funnel_name && <><span className="opacity-40">·</span><span>{String(lead.funnel_name)}</span></>}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Approve */}
            <button
              onClick={() => handleVerdict("approved")}
              disabled={updateStatus.isPending}
              title="Aprovar lead"
              className={cn("p-2 rounded-lg transition-all",
                verdict === "approved"
                  ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                  : "hover:bg-secondary text-muted-foreground")}
            >
              <CheckCircle className="w-5 h-5" />
            </button>
            {/* Reject */}
            <button
              onClick={() => handleVerdict("rejected")}
              disabled={updateStatus.isPending}
              title="Reprovar lead"
              className={cn("p-2 rounded-lg transition-all",
                verdict === "rejected"
                  ? "bg-red-500/15 text-red-400 ring-1 ring-red-500/30"
                  : "hover:bg-secondary text-muted-foreground")}
            >
              <XCircle className="w-5 h-5" />
            </button>

            <div className="w-px h-5 bg-border mx-0.5" />

            {/* Localizar no Funil */}
            <button
              onClick={handleLocate}
              disabled={locationLoading}
              title="Localizar lead no funil"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ring-1 transition-all bg-blue-500/10 text-blue-400 ring-blue-500/30 hover:bg-blue-500/20"
            >
              {locationLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Navigation className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Localizar</span>
            </button>

            <div className="w-px h-5 bg-border mx-0.5" />

            {/* Gerar PHC */}
            <button
              onClick={() => navigate("/crm", { state: { activeTab: "phc", subTab: "nova", phcLead: lead } })}
              title="Gerar PHC para este lead"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ring-1 transition-all bg-amber-500/10 text-amber-400 ring-amber-500/30 hover:bg-amber-500/20"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Gerar PHC</span>
            </button>


            <div className="w-px h-5 bg-border mx-0.5" />

            {/* Bot toggle */}
            <button
              onClick={() => toggleBot.mutate(leadId, {
                onSuccess: () => setLead(prev => prev ? { ...prev, bot_active: !prev.bot_active } : prev)
              })}
              disabled={toggleBot.isPending}
              title={isBotActive ? "Parar bot" : "Ativar bot"}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ring-1 transition-all",
                isBotActive
                  ? "bg-red-500/10 text-red-400 ring-red-500/30 hover:bg-red-500/20"
                  : "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30 hover:bg-emerald-500/20")}
            >
              {toggleBot.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : isBotActive ? <BotOff className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isBotActive ? "Parar Bot" : "Ativar Bot"}</span>
            </button>
          </div>

        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto px-4 gap-1 pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors",
                activeTab === tab.key
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              )}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
          <button
            onClick={() => window.location.reload()}
            className="ml-auto p-1.5 rounded-md hover:bg-secondary text-muted-foreground transition"
            title="Atualizar"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 px-4 py-4 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="h-full"
          >
            {activeTab === "conversas" && <ConversationsPanel leadId={leadId} />}
            {activeTab === "info" && <div className="overflow-y-auto h-full scrollbar-thin"><InfoPanel lead={lead} onLeadUpdated={handleLeadUpdated} /></div>}
            {activeTab === "documentos" && <div className="overflow-y-auto h-full scrollbar-thin"><DocumentsPanel leadId={leadId} /></div>}
            {activeTab === "checklist" && <ChecklistPanel leadId={leadId} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};


export default CardDetailView;

