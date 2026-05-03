import { motion } from "framer-motion";
import { LayoutGrid, BarChart3, CheckSquare, FileText } from "lucide-react";

type Tab = "crm" | "phc" | "painel" | "tarefas";

interface BottomNavBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const tabs: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "crm",     label: "CRM",     icon: LayoutGrid },
  { id: "phc",     label: "PHC",     icon: FileText },
  { id: "painel",  label: "Painel",  icon: BarChart3 },
  { id: "tarefas", label: "Tarefas", icon: CheckSquare },
];

const BottomNavBar = ({ activeTab, onTabChange }: BottomNavBarProps) => {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", duration: 0.6, bounce: 0.2 }}
        className="flex items-center gap-1 p-1.5 rounded-2xl glass-card shadow-2xl shadow-black/40"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="relative px-5 py-2.5 rounded-xl transition-all duration-200"
            >
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-active"
                  className="absolute inset-0 gold-gradient rounded-xl"
                  transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
                />
              )}
              <span
                className={`relative z-10 flex items-center gap-2 text-sm font-medium ${
                  isActive
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </span>
            </button>
          );
        })}
      </motion.div>
    </div>
  );
};

export default BottomNavBar;
