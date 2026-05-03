import { motion } from "framer-motion";
import { Briefcase, Scale, Monitor, Smartphone } from "lucide-react";

const FUNNELS = [
  { slug: "trabalhista", label: "Trabalhista", icon: Briefcase },
  { slug: "civel", label: "Cível / Consumidor", icon: Scale },
  { slug: "ciberneticos", label: "Golpes Cibernéticos", icon: Monitor },
  { slug: "pix", label: "Golpe do Pix", icon: Smartphone },
];

interface FunnelSelectorProps {
  activeFunnel: string;
  onSelect: (slug: string) => void;
}

export function FunnelSelector({ activeFunnel, onSelect }: FunnelSelectorProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {FUNNELS.map((funnel) => {
        const isActive = activeFunnel === funnel.slug;
        const Icon = funnel.icon;
        return (
          <button
            key={funnel.slug}
            onClick={() => onSelect(funnel.slug)}
            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
              isActive
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-muted-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {funnel.label}
            {isActive && (
              <motion.div
                layoutId="funnel-active-dot"
                className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary"
                transition={{ type: "spring", bounce: 0.3 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
