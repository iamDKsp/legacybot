import { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronRight, ChevronLeft, Sparkles, Bot } from "lucide-react";
import sofiaImg from "@/assets/sofia-3d.png";

// ── Per-user localStorage key ──────────────────────────────────
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

// ── Step definitions ───────────────────────────────────────────
interface WizardStep {
  id: string;
  targetId?: string; // data-wizard-id of the element to spotlight
  title: string;
  text: string;
  bubblePosition?: "top" | "right" | "center"; // where the bubble sits
}

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
    text: "Aqui você gerencia todos os seus leads num quadro Kanban. Cada coluna é uma etapa do funil. Arraste, edite e acompanhe o progresso dos seus clientes!",
    bubblePosition: "top",
  },
  {
    id: "database",
    targetId: "module-database",
    title: "Banco de Dados 🗄️",
    text: "Aqui ficam todos os dados coletados: leads, documentos verificados e arquivos da base de conhecimento que uso para responder melhor!",
    bubblePosition: "top",
  },
  {
    id: "setup",
    targetId: "module-setup",
    title: "Configurações ⚙️",
    text: "Aqui você conecta o WhatsApp escaneando o QR Code, gerencia usuários do sistema e muito mais. É o primeiro passo para me deixar online!",
    bubblePosition: "top",
  },
  {
    id: "ai",
    targetId: "module-aiconfig",
    title: "Configurações da IA 🧠",
    text: "Acesse pelo menu superior de qualquer tela. Lá você ajusta minha personalidade, delays de digitação, horário de atendimento e outras configurações para eu parecer mais humana!",
    bubblePosition: "top",
  },
  {
    id: "finish",
    title: "Você está pronto! 🎉",
    text: "Agora é com você! Comece conectando o WhatsApp em Configurações. Se precisar de mim, estarei aqui respondendo seus clientes 24 horas por dia. Boa sorte!",
  },
];

// ── Typewriter text component ──────────────────────────────────
function TypewriterText({ text, onDone }: { text: string; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState("");
  const charRef = useRef(0);
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDisplayed("");
    charRef.current = 0;

    function tick() {
      charRef.current++;
      setDisplayed(text.substring(0, charRef.current));
      if (charRef.current < text.length) {
        ref.current = setTimeout(tick, 22 + Math.random() * 18);
      } else {
        onDone?.();
      }
    }
    ref.current = setTimeout(tick, 100);
    return () => { if (ref.current) clearTimeout(ref.current); };
  }, [text, onDone]);

  return (
    <span>
      {displayed}
      {displayed.length < text.length && (
        <span className="wizard-cursor" />
      )}
    </span>
  );
}

// ── Confetti component (step 6) ────────────────────────────────
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

// ── Spotlight highlight ─────────────────────────────────────────
function SpotlightTarget({ targetId }: { targetId?: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!targetId) { setRect(null); return; }
    const el = document.querySelector(`[data-wizard-id="${targetId}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect(r);
      el.classList.add("wizard-target-highlight");
    }
    return () => {
      if (targetId) {
        const el2 = document.querySelector(`[data-wizard-id="${targetId}"]`);
        el2?.classList.remove("wizard-target-highlight");
      }
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

// ── Main SofiaWizard Component ────────────────────────────────
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

  const close = useCallback((markDone = true) => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      setExiting(false);
      if (markDone) setWizardDone(userId);
    }, 400);
  }, [userId]);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setTextDone(false);
      setStep((s) => s + 1);
    } else {
      close(true);
    }
  }, [step, close]);

  const prev = useCallback(() => {
    if (step > 0) {
      setTextDone(false);
      setStep((s) => s - 1);
    }
  }, [step]);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <>
      {/* Overlay */}
      <div
        className={`wizard-overlay ${exiting ? "wizard-overlay-exit" : "wizard-overlay-enter"}`}
        onClick={() => close(true)}
        style={{ zIndex: 10000 }}
      />

      {/* Spotlight ring around the target element */}
      {!isFirst && !isLast && (
        <SpotlightTarget targetId={current.targetId} />
      )}

      {/* Confetti on last step */}
      {isLast && <Confetti />}

      {/* Sofia + bubble container (fixed bottom-left) */}
      <div
        className={`wizard-sofia-container ${exiting ? "wizard-sofia-exit" : "wizard-sofia-enter"}`}
        style={{ zIndex: 10002 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Speech bubble */}
        <div className="wizard-bubble-wrap">
          {/* Step dots */}
          <div className="wizard-dots">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`wizard-dot ${i === step ? "wizard-dot-active" : i < step ? "wizard-dot-done" : ""}`}
              />
            ))}
          </div>

          {/* Title */}
          <div className="wizard-bubble-title">
            <Sparkles className="h-3.5 w-3.5 text-accent flex-shrink-0" />
            <span>{current.title}</span>
          </div>

          {/* Text */}
          <p className="wizard-bubble-text">
            <TypewriterText
              key={`${step}-text`}
              text={current.text}
              onDone={() => setTextDone(true)}
            />
          </p>

          {/* Navigation */}
          <div className="wizard-bubble-actions">
            {/* Skip */}
            <button
              className="wizard-btn-skip"
              onClick={() => close(true)}
              title="Pular tour"
            >
              <X className="h-3.5 w-3.5" />
              Pular
            </button>

            <div className="flex items-center gap-2">
              {/* Back */}
              {!isFirst && (
                <button
                  className="wizard-btn-back"
                  onClick={prev}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}

              {/* Next / Finish */}
              <button
                className={`wizard-btn-next ${textDone ? "wizard-btn-next-ready" : ""}`}
                onClick={next}
              >
                {isLast ? (
                  <>
                    <Bot className="h-4 w-4" />
                    Começar!
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

          {/* Bubble tail */}
          <div className="wizard-bubble-tail" />
        </div>

        {/* Sofia image */}
        <div className="wizard-sofia-wrap">
          <div className="wizard-sofia-glow" />
          <img
            src={sofiaImg}
            alt="Sofia"
            className="wizard-sofia-img"
            draggable={false}
          />
        </div>
      </div>
    </>
  );
};

export default SofiaWizard;
