import { motion } from "framer-motion";
import { Funnel, Lead } from "@/services/api";

export interface FunnelTabsProps {
  funnels: Funnel[];
  activeFunnelId: number | null;
  onSelect: (id: number) => void;
  leads: Lead[];
}

export function FunnelTabs({ funnels, activeFunnelId, onSelect, leads }: FunnelTabsProps) {
  return (
    <div className="flex items-center gap-2">
      {funnels.map((funnel) => {
        const count = funnel.lead_count ?? leads.filter((l) => l.funnel_id === funnel.id).length;
        const isActive = activeFunnelId === funnel.id;
        return (
          <button
            key={funnel.id}
            onClick={() => onSelect(funnel.id)}
            className="relative px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
          >
            {isActive && (
              <motion.div
                layoutId="funnel-tab"
                className="absolute inset-0 gold-gradient rounded-lg"
                transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
              />
            )}
            <span
              className={`relative z-10 flex items-center gap-2 ${isActive
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
                }`}
            >
              {funnel.name}
              <span
                className={`text-[10px] rounded-full px-1.5 py-0.5 ${isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                  }`}
              >
                {count}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default FunnelTabs;
