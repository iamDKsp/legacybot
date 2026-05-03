import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Plus, List, User } from "lucide-react";
import PhcList from "./PhcList";
import NewPhcForm from "./NewPhcForm";
import LawyerList from "./LawyerList";

type SubTab = "lista" | "nova" | "advogados";

const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
  { id: "lista",      label: "Lista PHC",  icon: <List className="h-4 w-4" /> },
  { id: "nova",       label: "Nova PHC",   icon: <Plus className="h-4 w-4" /> },
  { id: "advogados",  label: "Advogados",  icon: <User className="h-4 w-4" /> },
];

export function PHCView() {
  const [sub, setSub] = useState<SubTab>("lista");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border/30 shrink-0">
        {/* Module badge */}
        <div className="flex items-center gap-2 mr-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg gold-gradient shadow">
            <FileText className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="text-xs font-bold text-accent uppercase tracking-widest">PHC</span>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary/40 border border-border/30">
          {SUB_TABS.map((tab) => {
            const isActive = sub === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSub(tab.id)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="phc-subtab-active"
                    className="absolute inset-0 gold-gradient rounded-lg"
                    transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  {tab.icon}
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {sub === "lista" && (
            <motion.div
              key="lista"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="h-full overflow-y-auto"
            >
              <PhcList />
            </motion.div>
          )}

          {sub === "nova" && (
            <motion.div
              key="nova"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="h-full overflow-y-auto"
            >
              <NewPhcForm onSuccess={() => setSub("lista")} />
            </motion.div>
          )}


          {sub === "advogados" && (
            <motion.div
              key="advogados"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="h-full overflow-y-auto"
            >
              <LawyerList />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default PHCView;
