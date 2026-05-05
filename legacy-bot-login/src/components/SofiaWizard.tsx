import { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronRight, ChevronLeft, Sparkles, Bot } from "lucide-react";
import sofiaImg from "@/assets/sofia-3d.png";

// ── Per-user localStorage key (main onboarding wizard) ────────
export function getWizardKey(userId: number | string) {
  return `legacy_onboarding_done_${userId}`;
}
export function isWizardDone(userId: number | string) {
  return localStorage.getItem(getWizardKey(userId)) === "true";
}
export function setWizardDone(userId: number | string) {
  localStorage.setItem(getWizardKey(userId), "true");
}
export function resetWizard(userId: number | string) {
  localStorage.removeItem(getWizardKey(userId));
}

// ── Step definition ────────────────────────────────────────────
export interface WizardStep {
  id: string;
  targetId?: string;
  title: string;
  text: string;
}

// ── Main onboarding steps (shown once after first login) ───────
const STEPS: WizardStep[] = [
  {
    id: "welcome",
    title: "Oi! Eu sou a Sofia 👋",
    text: "Seja muito bem-vindo(a) ao Legacy Bot! Sou sua assistente inteligente e vou te guiar pelo sistema. Vamos dar uma voltinha rápida?",
  },
  {
    id: "crm",
    targetId: "module-crm",
    title: "Módulo de Processos 📋",
    text: "Aqui você gerencia todos os seus leads num quadro Kanban. Cada coluna é uma etapa do funil de atendimento. Arraste os cards para avançar os clientes no processo!",
  },
  {
    id: "database",
    targetId: "module-database",
    title: "Banco de Dados 🗄️",
    text: "Aqui ficam todos os dados coletados: leads, documentos verificados e a base de conhecimento que uso para responder os clientes com precisão. Você também edita meus prompts aqui!",
  },
  {
    id: "setup",
    targetId: "module-setup",
    title: "Configurações ⚙️",
    text: "Aqui você conecta o WhatsApp escaneando o QR Code, gerencia os usuários do sistema e ajusta minhas configurações de IA. É o primeiro passo para me deixar online!",
  },
  {
    id: "finish",
    title: "Tudo pronto! 🎉",
    text: "Parabéns, você já conhece o básico! Em cada módulo vou aparecer com dicas extras. Se precisar de mim, estarei aqui respondendo seus clientes 24 horas por dia. Boa sorte!",
  },
];

// ── Typewriter text (bug-fixed: onDone kept in ref to avoid re-runs) ──
function TypewriterText({ text, onDone }: { text: string; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState("");
  const charRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stabilise onDone in a ref so it never causes the effect to re-run
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    setDisplayed("");
    charRef.current = 0;

    function tick() {
      charRef.current++;
      setDisplayed(text.substring(0, charRef.current));
      if (charRef.current < text.length) {
        timerRef.current = setTimeout(tick, 22 + Math.random() * 18);
      } else {
        onDoneRef.current?.();
      }
    }
    timerRef.current = setTimeout(tick, 100);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [text]); // ← only text, never onDone → no more infinite resets

  return (
    <span>
      {displayed}
      {displayed.length < text.length && <span className="wizard-cursor" />}
    </span>
  );
}

// ── Confetti ───────────────────────────────────────────────────
function Confetti() {
  const pieces = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 1.5,
    duration: 2 + Math.random() * 2,
    color: ["#C9A227", "#F0C040", "#ffffff", "#e0a020", "#f5d97a"][i % 5],
    size: 6 + Math.random() * 6,
    rotate: Math.random() * 360,
  }));

  return (
    <div className="wizard-confetti-wrap pointer-events-none">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="wizard-confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

// ── Spotlight ring around a targeted element ───────────────────
function SpotlightTarget({ targetId }: { targetId?: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!targetId) { setRect(null); return; }
    const el = document.querySelector(`[data-wizard-id="${targetId}"]`);
    if (el) {
      setRect(el.getBoundingClientRect());
      el.classList.add("wizard-target-highlight");
    }
    return () => {
      document
        .querySelector(`[data-wizard-id="${targetId}"]`)
        ?.classList.remove("wizard-target-highlight");
    };
  }, [targetId]);

  if (!rect) return null;
  const PAD = 12;
  return (
    <div
      className="wizard-spotlight-ring"
      style={{
        position: "fixed",
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
        zIndex: 10001,
        pointerEvents: "none",
      }}
    />
  );
}

// ── Shared bubble UI (used by both wizard and context guide) ───
interface BubbleProps {
  steps: WizardStep[];
  step: number;
  textDone: boolean;
  exiting: boolean;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  onTextDone: () => void;
  isLastLabel?: string;
}

function SofiaBubble({ steps, step, textDone, exiting, onNext, onPrev, onClose, onTextDone, isLastLabel = "Começar!" }: BubbleProps) {
  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <>
      <div
        className={`wizard-overlay ${exiting ? "wizard-overlay-exit" : "wizard-overlay-enter"}`}
        onClick={onClose}
        style={{ zIndex: 10000 }}
      />
      {current.targetId && <SpotlightTarget targetId={current.targetId} />}
      {isLast && <Confetti />}

      <div
        className={`wizard-sofia-container ${exiting ? "wizard-sofia-exit" : "wizard-sofia-enter"}`}
        style={{ zIndex: 10002 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wizard-bubble-wrap">
          {/* Step dots */}
          {steps.length > 1 && (
            <div className="wizard-dots">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`wizard-dot ${i === step ? "wizard-dot-active" : i < step ? "wizard-dot-done" : ""}`}
                />
              ))}
            </div>
          )}

          <div className="wizard-bubble-title">
            <Sparkles className="h-3.5 w-3.5 text-accent flex-shrink-0" />
            <span>{current.title}</span>
          </div>

          <p className="wizard-bubble-text">
            <TypewriterText
              key={`bubble-${step}`}
              text={current.text}
              onDone={onTextDone}
            />
          </p>

          <div className="wizard-bubble-actions">
            <button className="wizard-btn-skip" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
              Fechar
            </button>

            <div className="flex items-center gap-2">
              {step > 0 && (
                <button className="wizard-btn-back" onClick={onPrev}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <button
                className={`wizard-btn-next ${textDone ? "wizard-btn-next-ready" : ""}`}
                onClick={onNext}
              >
                {isLast ? (
                  <>
                    <Bot className="h-4 w-4" />
                    {isLastLabel}
                  </>
                ) : (
                  <>
                    Próximo
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="wizard-bubble-tail" />
        </div>

        <div className="wizard-sofia-wrap">
          <div className="wizard-sofia-glow" />
          <img src={sofiaImg} alt="Sofia" className="wizard-sofia-img" draggable={false} />
        </div>
      </div>
    </>
  );
}

// ── Main SofiaWizard (onboarding, shown once per user) ─────────
interface SofiaWizardProps {
  userId: number;
}

const SofiaWizard = ({ userId }: SofiaWizardProps) => {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [textDone, setTextDone] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (isWizardDone(userId)) return;
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, [userId]);

  const close = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
      setWizardDone(userId);
    }, 400);
  }, [userId]);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setTextDone(false);
      setStep((s) => s + 1);
    } else {
      close();
    }
  }, [step, close]);

  const prev = useCallback(() => {
    if (step > 0) {
      setTextDone(false);
      setStep((s) => s - 1);
    }
  }, [step]);

  if (!visible) return null;

  return (
    <SofiaBubble
      steps={STEPS}
      step={step}
      textDone={textDone}
      exiting={exiting}
      onNext={next}
      onPrev={prev}
      onClose={close}
      onTextDone={() => setTextDone(true)}
      isLastLabel="Começar!"
    />
  );
};

export default SofiaWizard;

// ══════════════════════════════════════════════════════════════════
//  SofiaContextGuide — Mini-tour autônomo para dentro de módulos
//  Aparece uma vez por guideKey (salvo no localStorage)
//  Uso: <SofiaContextGuide guideKey="crm-kanban" userId={user.id} steps={[...]} />
// ══════════════════════════════════════════════════════════════════

interface SofiaContextGuideProps {
  /** Unique key for this guide — used as localStorage namespace */
  guideKey: string;
  steps: WizardStep[];
  /** Optionally scope per-user so each user sees it independently */
  userId?: number | string;
  /** Delay before the guide appears (ms). Default 700 */
  delay?: number;
}

function getContextStorageKey(guideKey: string, userId?: number | string) {
  return userId ? `sofia_ctx_${guideKey}_${userId}` : `sofia_ctx_${guideKey}`;
}

export function SofiaContextGuide({
  guideKey,
  steps,
  userId,
  delay = 700,
}: SofiaContextGuideProps) {
  const storageKey = getContextStorageKey(guideKey, userId);

  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [textDone, setTextDone] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(storageKey) === "done") return;
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [storageKey, delay]);

  const close = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
      localStorage.setItem(storageKey, "done");
    }, 400);
  }, [storageKey]);

  const next = useCallback(() => {
    if (step < steps.length - 1) {
      setTextDone(false);
      setStep((s) => s + 1);
    } else {
      close();
    }
  }, [step, steps.length, close]);

  const prev = useCallback(() => {
    if (step > 0) {
      setTextDone(false);
      setStep((s) => s - 1);
    }
  }, [step]);

  if (!visible || steps.length === 0) return null;

  return (
    <SofiaBubble
      steps={steps}
      step={step}
      textDone={textDone}
      exiting={exiting}
      onNext={next}
      onPrev={prev}
      onClose={close}
      onTextDone={() => setTextDone(true)}
      isLastLabel="Entendido!"
    />
  );
}
