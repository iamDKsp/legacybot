import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    Bot,
    Wifi,
    WifiOff,
    QrCode,
    Send,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Loader2,
    ArrowLeft,
    MessageSquare,
    Zap,
    AlertCircle,
    Phone,
    Terminal,
    Info,
    LogOut,
    Trash2,
    Users,
    Brain,
    User,
    Clock,
    MessageCircle,
    Heart,
    Shield,
    Sparkles,
    Smile,
    AlignLeft,
    Keyboard,
    Save,
    BarChart3,
} from "lucide-react";
import { whatsappApi, aiConfigApi } from "@/services/api";
import UsersTab from "@/components/UsersTab";

// ─── Types (Sofia Tab) ────────────────────────────────────────
interface AISettings {
    [key: string]: string;
}
interface AIStats {
    activeMemoryPatterns: number;
    totalLeads: number;
    botActiveLeads: number;
}

// ─── Sofia Tab Sub-components ─────────────────────────────────
function SofiaToggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
    return (
        <button
            id={id}
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-ring ${
                checked ? "bg-accent" : "bg-muted"
            }`}
        >
            <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${
                    checked ? "translate-x-6" : "translate-x-1"
                }`}
            />
        </button>
    );
}

function SofiaStatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
    return (
        <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3 flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color}`}>
                {icon}
            </div>
            <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{label}</p>
                <p className="text-lg font-bold text-card-foreground">{value}</p>
            </div>
        </div>
    );
}

function SofiaFeatureCard({
    icon, title, description, toggleKey, settings, onToggle, children, accentColor = "bg-accent/10 text-accent",
}: {
    icon: React.ReactNode; title: string; description: string; toggleKey?: string;
    settings: AISettings; onToggle: (key: string, value: string) => void;
    children?: React.ReactNode; accentColor?: string;
}) {
    const isEnabled = toggleKey ? settings[toggleKey] === "true" : true;
    return (
        <div className={`rounded-2xl border border-border bg-secondary/30 p-5 transition-all duration-300 ${!isEnabled ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accentColor}`}>{icon}</div>
                    <div>
                        <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </div>
                </div>
                {toggleKey && (
                    <SofiaToggle
                        id={`toggle-${toggleKey}`}
                        checked={isEnabled}
                        onChange={(v) => onToggle(toggleKey, v ? "true" : "false")}
                    />
                )}
            </div>
            {isEnabled && children && (
                <div className="mt-4 pt-3 border-t border-border/40 space-y-3">{children}</div>
            )}
        </div>
    );
}

function SofiaInputRow({ label, settingKey, settings, onChange, type = "text", suffix }: {
    label: string; settingKey: string; settings: AISettings;
    onChange: (key: string, value: string) => void; type?: string; suffix?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <label className="text-xs text-muted-foreground shrink-0">{label}</label>
            <div className="flex items-center gap-1.5">
                <input
                    type={type}
                    value={settings[settingKey] || ""}
                    onChange={(e) => onChange(settingKey, e.target.value)}
                    className="w-20 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs text-card-foreground text-right focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
            </div>
        </div>
    );
}

// ─── Sofia Tab ────────────────────────────────────────────────
function SofiaTab() {
    const [settings, setSettings] = useState<AISettings>({});
    const [stats, setStats] = useState<AIStats>({ activeMemoryPatterns: 0, totalLeads: 0, botActiveLeads: 0 });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [dirty, setDirty] = useState(false);

    const fetchConfig = useCallback(async () => {
        setLoading(true);
        try {
            const res = await aiConfigApi.getConfig();
            if (res.data.success) {
                setSettings(res.data.data.settings);
                setStats(res.data.data.stats);
            }
        } catch (err) {
            console.error("Failed to fetch AI config:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchConfig(); }, [fetchConfig]);

    const handleChange = useCallback((key: string, value: string) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
        setDirty(true);
        setSaved(false);
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await aiConfigApi.updateConfig(settings);
            setSaved(true);
            setDirty(false);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error("Failed to save AI config:", err);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Carregando configurações da IA…</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Actions row */}
            <div className="flex items-center justify-end gap-3">
                <button
                    onClick={fetchConfig}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground transition hover:text-card-foreground"
                >
                    <RefreshCw className="h-3.5 w-3.5" /> Recarregar
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving || !dirty}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                        saved
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : dirty
                                ? "bg-accent text-accent-foreground hover:opacity-90"
                                : "bg-muted text-muted-foreground cursor-not-allowed"
                    }`}
                >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                    {saving ? "Salvando…" : saved ? "Salvo!" : "Salvar Alterações"}
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SofiaStatCard icon={<BarChart3 className="h-4 w-4" />} label="Padrões de Memória Ativos" value={stats.activeMemoryPatterns} color="bg-violet-500/15 text-violet-400" />
                <SofiaStatCard icon={<Users className="h-4 w-4" />} label="Total de Leads" value={stats.totalLeads} color="bg-blue-500/15 text-blue-400" />
                <SofiaStatCard icon={<Bot className="h-4 w-4" />} label="Leads com Bot Ativo" value={stats.botActiveLeads} color="bg-emerald-500/15 text-emerald-400" />
            </div>

            {/* Feature Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SofiaFeatureCard icon={<User className="h-5 w-5" />} title="Identidade — Sofia" description="Persona com nome, idade e personalidade" toggleKey="sofia_enabled" settings={settings} onToggle={handleChange} accentColor="bg-pink-500/15 text-pink-400">
                    <SofiaInputRow label="Nome" settingKey="sofia_name" settings={settings} onChange={handleChange} />
                    <SofiaInputRow label="Idade" settingKey="sofia_age" settings={settings} onChange={handleChange} type="number" suffix="anos" />
                    <div>
                        <label className="text-xs text-muted-foreground block mb-1.5">Descrição</label>
                        <textarea value={settings.sofia_description || ""} onChange={(e) => handleChange("sofia_description", e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs text-card-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
                    </div>
                </SofiaFeatureCard>

                <SofiaFeatureCard icon={<Keyboard className="h-5 w-5" />} title="Delay de Digitação" description="Tempo variável entre mensagens simulando digitação" toggleKey="typing_delay_enabled" settings={settings} onToggle={handleChange} accentColor="bg-blue-500/15 text-blue-400">
                    <SofiaInputRow label="Delay mínimo" settingKey="typing_delay_min_ms" settings={settings} onChange={handleChange} type="number" suffix="ms" />
                    <SofiaInputRow label="Delay máximo" settingKey="typing_delay_max_ms" settings={settings} onChange={handleChange} type="number" suffix="ms" />
                    <SofiaInputRow label="Por caractere" settingKey="typing_delay_per_char_ms" settings={settings} onChange={handleChange} type="number" suffix="ms" />
                </SofiaFeatureCard>

                <SofiaFeatureCard icon={<MessageCircle className="h-5 w-5" />} title='Presence "Digitando..."' description="Mostra indicador de digitação no WhatsApp antes de enviar" toggleKey="typing_presence_enabled" settings={settings} onToggle={handleChange} accentColor="bg-teal-500/15 text-teal-400">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Zap className="h-3.5 w-3.5 text-teal-400" />Usa o endpoint <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">sendPresence</code> da API</div>
                </SofiaFeatureCard>

                <SofiaFeatureCard icon={<Sparkles className="h-5 w-5" />} title="Anti-Repetição" description="Varia saudações e confirmações para não parecer robótica" toggleKey="anti_repetition_enabled" settings={settings} onToggle={handleChange} accentColor="bg-amber-500/15 text-amber-400">
                    <div className="text-xs text-muted-foreground space-y-1"><p>• Nunca repete "Entendi!" na mesma conversa</p><p>• Varia: "Claro!", "Com certeza!", "Anotei!", "Beleza!"</p><p>• Usa gírias leves: "Fica tranquilo(a)", "Tô te ouvindo"</p></div>
                </SofiaFeatureCard>

                <SofiaFeatureCard icon={<Heart className="h-5 w-5" />} title="Detecção Emocional" description="Detecta ansiedade, raiva ou positividade e adapta o tom" toggleKey="emotional_detection_enabled" settings={settings} onToggle={handleChange} accentColor="bg-rose-500/15 text-rose-400">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 px-2.5 py-1.5"><span className="text-orange-400 text-sm">😰</span> Ansioso</div>
                        <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-2.5 py-1.5"><span className="text-red-400 text-sm">😤</span> Irritado</div>
                        <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5"><span className="text-emerald-400 text-sm">😊</span> Esperançoso</div>
                        <div className="flex items-center gap-1.5 rounded-lg bg-muted border border-border px-2.5 py-1.5"><span className="text-muted-foreground text-sm">😐</span> Neutro</div>
                    </div>
                </SofiaFeatureCard>

                <SofiaFeatureCard icon={<Clock className="h-5 w-5" />} title="Horário de Funcionamento" description="Mensagem humanizada fora do expediente (fuso BRT)" toggleKey="business_hours_enabled" settings={settings} onToggle={handleChange} accentColor="bg-indigo-500/15 text-indigo-400">
                    <div className="flex items-center gap-4">
                        <SofiaInputRow label="Início" settingKey="business_hours_start" settings={settings} onChange={handleChange} type="number" suffix="h" />
                        <SofiaInputRow label="Fim" settingKey="business_hours_end" settings={settings} onChange={handleChange} type="number" suffix="h" />
                    </div>
                    <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/15 px-3 py-2 text-[10px] text-indigo-300/80 italic">"Oi! Aqui é a Sofia da Legacy 👋 Estou fora do horário, mas já vi sua mensagem! Amanhã cedinho te dou todo suporte."</div>
                </SofiaFeatureCard>

                <SofiaFeatureCard icon={<Shield className="h-5 w-5" />} title="Mensagem Anti-Ansiedade" description="Envia '⏳ Um segundo...' antes de processar a IA" toggleKey="anti_anxiety_message_enabled" settings={settings} onToggle={handleChange} accentColor="bg-cyan-500/15 text-cyan-400">
                    <div className="text-xs text-muted-foreground">Evita que o cliente fique "no vácuo" enquanto a IA gera a resposta.</div>
                </SofiaFeatureCard>

                <SofiaFeatureCard icon={<Users className="h-5 w-5" />} title="Personalização por Nome" description="Usa o primeiro nome do cliente naturalmente na conversa" toggleKey="client_name_enabled" settings={settings} onToggle={handleChange} accentColor="bg-fuchsia-500/15 text-fuchsia-400">
                    <div className="text-xs text-muted-foreground">O nome do WhatsApp é extraído e o primeiro nome é usado com naturalidade.</div>
                </SofiaFeatureCard>

                <SofiaFeatureCard icon={<Smile className="h-5 w-5" />} title="Regras de Emojis" description="Controle de quantidade e tipo de emojis por mensagem" settings={settings} onToggle={handleChange} accentColor="bg-yellow-500/15 text-yellow-400">
                    <SofiaInputRow label="Máx. emojis/msg" settingKey="emoji_max_per_message" settings={settings} onChange={handleChange} type="number" />
                    <div className="text-xs text-muted-foreground">Preferidos: 🙏 😊 📎 ✅ — Nunca 2+ seguidos</div>
                </SofiaFeatureCard>

                <SofiaFeatureCard icon={<AlignLeft className="h-5 w-5" />} title="Comprimento das Mensagens" description="Limita o tamanho para parecer mais natural" settings={settings} onToggle={handleChange} accentColor="bg-sky-500/15 text-sky-400">
                    <SofiaInputRow label="Máx. linhas/msg" settingKey="max_lines_per_message" settings={settings} onChange={handleChange} type="number" suffix="linhas" />
                    <div className="text-xs text-muted-foreground">Acolhimento: máx. 2 frases. Documentos: bullet points.</div>
                </SofiaFeatureCard>

                <SofiaFeatureCard icon={<Sparkles className="h-5 w-5" />} title="Imperfeição Humana" description='Ocasionalmente usa "Ah, esqueci de mencionar..."' toggleKey="human_imperfection_enabled" settings={settings} onToggle={handleChange} accentColor="bg-orange-500/15 text-orange-400">
                    <div className="text-xs text-muted-foreground">1 em 20 mensagens inclui expressões para soar mais humano.</div>
                </SofiaFeatureCard>
            </div>

            {/* Footer */}
            <div className="rounded-xl border border-border bg-muted/10 px-5 py-4 text-xs text-muted-foreground space-y-1.5">
                <p className="font-medium text-card-foreground/80 flex items-center gap-1.5"><Brain className="h-3.5 w-3.5" /> Sobre a Humanização</p>
                <p>Todas as configurações são aplicadas em tempo real no prompt da IA e no pipeline de envio de mensagens. As mudanças afetam imediatamente todas as novas conversas.</p>
            </div>
        </div>
    );
}

// ─── Types ────────────────────────────────────────────────────
type ConnStatus = "connected" | "disconnected" | "connecting" | "offline" | "unknown";

interface StatusInfo {
    status: ConnStatus;
    phone?: string;
    instance?: string;
}

// ─── Status Badge ─────────────────────────────────────────────
function StatusBadge({ status }: { status: ConnStatus }) {
    const map: Record<ConnStatus, { icon: React.ReactNode; label: string; cls: string }> = {
        connected: { icon: <CheckCircle2 className="h-4 w-4" />, label: "Conectado", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
        disconnected: { icon: <XCircle className="h-4 w-4" />, label: "Desconectado", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
        connecting: { icon: <Loader2 className="h-4 w-4 animate-spin" />, label: "Conectando…", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
        offline: { icon: <WifiOff className="h-4 w-4" />, label: "Bridge offline", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
        unknown: { icon: <Loader2 className="h-4 w-4 animate-spin" />, label: "Verificando…", cls: "bg-muted text-muted-foreground border-border" },
    };
    const { icon, label, cls } = map[status];
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${cls}`}>
            {icon} {label}
        </span>
    );
}

// ─── Constants ────────────────────────────────────────────────
const BRIDGE_URL = "http://localhost:8081";
const QR_POLL_INTERVAL_MS = 3000;
const QR_POLL_MAX_ATTEMPTS = 25; // ~75 seconds max wait for QR

// ─── Tab Definitions ──────────────────────────────────────────
type SetupTab = "whatsapp" | "sofia" | "usuarios";

// ─── Main Page ────────────────────────────────────────────────
const Setup = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<SetupTab>("whatsapp");
    const [statusInfo, setStatusInfo] = useState<StatusInfo>({ status: "unknown" });
    const [qrBase64, setQrBase64] = useState<string | null>(null);
    const [loadingConnect, setLoadingConnect] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [testPhone, setTestPhone] = useState("");
    const [testMsg, setTestMsg] = useState("Olá! Este é um teste de conexão do Legacy Bot 🤖");
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [loadingTest, setLoadingTest] = useState(false);
    const [connectError, setConnectError] = useState("");
    const [loadingDisconnect, setLoadingDisconnect] = useState(false);
    const [loadingClearCache, setLoadingClearCache] = useState(false);
    const [waitingForQr, setWaitingForQr] = useState(false);
    const [sseConnected, setSseConnected] = useState(false);

    const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const qrPollAttemptsRef = useRef(0);
    const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // ── Stop QR polling ───────────────────────────────────────
    const stopQrPoll = useCallback(() => {
        if (qrPollRef.current) {
            clearInterval(qrPollRef.current);
            qrPollRef.current = null;
        }
        qrPollAttemptsRef.current = 0;
        if (isMounted.current) setWaitingForQr(false);
    }, []);

    // ── QR polling fallback (for when SSE is unavailable) ─────
    const startQrPoll = useCallback(() => {
        stopQrPoll();
        qrPollAttemptsRef.current = 0;
        setWaitingForQr(true);

        qrPollRef.current = setInterval(async () => {
            if (!isMounted.current) { stopQrPoll(); return; }

            qrPollAttemptsRef.current += 1;

            // Give up after max attempts
            if (qrPollAttemptsRef.current > QR_POLL_MAX_ATTEMPTS) {
                console.warn("[QR Poll] Max attempts reached, stopping.");
                stopQrPoll();
                return;
            }

            try {
                const res = await whatsappApi.getQR();
                const data = res.data?.data as { qr?: string; state?: string } | undefined;

                if (!isMounted.current) return;

                if (data?.qr) {
                    console.log("[QR Poll] QR code received!");
                    setQrBase64(data.qr);
                    setStatusInfo(prev => ({ ...prev, status: "connecting" }));
                    stopQrPoll(); // SSE will take over from here
                } else if (data?.state === "open") {
                    console.log("[QR Poll] Already connected!");
                    setStatusInfo(prev => ({ ...prev, status: "connected" }));
                    setQrBase64(null);
                    stopQrPoll();
                }
                // else: still waiting, keep polling
            } catch {
                // QR not yet available, keep trying
            }
        }, QR_POLL_INTERVAL_MS);
    }, [stopQrPoll]);

    // ── Fetch connection status ───────────────────────────────
    const fetchStatus = useCallback(async () => {
        try {
            const res = await whatsappApi.getStatus();
            const d = res.data.data as { state?: string; phone?: string; instance?: string };
            const state = (d.state || "").toLowerCase();
            const mapped: ConnStatus =
                state === "open" || state === "connected" ? "connected"
                    : state === "connecting" || state === "qr" ? "connecting"
                        : state === "close" || state === "disconnected" ? "disconnected"
                            : "disconnected";

            if (!isMounted.current) return mapped;
            setStatusInfo({ status: mapped, phone: d.phone, instance: d.instance });

            if (mapped === "connected") {
                setQrBase64(null);
                stopQrPoll();
            }
            return mapped;
        } catch {
            if (!isMounted.current) return "offline" as ConnStatus;
            setStatusInfo(prev => prev.status === "unknown" ? { status: "offline" } : prev);
            return "offline" as ConnStatus;
        } finally {
            if (isMounted.current) setLoadingStatus(false);
        }
    }, [stopQrPoll]);

    // ── SSE — Real-time events from bridge ────────────────────
    useEffect(() => {
        let eventSource: EventSource | null = null;
        let retryTimeout: ReturnType<typeof setTimeout> | null = null;

        function connect() {
            eventSource = new EventSource(`${BRIDGE_URL}/events`);

            eventSource.onopen = () => {
                console.log("[SSE] Connected to bridge event stream");
                setSseConnected(true);
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (!data?.event) return; // heartbeat ping
                    console.log("[Bridge SSE] Event:", data.event, data.state || "");

                    if (data.event === "qrcode.updated" && data.qr) {
                        setQrBase64(data.qr);
                        setStatusInfo(prev => ({ ...prev, status: "connecting" }));
                        stopQrPoll(); // SSE delivered the QR, stop polling
                    }

                    if (data.event === "connection.update") {
                        const mapped: ConnStatus =
                            data.state === "open" ? "connected" :
                                data.state === "connecting" || data.state === "qr" ? "connecting" :
                                    "disconnected";

                        setStatusInfo(prev => ({ ...prev, status: mapped }));

                        if (mapped === "connected") {
                            setQrBase64(null);
                            stopQrPoll();
                        }
                    }
                } catch (err) {
                    console.error("[Bridge SSE] Parse error:", err);
                }
            };

            eventSource.onerror = () => {
                console.warn("[Bridge SSE] Connection failed, will retry in 5s");
                setSseConnected(false);
                eventSource?.close();
                if (isMounted.current) {
                    retryTimeout = setTimeout(connect, 5000);
                }
            };
        }

        connect();

        return () => {
            eventSource?.close();
            if (retryTimeout) clearTimeout(retryTimeout);
        };
    }, [stopQrPoll]);

    // ── Poll status periodically as safety net ────────────────
    useEffect(() => {
        fetchStatus();
        statusPollRef.current = setInterval(fetchStatus, 15000);
        return () => {
            if (statusPollRef.current) clearInterval(statusPollRef.current);
        };
    }, [fetchStatus]);

    // ── Connect / start QR ────────────────────────────────────
    const handleConnect = useCallback(async () => {
        setLoadingConnect(true);
        setConnectError("");
        setQrBase64(null);
        stopQrPoll();

        try {
            await whatsappApi.connect();
            // Connection request sent — QR will arrive via SSE
            // If SSE is unavailable, start polling as fallback
            setStatusInfo(prev => ({ ...prev, status: "connecting" }));
            startQrPoll(); // Start polling; SSE will stop it if it delivers the QR first
        } catch (e: unknown) {
            const errData = (e as { response?: { data?: { error?: string; details?: string } } })?.response?.data;
            const isNetworkError = (e as { code?: string })?.code === "ERR_NETWORK" ||
                (e as { code?: string })?.code === "ECONNREFUSED";

            if (isNetworkError || !errData) {
                setConnectError("Bridge não está acessível. Verifique se os containers Docker estão rodando.");
                setStatusInfo({ status: "offline" });
            } else {
                setConnectError(errData.error || errData.details || "Erro ao conectar com o WhatsApp bridge");
            }
        } finally {
            setLoadingConnect(false);
        }
    }, [startQrPoll, stopQrPoll]);

    // ── Clear cache + reconnect ────────────────────────────────
    const handleClearCacheAndReconnect = async () => {
        if (!window.confirm("Isso irá apagar a sessão WhatsApp salva e iniciar do zero (novo QR Code). Continuar?")) return;
        setLoadingClearCache(true);
        setConnectError("");
        setQrBase64(null);
        stopQrPoll();

        try {
            // Tell the backend to delete the bridge instance + session files
            await whatsappApi.disconnect();
        } catch {
            // Ignore — bridge may not have an active instance, that's fine
        }

        // Small delay then reconnect fresh
        await new Promise(r => setTimeout(r, 1000));
        setLoadingClearCache(false);
        handleConnect();
    };

    // ── Send test message ─────────────────────────────────────
    const handleTest = async () => {
        if (!testPhone.trim()) return;
        setLoadingTest(true);
        setTestResult(null);
        try {
            await whatsappApi.sendTest(testPhone.trim().replace(/\D/g, ""), testMsg);
            setTestResult({ success: true, message: "✅ Mensagem enviada com sucesso! Verifique o WhatsApp." });
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setTestResult({ success: false, message: msg || "Erro ao enviar. Verifique a conexão com o WhatsApp." });
        } finally {
            setLoadingTest(false);
        }
    };

    // ── Disconnect / Logout ────────────────────────────────────
    const handleDisconnect = async () => {
        if (!window.confirm("Tem certeza que deseja desconectar o WhatsApp? A sessão será encerrada e precisará escanear o QR Code novamente.")) return;
        setLoadingDisconnect(true);
        try {
            await whatsappApi.disconnect();
            setStatusInfo({ status: "disconnected" });
            setQrBase64(null);
            stopQrPoll();
        } catch {
            // silent
        } finally {
            setLoadingDisconnect(false);
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopQrPoll();
            if (statusPollRef.current) clearInterval(statusPollRef.current);
        };
    }, [stopQrPoll]);

    const isConnected = statusInfo.status === "connected";
    const isOffline = statusInfo.status === "offline";
    const isConnecting = statusInfo.status === "connecting";

    return (
        <div className="min-h-screen bg-card text-card-foreground">
            {/* Top bar */}
            <div className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
                <div className="flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate("/")}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground transition hover:text-card-foreground"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                        <Bot className="h-5 w-5 text-accent" />
                        <span className="text-base font-semibold">Configurações</span>
                    </div>
                    {activeTab === "whatsapp" && (
                        <div className="flex items-center gap-2">
                            {sseConnected && (
                                <span className="text-[10px] text-emerald-400/60 font-mono">● SSE</span>
                            )}
                            <StatusBadge status={statusInfo.status} />
                        </div>
                    )}
                </div>

                {/* Tab bar */}
                <div className="flex gap-1 px-6 pb-0">
                    <button
                        onClick={() => setActiveTab("whatsapp")}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-all ${
                            activeTab === "whatsapp"
                                ? "border-accent text-accent bg-accent/5"
                                : "border-transparent text-muted-foreground hover:text-card-foreground hover:bg-muted/30"
                        }`}
                    >
                        <Wifi className="h-4 w-4" />
                        WhatsApp
                    </button>
                    <button
                        onClick={() => setActiveTab("sofia")}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-all ${
                            activeTab === "sofia"
                                ? "border-accent text-accent bg-accent/5"
                                : "border-transparent text-muted-foreground hover:text-card-foreground hover:bg-muted/30"
                        }`}
                    >
                        <Bot className="h-4 w-4" />
                        IA · Sofia
                    </button>
                    <button
                        onClick={() => setActiveTab("usuarios")}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-all ${
                            activeTab === "usuarios"
                                ? "border-accent text-accent bg-accent/5"
                                : "border-transparent text-muted-foreground hover:text-card-foreground hover:bg-muted/30"
                        }`}
                    >
                        <Users className="h-4 w-4" />
                        Usuários
                    </button>
                </div>
            </div>

            <div className="mx-auto max-w-3xl space-y-6 p-6">

            {/* ── Tab: WhatsApp ── */}
            {activeTab === "whatsapp" && (<>

                {/* ── Bridge Offline Banner ── */}
                {isOffline && (
                    <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 p-5 space-y-3">
                        <div className="flex items-center gap-2 text-orange-400 font-semibold">
                            <AlertCircle className="h-5 w-5" /> WhatsApp Bridge não detectada
                        </div>
                        <p className="text-sm text-orange-300/80">
                            A bridge não está respondendo em <code className="rounded bg-orange-500/20 px-1.5 py-0.5 text-orange-300 text-xs">http://localhost:8081</code>.
                            Verifique se os containers estão rodando:
                        </p>
                        <div className="rounded-lg bg-black/40 border border-orange-500/20 px-4 py-3 font-mono text-xs text-emerald-300 flex items-start gap-2">
                            <Terminal className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="space-y-1">
                                <p><span className="text-muted-foreground"># Na pasta do projeto:</span></p>
                                <p>docker-compose up -d --build</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Card 1: Status & Connection ── */}
                <section className="rounded-2xl border border-border bg-secondary/30 p-6">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                            <Wifi className="h-5 w-5 text-accent" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-card-foreground">Status da Conexão</h2>
                            <p className="text-xs text-muted-foreground">WhatsApp Bridge · Porta 8081</p>
                        </div>
                    </div>

                    {loadingStatus ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" /> Verificando status…
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {statusInfo.phone && (
                                <div className="rounded-lg bg-muted/30 px-4 py-3 w-fit">
                                    <p className="text-xs text-muted-foreground mb-1">Número conectado</p>
                                    <div className="flex items-center gap-1.5 text-card-foreground font-medium text-sm">
                                        <Phone className="h-3.5 w-3.5 text-accent" />
                                        +{statusInfo.phone}
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-3">
                                {!isConnected ? (
                                    <button
                                        onClick={handleConnect}
                                        disabled={loadingConnect || loadingClearCache}
                                        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"
                                    >
                                        {loadingConnect ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                                        {loadingConnect ? "Conectando…" : "Conectar WhatsApp"}
                                    </button>
                                ) : (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-2.5 text-sm font-medium text-emerald-400">
                                            <CheckCircle2 className="h-4 w-4" />
                                            WhatsApp Conectado e Ativo
                                        </div>
                                        <button
                                            onClick={handleDisconnect}
                                            disabled={loadingDisconnect}
                                            className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-60"
                                        >
                                            {loadingDisconnect
                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                : <LogOut className="h-4 w-4" />}
                                            {loadingDisconnect ? "Desconectando…" : "Desconectar"}
                                        </button>
                                    </div>
                                )}

                                <button
                                    onClick={fetchStatus}
                                    className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground transition hover:text-card-foreground"
                                >
                                    <RefreshCw className="h-4 w-4" /> Atualizar Status
                                </button>

                                {/* Clear Cache Button */}
                                <button
                                    onClick={handleClearCacheAndReconnect}
                                    disabled={loadingClearCache || loadingConnect}
                                    title="Apaga a sessão salva e gera um novo QR Code"
                                    className="flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2.5 text-sm text-orange-400 transition hover:bg-orange-500/20 disabled:opacity-60"
                                >
                                    {loadingClearCache ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    {loadingClearCache ? "Limpando…" : "Limpar Cache"}
                                </button>
                            </div>

                            {connectError && (
                                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                                    <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                    {connectError}
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {/* ── Card 2: QR Code ── */}
                {!isConnected && (
                    <section className="rounded-2xl border border-border bg-secondary/30 p-6">
                        <div className="mb-5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                                    <QrCode className="h-5 w-5 text-accent" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-semibold text-card-foreground">QR Code</h2>
                                    <p className="text-xs text-muted-foreground">Escaneie para vincular o número</p>
                                </div>
                            </div>
                            {qrBase64 && (
                                <button
                                    onClick={handleConnect}
                                    disabled={loadingConnect}
                                    className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground transition hover:text-card-foreground"
                                >
                                    <RefreshCw className="h-3.5 w-3.5" /> Novo QR
                                </button>
                            )}
                        </div>

                        {qrBase64 ? (
                            <div className="flex flex-col items-center gap-5">
                                <div className="rounded-2xl bg-white p-4 shadow-xl ring-4 ring-accent/20">
                                    <img
                                        src={qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                                        alt="QR Code WhatsApp"
                                        className="h-56 w-56 object-contain"
                                    />
                                </div>
                                <div className="text-center space-y-2 max-w-xs">
                                    <p className="text-sm font-semibold text-card-foreground">Como escanear</p>
                                    <ol className="text-xs text-muted-foreground space-y-1.5 text-left">
                                        <li className="flex items-start gap-2"><span className="text-accent font-bold">1.</span> Abra o WhatsApp no celular</li>
                                        <li className="flex items-start gap-2"><span className="text-accent font-bold">2.</span> Toque em ⋮ Menu → <strong>Dispositivos Vinculados</strong></li>
                                        <li className="flex items-start gap-2"><span className="text-accent font-bold">3.</span> Toque em <strong>Vincular um Dispositivo</strong></li>
                                        <li className="flex items-start gap-2"><span className="text-accent font-bold">4.</span> Aponte a câmera para o QR Code acima</li>
                                    </ol>
                                    <p className="text-[10px] text-muted-foreground pt-1">O QR Code expira em ~60 segundos. Clique em "Novo QR" se expirar.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-14 text-center">
                                {isConnecting || waitingForQr ? (
                                    <>
                                        <Loader2 className="h-10 w-10 text-accent animate-spin" />
                                        <div>
                                            <p className="text-sm font-medium text-card-foreground">Gerando QR Code…</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {waitingForQr
                                                    ? "Atualizando automaticamente…"
                                                    : "Aguarde, isso pode levar alguns segundos"
                                                }
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <WifiOff className="h-10 w-10 text-muted-foreground/40" />
                                        <div>
                                            <p className="text-sm text-muted-foreground">Clique em <strong className="text-card-foreground">Conectar WhatsApp</strong> acima</p>
                                            <p className="text-xs text-muted-foreground mt-1">O QR Code aparecerá aqui automaticamente</p>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </section>
                )}

                {/* ── Card 3: Test Message ── */}
                <section className="rounded-2xl border border-border bg-secondary/30 p-6">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                            <MessageSquare className="h-5 w-5 text-accent" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-card-foreground">Testar Envio de Mensagem</h2>
                            <p className="text-xs text-muted-foreground">Valide se o bot consegue enviar mensagens via WhatsApp</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                                Número de destino (com DDI e DDD, sem espaços)
                            </label>
                            <div className="flex items-center rounded-lg border border-border bg-muted overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                                <span className="px-3 py-2.5 text-sm text-muted-foreground border-r border-border">+</span>
                                <input
                                    type="tel"
                                    placeholder="5531999999999"
                                    value={testPhone}
                                    onChange={(e) => setTestPhone(e.target.value)}
                                    className="flex-1 bg-transparent px-3 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                                Mensagem de teste
                            </label>
                            <textarea
                                rows={2}
                                value={testMsg}
                                onChange={(e) => setTestMsg(e.target.value)}
                                className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-card-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                            />
                        </div>

                        <button
                            onClick={handleTest}
                            disabled={loadingTest || !testPhone.trim() || !isConnected}
                            title={!isConnected ? "Conecte o WhatsApp primeiro" : ""}
                            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"
                        >
                            {loadingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            {loadingTest ? "Enviando…" : "Enviar Mensagem"}
                        </button>

                        {!isConnected && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <Info className="h-3.5 w-3.5" />
                                {isOffline ? "Inicie a bridge WhatsApp primeiro" : "Conecte ao WhatsApp para enviar mensagens"}
                            </p>
                        )}

                        {testResult && (
                            <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${testResult.success
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : "bg-red-500/10 border-red-500/30 text-red-400"
                                }`}>
                                {testResult.success ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                                {testResult.message}
                            </div>
                        )}
                    </div>
                </section>

                {/* ── Info Footer ── */}
                <div className="rounded-xl border border-border bg-muted/10 px-5 py-4 text-xs text-muted-foreground space-y-1.5">
                    <p className="font-medium text-card-foreground/80 flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5" /> Como funciona a integração
                    </p>
                    <p>O bot usa a <strong className="text-card-foreground/70">Baileys Bridge</strong> para conectar ao WhatsApp. Após escanear o QR, o número fica vinculado e todas as mensagens recebidas são respondidas automaticamente pelo bot de IA.</p>
                    <p className="pt-1">Use o botão <strong className="text-orange-400">Limpar Cache</strong> se o QR não aparecer — isso apaga a sessão antiga e força uma reconexão limpa.</p>
                </div>
            </>)}

            {/* ── Tab: IA · Sofia ── */}
            {activeTab === "sofia" && (
                <SofiaTab />
            )}

            {/* ── Tab: Usuários ── */}
            {activeTab === "usuarios" && (
                <UsersTab />
            )}

            </div>
        </div>
    );
};

export default Setup;
