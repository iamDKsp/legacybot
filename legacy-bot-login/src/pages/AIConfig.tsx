import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    ArrowLeft,
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
    Loader2,
    Save,
    RefreshCw,
    CheckCircle2,
    BarChart3,
    Users,
    Bot,
    Zap,
} from "lucide-react";
import { aiConfigApi } from "@/services/api";

// ─── Types ─────────────────────────────────────────────────────
interface AISettings {
    [key: string]: string;
}

interface AIStats {
    activeMemoryPatterns: number;
    totalLeads: number;
    botActiveLeads: number;
}

// ─── Toggle Switch ─────────────────────────────────────────────
function Toggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
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

// ─── Stat Card ─────────────────────────────────────────────────
function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
    return (
        <div className="glass-card rounded-xl px-4 py-3 flex items-center gap-3">
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

// ─── Feature Card ──────────────────────────────────────────────
function FeatureCard({
    icon,
    title,
    description,
    toggleKey,
    settings,
    onToggle,
    children,
    accentColor = "bg-accent/10 text-accent",
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    toggleKey?: string;
    settings: AISettings;
    onToggle: (key: string, value: string) => void;
    children?: React.ReactNode;
    accentColor?: string;
}) {
    const isEnabled = toggleKey ? settings[toggleKey] === "true" : true;

    return (
        <div className={`glass-card rounded-2xl p-5 transition-all duration-300 ${!isEnabled ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accentColor}`}>
                        {icon}
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                    </div>
                </div>
                {toggleKey && (
                    <Toggle
                        id={`toggle-${toggleKey}`}
                        checked={isEnabled}
                        onChange={(v) => onToggle(toggleKey, v ? "true" : "false")}
                    />
                )}
            </div>
            {isEnabled && children && (
                <div className="mt-4 pt-3 border-t border-border/40 space-y-3">
                    {children}
                </div>
            )}
        </div>
    );
}

// ─── Input Row ─────────────────────────────────────────────────
function InputRow({ label, settingKey, settings, onChange, type = "text", suffix }: {
    label: string;
    settingKey: string;
    settings: AISettings;
    onChange: (key: string, value: string) => void;
    type?: string;
    suffix?: string;
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

// ─── Main Page ─────────────────────────────────────────────────
const AIConfig = () => {
    const navigate = useNavigate();
    const [settings, setSettings] = useState<AISettings>({});
    const [stats, setStats] = useState<AIStats>({ activeMemoryPatterns: 0, totalLeads: 0, botActiveLeads: 0 });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [dirty, setDirty] = useState(false);

    // ── Fetch config ──
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

    // ── Handle setting change ──
    const handleChange = useCallback((key: string, value: string) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
        setDirty(true);
        setSaved(false);
    }, []);

    // ── Save changes ──
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
            <div className="min-h-screen bg-card flex items-center justify-center">
                <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Carregando configurações da IA…</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-card text-card-foreground">
            {/* ── Top bar ── */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/90 backdrop-blur px-6 py-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate("/")}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground transition hover:text-card-foreground"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <Brain className="h-5 w-5 text-accent" />
                    <span className="text-base font-semibold">Configurações da IA — Sofia</span>
                </div>
                <div className="flex items-center gap-3">
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
            </div>

            <div className="mx-auto max-w-4xl space-y-6 p-6">
                {/* ── Stats Row ── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <StatCard
                        icon={<BarChart3 className="h-4 w-4" />}
                        label="Padrões de Memória Ativos"
                        value={stats.activeMemoryPatterns}
                        color="bg-violet-500/15 text-violet-400"
                    />
                    <StatCard
                        icon={<Users className="h-4 w-4" />}
                        label="Total de Leads"
                        value={stats.totalLeads}
                        color="bg-blue-500/15 text-blue-400"
                    />
                    <StatCard
                        icon={<Bot className="h-4 w-4" />}
                        label="Leads com Bot Ativo"
                        value={stats.botActiveLeads}
                        color="bg-emerald-500/15 text-emerald-400"
                    />
                </div>

                {/* ── Feature Cards Grid ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 1. Identity */}
                    <FeatureCard
                        icon={<User className="h-5 w-5" />}
                        title="Identidade — Sofia"
                        description="Persona com nome, idade e personalidade"
                        toggleKey="sofia_enabled"
                        settings={settings}
                        onToggle={handleChange}
                        accentColor="bg-pink-500/15 text-pink-400"
                    >
                        <InputRow label="Nome" settingKey="sofia_name" settings={settings} onChange={handleChange} />
                        <InputRow label="Idade" settingKey="sofia_age" settings={settings} onChange={handleChange} type="number" suffix="anos" />
                        <div>
                            <label className="text-xs text-muted-foreground block mb-1.5">Descrição</label>
                            <textarea
                                value={settings.sofia_description || ""}
                                onChange={(e) => handleChange("sofia_description", e.target.value)}
                                rows={2}
                                className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs text-card-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                            />
                        </div>
                    </FeatureCard>

                    {/* 2. Typing Delay */}
                    <FeatureCard
                        icon={<Keyboard className="h-5 w-5" />}
                        title="Delay de Digitação"
                        description="Tempo variável entre mensagens simulando digitação"
                        toggleKey="typing_delay_enabled"
                        settings={settings}
                        onToggle={handleChange}
                        accentColor="bg-blue-500/15 text-blue-400"
                    >
                        <InputRow label="Delay mínimo" settingKey="typing_delay_min_ms" settings={settings} onChange={handleChange} type="number" suffix="ms" />
                        <InputRow label="Delay máximo" settingKey="typing_delay_max_ms" settings={settings} onChange={handleChange} type="number" suffix="ms" />
                        <InputRow label="Por caractere" settingKey="typing_delay_per_char_ms" settings={settings} onChange={handleChange} type="number" suffix="ms" />
                    </FeatureCard>

                    {/* 3. Typing Presence */}
                    <FeatureCard
                        icon={<MessageCircle className="h-5 w-5" />}
                        title="Presence &quot;Digitando...&quot;"
                        description="Mostra indicador de digitação no WhatsApp antes de enviar"
                        toggleKey="typing_presence_enabled"
                        settings={settings}
                        onToggle={handleChange}
                        accentColor="bg-teal-500/15 text-teal-400"
                    >
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Zap className="h-3.5 w-3.5 text-teal-400" />
                            Usa o endpoint <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">sendPresence</code> da API
                        </div>
                    </FeatureCard>

                    {/* 4. Anti-Repetition */}
                    <FeatureCard
                        icon={<Sparkles className="h-5 w-5" />}
                        title="Anti-Repetição"
                        description="Varia saudações e confirmações para não parecer robótica"
                        toggleKey="anti_repetition_enabled"
                        settings={settings}
                        onToggle={handleChange}
                        accentColor="bg-amber-500/15 text-amber-400"
                    >
                        <div className="text-xs text-muted-foreground space-y-1">
                            <p>• Nunca repete "Entendi!" na mesma conversa</p>
                            <p>• Varia: "Claro!", "Com certeza!", "Anotei!", "Beleza!"</p>
                            <p>• Usa gírias leves: "Fica tranquilo(a)", "Tô te ouvindo"</p>
                        </div>
                    </FeatureCard>

                    {/* 5. Emotional Detection */}
                    <FeatureCard
                        icon={<Heart className="h-5 w-5" />}
                        title="Detecção Emocional"
                        description="Detecta ansiedade, raiva ou positividade e adapta o tom"
                        toggleKey="emotional_detection_enabled"
                        settings={settings}
                        onToggle={handleChange}
                        accentColor="bg-rose-500/15 text-rose-400"
                    >
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 px-2.5 py-1.5">
                                <span className="text-orange-400 text-sm">😰</span> Ansioso
                            </div>
                            <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-2.5 py-1.5">
                                <span className="text-red-400 text-sm">😤</span> Irritado
                            </div>
                            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5">
                                <span className="text-emerald-400 text-sm">😊</span> Esperançoso
                            </div>
                            <div className="flex items-center gap-1.5 rounded-lg bg-muted border border-border px-2.5 py-1.5">
                                <span className="text-muted-foreground text-sm">😐</span> Neutro
                            </div>
                        </div>
                    </FeatureCard>

                    {/* 6. Business Hours */}
                    <FeatureCard
                        icon={<Clock className="h-5 w-5" />}
                        title="Horário de Funcionamento"
                        description="Mensagem humanizada fora do expediente (fuso BRT)"
                        toggleKey="business_hours_enabled"
                        settings={settings}
                        onToggle={handleChange}
                        accentColor="bg-indigo-500/15 text-indigo-400"
                    >
                        <div className="flex items-center gap-4">
                            <InputRow label="Início" settingKey="business_hours_start" settings={settings} onChange={handleChange} type="number" suffix="h" />
                            <InputRow label="Fim" settingKey="business_hours_end" settings={settings} onChange={handleChange} type="number" suffix="h" />
                        </div>
                        <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/15 px-3 py-2 text-[10px] text-indigo-300/80 italic">
                            "Oi! Aqui é a Sofia da Legacy 👋 Estou fora do horário, mas já vi sua mensagem! Amanhã cedinho te dou todo suporte."
                        </div>
                    </FeatureCard>

                    {/* 7. Anti-anxiety */}
                    <FeatureCard
                        icon={<Shield className="h-5 w-5" />}
                        title="Mensagem Anti-Ansiedade"
                        description="Envia '⏳ Um segundo...' antes de processar a IA"
                        toggleKey="anti_anxiety_message_enabled"
                        settings={settings}
                        onToggle={handleChange}
                        accentColor="bg-cyan-500/15 text-cyan-400"
                    >
                        <div className="text-xs text-muted-foreground">
                            Evita que o cliente fique "no vácuo" enquanto a IA gera a resposta. Mensagem é efêmera (não salva no banco).
                        </div>
                    </FeatureCard>

                    {/* 8. Client Name */}
                    <FeatureCard
                        icon={<Users className="h-5 w-5" />}
                        title="Personalização por Nome"
                        description="Usa o primeiro nome do cliente naturalmente na conversa"
                        toggleKey="client_name_enabled"
                        settings={settings}
                        onToggle={handleChange}
                        accentColor="bg-fuchsia-500/15 text-fuchsia-400"
                    >
                        <div className="text-xs text-muted-foreground">
                            O nome do WhatsApp é extraído e o primeiro nome é usado com naturalidade (não em todas as mensagens).
                        </div>
                    </FeatureCard>

                    {/* 9. Emoji Rules */}
                    <FeatureCard
                        icon={<Smile className="h-5 w-5" />}
                        title="Regras de Emojis"
                        description="Controle de quantidade e tipo de emojis por mensagem"
                        settings={settings}
                        onToggle={handleChange}
                        accentColor="bg-yellow-500/15 text-yellow-400"
                    >
                        <InputRow label="Máx. emojis/msg" settingKey="emoji_max_per_message" settings={settings} onChange={handleChange} type="number" />
                        <div className="text-xs text-muted-foreground">
                            Preferidos: 🙏 😊 📎 ✅ — Nunca 2+ seguidos
                        </div>
                    </FeatureCard>

                    {/* 10. Message Length */}
                    <FeatureCard
                        icon={<AlignLeft className="h-5 w-5" />}
                        title="Comprimento das Mensagens"
                        description="Limita o tamanho para parecer mais natural"
                        settings={settings}
                        onToggle={handleChange}
                        accentColor="bg-sky-500/15 text-sky-400"
                    >
                        <InputRow label="Máx. linhas/msg" settingKey="max_lines_per_message" settings={settings} onChange={handleChange} type="number" suffix="linhas" />
                        <div className="text-xs text-muted-foreground">
                            Acolhimento: máx. 2 frases. Documentos: bullet points.
                        </div>
                    </FeatureCard>

                    {/* 11. Human Imperfection */}
                    <FeatureCard
                        icon={<Sparkles className="h-5 w-5" />}
                        title="Imperfeição Humana"
                        description='Ocasionalmente usa "Ah, esqueci de mencionar..."'
                        toggleKey="human_imperfection_enabled"
                        settings={settings}
                        onToggle={handleChange}
                        accentColor="bg-orange-500/15 text-orange-400"
                    >
                        <div className="text-xs text-muted-foreground">
                            1 em 20 mensagens inclui expressões como "Na verdade, deixa eu te explicar melhor..." para soar mais humano.
                        </div>
                    </FeatureCard>
                </div>

                {/* ── Info Footer ── */}
                <div className="rounded-xl border border-border bg-muted/10 px-5 py-4 text-xs text-muted-foreground space-y-1.5">
                    <p className="font-medium text-card-foreground/80 flex items-center gap-1.5">
                        <Brain className="h-3.5 w-3.5" /> Sobre a Humanização
                    </p>
                    <p>
                        Todas as configurações são aplicadas em tempo real no prompt da IA e no pipeline de envio de mensagens.
                        As mudanças afetam imediatamente todas as novas conversas.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AIConfig;
