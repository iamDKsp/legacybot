import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";

export interface SelectOption {
  value: string | number;
  label: string;
}

interface StyledSelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  /** If true, renders inline (not full-width) */
  inline?: boolean;
}

/**
 * Dropdown customizado que substitui o <select> nativo feio.
 * Usa glassmorphism + AnimatePresence + fechar ao clicar fora.
 */
export function StyledSelect({
  value,
  onChange,
  options,
  placeholder = "Selecionar...",
  className = "",
  inline = false,
}: StyledSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => String(o.value) === String(value));

  return (
    <div
      ref={ref}
      className={`relative ${inline ? "inline-block" : "w-full"} ${className}`}
    >
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={[
          "flex items-center justify-between gap-2 w-full",
          "rounded-lg border px-3 py-2.5 text-sm transition-all duration-200",
          open
            ? "border-accent/60 bg-card text-card-foreground ring-2 ring-accent/20"
            : "border-border bg-muted text-card-foreground hover:border-accent/40 hover:bg-muted/70",
          !selected && "text-muted-foreground",
        ].join(" ")}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-muted-foreground"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-border/60 bg-card/98 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden max-h-60 overflow-y-auto"
          >
            <div className="p-1.5 flex flex-col gap-0.5">
              {placeholder && (
                <button
                  type="button"
                  onClick={() => { onChange(""); setOpen(false); }}
                  className={[
                    "flex items-center justify-between gap-3 w-full px-3 py-2 rounded-lg text-sm transition-all duration-150 text-left",
                    !value || value === ""
                      ? "bg-accent/15 text-accent"
                      : "text-muted-foreground hover:bg-secondary/70",
                  ].join(" ")}
                >
                  <span>{placeholder}</span>
                  {(!value || value === "") && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              )}
              {options.map((opt) => {
                const isActive = String(opt.value) === String(value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onChange(String(opt.value)); setOpen(false); }}
                    className={[
                      "flex items-center justify-between gap-3 w-full px-3 py-2 rounded-lg text-sm transition-all duration-150 text-left",
                      isActive
                        ? "bg-accent/15 text-accent font-medium"
                        : "text-card-foreground hover:bg-secondary/70 hover:text-foreground",
                    ].join(" ")}
                  >
                    <span>{opt.label}</span>
                    {isActive && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
