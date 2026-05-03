import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, FolderKanban, Database, Settings, Loader2, LogOut, AlertCircle, Eye, EyeOff, Mail, Lock, Sparkles, Shield, Zap, ArrowRight, X, UserCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import sofiaImg from "@/assets/sofia-3d.png";
import SofiaWizard from "@/components/SofiaWizard";

const modules = [
  {
    title: "Processos",
    description: "Gerencie e automatize seus fluxos de trabalho",
    icon: FolderKanban,
    href: "/crm",
  },
  {
    title: "Banco de Dados",
    description: "Consulte e administre seus dados",
    icon: Database,
    href: "/database",
  },
  {
    title: "Configurações",
    description: "Configure WhatsApp, bot e integrações",
    icon: Settings,
    href: "/setup",
  },
];

/* ── Floating Particles Component ── */
const FloatingParticles = () => {
  const particles = useMemo(() =>
    Array.from({ length: 18 }, (_, i) => ({
      id: i,
      size: Math.random() * 4 + 2,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 6,
      duration: Math.random() * 4 + 5,
      opacity: Math.random() * 0.3 + 0.1,
    })), []);

  return (
    <>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full animate-float"
          style={{
            width: `${p.size}px`,
            height: `${p.size}px`,
            left: `${p.left}%`,
            top: `${p.top}%`,
            background: `radial-gradient(circle, hsl(43 72% 49% / ${p.opacity}), transparent)`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            filter: `blur(${p.size > 4 ? 1 : 0}px)`,
          }}
        />
      ))}
    </>
  );
};

/* ── Orbital Rings Component ── */
const OrbitalRings = () => (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
    {/* Ring 1 */}
    <div
      className="absolute w-[280px] h-[280px] rounded-full border border-accent/[0.06] animate-orbit"
      style={{ animationDuration: "25s" }}
    >
      <div className="absolute -top-1 left-1/2 w-2 h-2 rounded-full bg-accent/30 shadow-[0_0_8px_hsl(43_72%_49%/0.3)]" />
    </div>
    {/* Ring 2 */}
    <div
      className="absolute w-[380px] h-[380px] rounded-full border border-accent/[0.04] animate-orbit-reverse"
      style={{ animationDuration: "35s" }}
    >
      <div className="absolute top-1/2 -right-1 w-1.5 h-1.5 rounded-full bg-accent/20 shadow-[0_0_6px_hsl(43_72%_49%/0.2)]" />
    </div>
    {/* Ring 3 */}
    <div
      className="absolute w-[460px] h-[460px] rounded-full border border-accent/[0.03] animate-orbit"
      style={{ animationDuration: "45s" }}
    >
      <div className="absolute -bottom-1 left-1/3 w-1 h-1 rounded-full bg-accent/15" />
    </div>
  </div>
);

/* ── Speech Bubble (Typewriter) Component ── */
const SPEECH_PHRASES = [
  "Olá!",
  "Tudo bem?",
  "Eu sou a Sofia!",
  "Posso ajudar?",
];

const SpeechBubble = () => {
  const [text, setText] = useState("");
  const phraseIdx = useRef(0);
  const charIdx = useRef(0);
  const isDeleting = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tick = useCallback(() => {
    const phrase = SPEECH_PHRASES[phraseIdx.current];

    if (isDeleting.current) {
      charIdx.current--;
      setText(phrase.substring(0, charIdx.current));
    } else {
      charIdx.current++;
      setText(phrase.substring(0, charIdx.current));
    }

    let speed = isDeleting.current ? 40 : 80;
    speed += Math.random() * 30;

    if (!isDeleting.current && charIdx.current === phrase.length) {
      speed = 2200;
      isDeleting.current = true;
    } else if (isDeleting.current && charIdx.current === 0) {
      isDeleting.current = false;
      phraseIdx.current = (phraseIdx.current + 1) % SPEECH_PHRASES.length;
      speed = 500;
    }

    timeoutRef.current = setTimeout(tick, speed);
  }, []);

  useEffect(() => {
    timeoutRef.current = setTimeout(tick, 1200);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [tick]);

  return (
    <div className="animate-bubble-float animate-slide-up" style={{ animationDelay: "1s" }}>
      <div className="speech-bubble">
        <p className="text-gray-800 text-sm font-medium m-0 tracking-wide whitespace-nowrap">
          <span>{text}</span>
          <span className="speech-cursor" />
        </p>
      </div>
    </div>
  );
};

const Index = () => {
  const navigate = useNavigate();
  const { login, logout, isAuthenticated, user, rememberedUsers, loginAsRemembered, forgetUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showModules, setShowModules] = useState(isAuthenticated);
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [quickLoginLoading, setQuickLoginLoading] = useState<number | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const result = await login(email, password, rememberMe);

    if (result.success) {
      setShowLoadingScreen(true);
      setTimeout(() => {
        setShowLoadingScreen(false);
        setShowModules(true);
      }, 1500);
    } else {
      setError(result.error || "Erro ao fazer login");
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (remembered: typeof rememberedUsers[0]) => {
    setError("");
    setQuickLoginLoading(remembered.id);

    const result = await loginAsRemembered(remembered);

    if (result.success) {
      setShowLoadingScreen(true);
      setTimeout(() => {
        setShowLoadingScreen(false);
        setShowModules(true);
      }, 1500);
    } else {
      setError(result.error || "Sessão expirada. Faça login novamente.");
      setQuickLoginLoading(null);
    }
  };

  const handleLogout = () => {
    logout();
    setShowModules(false);
    setEmail("");
    setPassword("");
  };

  // Loading screen
  if (showLoadingScreen) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-6 animate-fade-in relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-accent/3" />
        <div className="relative">
          <div className="absolute inset-0 bg-accent/20 rounded-full blur-2xl animate-glow-pulse" />
          <Bot className="relative h-12 w-12 text-accent drop-shadow-[0_0_15px_hsl(43_72%_49%/0.4)]" />
        </div>
        <Loader2 className="h-8 w-8 text-accent animate-spin" />
        <p className="text-sm text-muted-foreground font-light tracking-wide">Carregando módulos...</p>
      </div>
    );
  }

  // Module selection screen (after login)
  if (showModules || isAuthenticated) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background p-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/3 via-transparent to-accent/2" />
        <div className="w-full max-w-4xl animate-fade-in relative z-10">
          {/* Header */}
          <div className="mb-12 text-center">
            <div className="mb-4 flex items-center justify-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-accent/20 rounded-full blur-xl" />
                <Bot className="relative h-9 w-9 text-accent" />
              </div>
              <span
                className="text-3xl font-bold text-card-foreground"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Legacy Bot
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Bem-vindo, <span className="text-accent font-medium">{user?.name || "Usuário"}</span> — Selecione um módulo
            </p>
          </div>

          {/* Modules */}
          <div className="grid gap-6 sm:grid-cols-3">
            {modules.map((mod, i) => (
              <a
                key={mod.title}
                href={mod.href === "#" ? undefined : mod.href}
                data-wizard-id={
                  mod.href === "/crm" ? "module-crm" :
                  mod.href === "/database" ? "module-database" :
                  mod.href === "/setup" ? "module-setup" : undefined
                }
                onClick={(e) => {
                  if (mod.href === "#") return;
                  e.preventDefault();
                  navigate(mod.href);
                }}
                className={`group flex flex-col items-center gap-6 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm p-10 text-center transition-all duration-500 hover:border-accent/40 hover:bg-card/80 hover:shadow-[0_8px_40px_-12px_hsl(43_72%_49%/0.15)] hover:-translate-y-1.5 animate-slide-up ${mod.href === "#" ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                  }`}
                style={{ animationDelay: `${i * 120}ms`, animationFillMode: "both" }}
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 transition-all duration-500 group-hover:bg-accent/20 group-hover:shadow-[0_0_20px_hsl(43_72%_49%/0.1)]">
                  <mod.icon className="h-8 w-8 text-accent transition-transform duration-500 group-hover:scale-110" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-card-foreground mb-2">
                    {mod.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {mod.description}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className="absolute bottom-6 right-6 flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-card/60 backdrop-blur-sm text-muted-foreground transition-all duration-300 hover:bg-accent/10 hover:text-accent hover:border-accent/30 hover:shadow-[0_0_15px_hsl(43_72%_49%/0.1)]"
          title="Sair"
        >
          <LogOut className="h-5 w-5" />
        </button>

        {/* Sofia onboarding wizard — only shown to user once */}
        {user && <SofiaWizard userId={user.id} />}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  //  LOGIN SCREEN — Sua Agente Sofia
  // ════════════════════════════════════════════════════════════
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 font-sans selection:bg-accent/30 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-accent/[0.03] rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent/[0.02] rounded-full blur-[100px]" />
      </div>

      <div
        className="flex w-full max-w-[1100px] min-h-[620px] overflow-hidden rounded-[2rem] shadow-[0_0_80px_-20px_rgba(0,0,0,0.6)] bg-card border border-border/30 animate-fade-in-scale relative"
        style={{ animationDuration: "0.8s" }}
      >
        {/* ── LEFT PANEL — Sua Agente Sofia ── */}
        <div className="hidden w-[48%] flex-col items-center justify-between bg-gradient-to-br from-[hsl(30_6%_10%)] via-[hsl(30_6%_13%)] to-[hsl(30_8%_11%)] p-8 pt-10 pb-6 lg:flex relative overflow-hidden">

          {/* Ambient glow background */}
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-accent/[0.06] rounded-full blur-[120px] animate-glow-pulse" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[300px] h-[200px] bg-purple-500/[0.04] rounded-full blur-[80px]" />
          <div className="absolute top-[-10%] right-[-10%] w-[200px] h-[200px] bg-accent/[0.03] rounded-full blur-[80px]" />

          {/* Floating particles */}
          <FloatingParticles />

          {/* Orbital rings — centered on Sofia */}
          <div className="absolute top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div
              className="w-[300px] h-[300px] rounded-full border border-accent/[0.05] animate-orbit"
              style={{ animationDuration: "30s" }}
            >
              <div className="absolute -top-1 left-1/2 w-2 h-2 rounded-full bg-accent/25 shadow-[0_0_8px_hsl(43_72%_49%/0.2)]" />
            </div>
          </div>
          <div className="absolute top-[35%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div
              className="w-[400px] h-[400px] rounded-full border border-accent/[0.03] animate-orbit-reverse"
              style={{ animationDuration: "40s" }}
            >
              <div className="absolute top-1/2 -right-1 w-1.5 h-1.5 rounded-full bg-accent/15" />
            </div>
          </div>

          {/* Typography — Sua Agente Sofia (above the image) */}
          <div className="relative z-10 text-center animate-slide-up" style={{ animationDelay: "0.3s" }}>
            <p className="text-xs font-light tracking-[0.2em] text-muted-foreground/60 uppercase mb-1">
              Sua Agente
            </p>
            <h2
              className="text-5xl font-bold sofia-text-gradient tracking-tight leading-none"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Sofia
            </h2>
          </div>

          {/* Sofia 3D Character Image + Speech Bubble */}
          <div className="relative z-10 flex-1 flex items-end justify-center w-full mt-2 animate-slide-up" style={{ animationDelay: "0.15s" }}>
            {/* Glow behind Sofia */}
            <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[250px] h-[250px] bg-accent/[0.08] rounded-full blur-[80px] animate-glow-pulse" />
            <div className="absolute bottom-[5%] left-1/2 -translate-x-1/2 w-[180px] h-[60px] bg-accent/[0.12] rounded-full blur-[30px]" />

            {/* Speech Bubble — positioned near Sofia's face, slightly overlapping */}
            <div className="absolute top-[8%] right-[15%] z-20">
              <SpeechBubble />
            </div>

            {/* Sofia + Neon Bar — group hover for unified scale */}
            <div className="relative group/sofia transition-transform duration-700 hover:scale-[1.03]">
              {/* Sofia image */}
              <img
                src={sofiaImg}
                alt="Sofia — Sua Agente Inteligente"
                className="relative z-10 w-auto max-h-[380px] object-contain drop-shadow-[0_10px_40px_rgba(0,0,0,0.4)]"
                style={{
                  filter: "drop-shadow(0 0 30px hsl(43 72% 49% / 0.12))",
                }}
                draggable={false}
              />

              {/* Neon Gold Bar — divider right where Sofia ends */}
              <div className="relative z-20 mt-0 px-2">
                <div className="neon-bar-wrapper">
                  <div className="neon-bar" />
                </div>
              </div>
            </div>
          </div>

          {/* Description + Badges at bottom */}
          <div className="relative z-10 text-center mt-4 space-y-4 animate-slide-up" style={{ animationDelay: "0.6s" }}>
            <p className="max-w-[260px] mx-auto text-[12px] leading-[1.7] text-muted-foreground/50 font-light">
              Sua assistente inteligente — sempre pronta para atender, vender e automatizar.
            </p>

            <div className="flex items-center justify-center gap-5">
              {[
                { icon: Shield, label: "Segurança" },
                { icon: Zap, label: "IA Ativa" },
                { icon: Sparkles, label: "Automação" },
              ].map((badge) => (
                <div
                  key={badge.label}
                  className="flex items-center gap-1.5 text-muted-foreground/30 text-[9px] uppercase tracking-[0.2em] group/badge transition-colors duration-300 hover:text-muted-foreground/60"
                >
                  <badge.icon className="h-2.5 w-2.5 text-accent/35 group-hover/badge:text-accent/70 transition-colors duration-300" />
                  {badge.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL — Login Form ── */}
        <div className="flex w-full flex-col items-center justify-center bg-card p-8 sm:p-12 lg:w-[52%] relative">

          {/* Decorative dots */}
          <div className="absolute top-6 right-6 grid grid-cols-2 gap-1.5 opacity-40">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-accent/30 animate-particle-fade"
                style={{ animationDelay: `${i * 0.5}s` }}
              />
            ))}
          </div>

          {/* Logo */}
          <div
            className="mb-8 flex items-center gap-2.5 animate-slide-up"
            style={{ animationDelay: "0.1s" }}
          >
            <div className="relative">
              <div className="absolute inset-0 bg-accent/20 rounded-full blur-lg" />
              <Bot className="relative h-8 w-8 text-accent" />
            </div>
            <span
              className="text-2xl font-bold text-card-foreground tracking-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Legacy Bot
            </span>
          </div>

          {/* Title */}
          <h1
            className="mb-2 text-3xl font-bold text-card-foreground tracking-tight animate-slide-up"
            style={{ fontFamily: "'Space Grotesk', sans-serif", animationDelay: "0.2s" }}
          >
            Bem-vindo de volta
          </h1>
          <p
            className="mb-10 text-sm text-center text-muted-foreground/70 max-w-[260px] leading-relaxed font-light animate-slide-up"
            style={{ animationDelay: "0.3s" }}
          >
            Insira suas credenciais para acessar o painel
          </p>

          {/* Error message */}
          {error && (
            <div className="mb-5 w-full max-w-sm flex items-center gap-2.5 rounded-xl bg-red-500/8 border border-red-500/20 px-4 py-3 text-sm text-red-400 animate-slide-up backdrop-blur-sm">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15 flex-shrink-0">
                <AlertCircle className="h-3.5 w-3.5" />
              </div>
              <span className="font-light">{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form
            onSubmit={handleLogin}
            className="w-full max-w-sm space-y-4"
          >
            {/* Email input */}
            <div
              className={`relative flex items-center rounded-xl border bg-muted/30 login-input-focus animate-slide-up ${emailFocused ? 'border-accent/40 shadow-[0_0_0_3px_hsl(43_72%_49%/0.06)]' : 'border-border/60'}`}
              style={{ animationDelay: "0.4s" }}
            >
              <div className={`pl-4 transition-colors duration-300 ${emailFocused ? 'text-accent' : 'text-muted-foreground/50'}`}>
                <Mail className="h-4 w-4" />
              </div>
              <input
                id="login-email"
                type="email"
                placeholder="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                className="w-full bg-transparent px-3 py-3.5 text-sm text-card-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                required
                disabled={isLoading}
              />
            </div>

            {/* Password input */}
            <div
              className={`relative flex items-center rounded-xl border bg-muted/30 login-input-focus animate-slide-up ${passwordFocused ? 'border-accent/40 shadow-[0_0_0_3px_hsl(43_72%_49%/0.06)]' : 'border-border/60'}`}
              style={{ animationDelay: "0.5s" }}
            >
              <div className={`pl-4 transition-colors duration-300 ${passwordFocused ? 'text-accent' : 'text-muted-foreground/50'}`}>
                <Lock className="h-4 w-4" />
              </div>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                placeholder="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                className="w-full bg-transparent px-3 py-3.5 text-sm text-card-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                required
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="pr-4 text-muted-foreground/50 hover:text-accent transition-colors duration-300 p-1"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Remember me + Forgot password */}
            <div
              className="flex items-center justify-between animate-slide-up"
              style={{ animationDelay: "0.55s" }}
            >
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border bg-muted accent-accent cursor-pointer"
                />
                <span className="text-xs text-muted-foreground/50 group-hover:text-muted-foreground transition-colors font-light">Lembrar de mim</span>
              </label>
              <button
                type="button"
                className="text-xs text-muted-foreground/50 hover:text-accent transition-colors duration-300 font-light"
                tabIndex={-1}
              >
                Esqueceu a senha?
              </button>
            </div>

            {/* Submit button */}
            <div
              className="animate-slide-up pt-1"
              style={{ animationDelay: "0.6s" }}
            >
              <button
                id="login-submit"
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl py-3.5 text-sm font-semibold text-accent-foreground transition-all duration-400 flex items-center justify-center gap-2 btn-login-glow disabled:opacity-60 disabled:pointer-events-none"
                style={{
                  background: "linear-gradient(135deg, hsl(43 72% 49%), hsl(43 80% 55%), hsl(43 72% 45%))",
                  backgroundSize: "200% auto",
                  animation: isLoading ? undefined : "gradient-shift 4s ease infinite",
                }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Entrando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* ── Remembered Users ── */}
          {rememberedUsers.length > 0 && (
            <div
              className="w-full max-w-sm mt-6 animate-slide-up"
              style={{ animationDelay: "0.7s" }}
            >
              <p className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.15em] font-medium mb-3 text-center">Acesso rápido</p>
              <div className="space-y-2">
                {rememberedUsers.map((ru) => (
                  <div
                    key={ru.id}
                    className="group relative flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 px-4 py-3 transition-all duration-300 hover:border-accent/30 hover:bg-muted/30 cursor-pointer"
                    onClick={() => handleQuickLogin(ru)}
                  >
                    {/* Avatar */}
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent font-semibold text-xs uppercase flex-shrink-0">
                      {ru.avatar_url ? (
                        <img src={ru.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <UserCircle2 className="h-5 w-5" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-card-foreground truncate">{ru.name}</p>
                      <p className="text-[11px] text-muted-foreground/50 truncate">{ru.email}</p>
                    </div>

                    {/* Loading or Arrow */}
                    {quickLoginLoading === ru.id ? (
                      <Loader2 className="h-4 w-4 text-accent animate-spin flex-shrink-0" />
                    ) : (
                      <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-accent transition-colors flex-shrink-0" />
                    )}

                    {/* Forget button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        forgetUser(ru.id);
                      }}
                      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-card border border-border text-muted-foreground/40 hover:text-red-400 hover:border-red-500/40 transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                      title="Esquecer usuário"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom subtle text */}
          <p
            className="mt-10 text-[11px] text-muted-foreground/30 font-light tracking-wide animate-slide-up"
            style={{ animationDelay: "0.8s" }}
          >
            Protegido por criptografia de ponta a ponta
          </p>
        </div>
      </div>
    </div>
  );
};

export default Index;
