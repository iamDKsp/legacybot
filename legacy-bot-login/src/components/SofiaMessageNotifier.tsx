/**
 * SofiaMessageNotifier
 * ────────────────────
 * Listens to the `legacy_new_message` custom DOM event (dispatched by
 * useNotifications whenever Socket.IO receives a `new_message` from the backend).
 *
 * When a new WhatsApp message arrives it:
 *  1. Queues the notification (debounced — multiple rapid messages collapse into one)
 *  2. Shows Sofia with an animated speech bubble: "Opa, parece que tem mensagem nova!"
 *  3. Plays a subtle chime sound via Web Audio API (no external audio file needed)
 *  4. Shows an "Abrir" button that navigates to /client-hub with the lead pre-loaded
 *     and the "conversas" tab open
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, X, ExternalLink } from "lucide-react";
import sofiaImg from "@/assets/sofia-3d.png";
import { leadsApi } from "@/services/api";

// ── Notification payload from the `legacy_new_message` DOM event ──
interface NewMessageDetail {
    leadId: number;
    leadName: string;
    message: string;
    conversationId?: number;
}

// ── Soft chime via Web Audio API ──────────────────────────────────
function playChime() {
    try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

        // Primary note — warm tone
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(880, ctx.currentTime);        // A5
        osc1.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.3); // slides to E5
        gain1.gain.setValueAtTime(0.18, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.8);

        // Harmonic — adds depth
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1320, ctx.currentTime);       // E6
        gain2.gain.setValueAtTime(0.07, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.5);

        // Second "pop" — slightly delayed, higher
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.type = "sine";
        osc3.frequency.setValueAtTime(1100, ctx.currentTime + 0.18);
        gain3.gain.setValueAtTime(0.0, ctx.currentTime);
        gain3.gain.setValueAtTime(0.12, ctx.currentTime + 0.18);
        gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.start(ctx.currentTime + 0.18);
        osc3.stop(ctx.currentTime + 0.9);

        // Auto-close the audio context to free resources
        setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 1200);
    } catch {
        // Silently fail — user may have blocked audio
    }
}

// ─────────────────────────────────────────────────────────────────
export default function SofiaMessageNotifier() {
    const navigate = useNavigate();

    // Current notification shown
    const [notification, setNotification] = useState<NewMessageDetail | null>(null);
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);
    const [loading, setLoading] = useState(false);

    // Debounce: multiple rapid messages from the same lead collapse
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingRef = useRef<NewMessageDetail | null>(null);

    // Auto-dismiss after 12 seconds
    const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const dismiss = useCallback(() => {
        setExiting(true);
        setTimeout(() => {
            setVisible(false);
            setExiting(false);
            setNotification(null);
        }, 400);
        if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    }, []);

    const show = useCallback((detail: NewMessageDetail) => {
        // Clear previous auto-dismiss if any
        if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
        // If already visible, just update content without exit animation
        setNotification(detail);
        setExiting(false);
        setVisible(true);
        playChime();
        autoDismissRef.current = setTimeout(dismiss, 12_000);
    }, [dismiss]);

    const handleEvent = useCallback((e: Event) => {
        const detail = (e as CustomEvent<NewMessageDetail>).detail;
        if (!detail?.leadId) return;

        // Debounce: accumulate messages for the same lead, show after 1.2s of silence
        pendingRef.current = detail;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            if (pendingRef.current) show(pendingRef.current);
        }, 1200);
    }, [show]);

    useEffect(() => {
        window.addEventListener("legacy_new_message", handleEvent);
        return () => {
            window.removeEventListener("legacy_new_message", handleEvent);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
        };
    }, [handleEvent]);

    // ── "Abrir" — fetch lead and navigate to ClientHub → conversas ──
    const handleOpen = useCallback(async () => {
        if (!notification) return;
        setLoading(true);
        try {
            const res = await leadsApi.getById(notification.leadId);
            const lead = res.data.data;
            dismiss();
            // Navigate to client hub; CardDetailView defaults to "conversas" tab
            navigate("/client-hub", { state: { lead } });
        } catch {
            // Fallback: navigate anyway without full lead data
            dismiss();
            navigate("/client-hub", {
                state: {
                    lead: {
                        id: notification.leadId,
                        name: notification.leadName,
                    },
                },
            });
        } finally {
            setLoading(false);
        }
    }, [notification, navigate, dismiss]);

    if (!visible || !notification) return null;

    return (
        <div
            className={`wizard-sofia-container ${exiting ? "wizard-sofia-exit" : "wizard-sofia-enter"}`}
            style={{ zIndex: 9999, position: "fixed", bottom: "88px", left: "20px" }}
        >
            {/* Speech bubble */}
            <div className="wizard-bubble-wrap shadow-xl border"
                style={{
                    boxShadow: "0 8px 40px -6px hsl(43 72% 49% / 0.25), 0 0 0 1px hsl(43 72% 49% / 0.18)",
                    borderColor: "hsl(43 72% 49% / 0.22)",
                    background: "linear-gradient(135deg, hsl(30 8% 14% / 0.98), hsl(30 6% 12% / 0.98))",
                }}
            >
                {/* Close button */}
                <button
                    onClick={dismiss}
                    className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-card border border-border/60 text-muted-foreground/60 hover:text-foreground transition-colors shadow-sm"
                    title="Fechar"
                >
                    <X className="h-3 w-3" />
                </button>

                {/* Title */}
                <div className="wizard-bubble-title text-accent">
                    <MessageCircle className="h-4 w-4 animate-pulse" />
                    <span>Nova Mensagem!</span>
                </div>

                {/* Speech */}
                <p className="wizard-bubble-text text-sm mt-2 text-primary-foreground/90 leading-relaxed">
                    Opa, parece que tem mensagem nova! 😊
                </p>

                {/* Lead pill */}
                <div className="mt-2 flex items-center gap-1.5 bg-accent/10 border border-accent/20 rounded-lg px-2.5 py-1.5">
                    <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                        <MessageCircle className="w-3 h-3 text-accent" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-accent truncate">
                            {notification.leadName}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                            {notification.message.length > 48
                                ? notification.message.slice(0, 45) + "…"
                                : notification.message}
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="wizard-bubble-actions mt-3 flex justify-between items-center w-full gap-2">
                    <button
                        className="text-xs text-primary-foreground/40 hover:text-primary-foreground/70 transition-colors py-1 px-1"
                        onClick={dismiss}
                    >
                        Agora não
                    </button>
                    <button
                        className="flex items-center gap-1.5 bg-accent text-accent-foreground px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-accent/90 active:scale-95 transition-all disabled:opacity-60"
                        onClick={handleOpen}
                        disabled={loading}
                    >
                        <ExternalLink className="h-3 w-3" />
                        Abrir
                    </button>
                </div>

                <div className="wizard-bubble-tail" />
            </div>

            {/* Sofia figure */}
            <div className="wizard-sofia-wrap mt-2 ml-4 relative">
                <div className="wizard-sofia-glow bg-accent/20 rounded-full blur-xl absolute inset-0" />
                <img
                    src={sofiaImg}
                    alt="Sofia"
                    className="wizard-sofia-img relative h-28 w-auto object-contain drop-shadow-2xl"
                    draggable={false}
                />
            </div>
        </div>
    );
}
