import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, LogOut, Bot, Database, Settings, Cpu } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import KanbanBoard from "../modules/crm/components/crm/KanbanBoard";
import BottomNavBar from "../modules/crm/components/BottomNavBar";
import DashboardView from "../modules/crm/components/dashboard/DashboardView";
import TasksView from "../modules/crm/components/tasks/TasksView";
import PHCView from "../modules/crm/components/phc/PHCView";

type Tab = "crm" | "phc" | "painel" | "tarefas";

const NAV_ICONS = [
  { icon: Database, label: "Banco de Dados", path: "/database" },
  { icon: Settings, label: "Configurações", path: "/setup" },
  { icon: Cpu, label: "Processos IA", path: "/ai-config" },
] as const;

import SofiaTaskNotifier from "@/components/SofiaTaskNotifier";
import SofiaMessageNotifier from "@/components/SofiaMessageNotifier";

const CRM = () => {
  const [activeTab, setActiveTab] = useState<Tab>("crm");
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Module Header — Premium Glassmorphism */}
      <header className="relative z-50">
        <div className="flex items-center justify-between px-6 py-3 bg-card/60 backdrop-blur-xl border-b border-border/30">
          {/* Left: Back + Branding */}
          <div className="flex items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate("/")}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/50 text-muted-foreground transition-colors duration-200 hover:bg-accent/15 hover:text-accent"
              title="Voltar aos Módulos"
            >
              <ArrowLeft className="h-5 w-5" />
            </motion.button>

            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg gold-gradient shadow-lg shadow-[hsl(43_72%_49%/0.2)]">
                <Bot className="h-4.5 w-4.5 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold text-card-foreground hidden sm:block tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                Legacy Bot
              </span>
              <span className="hidden sm:flex items-center gap-1.5 ml-1">
                <div className="w-1 h-1 rounded-full bg-accent/50" />
                <span className="text-[11px] font-semibold text-accent uppercase tracking-[0.2em]">CRM</span>
              </span>
            </div>
          </div>

          {/* Right: Module Nav Icons + Sair */}
          <div className="flex items-center gap-1.5">
            {NAV_ICONS.map(({ icon: Icon, label, path }) => (
              <motion.button
                key={path}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => navigate(path)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-all duration-200 hover:bg-accent/10 hover:text-accent relative group"
                title={label}
              >
                <Icon className="h-4.5 w-4.5" />
                {/* Tooltip */}
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[10px] font-medium text-accent bg-card/90 backdrop-blur-sm rounded-md border border-border/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none shadow-lg">
                  {label}
                </span>
              </motion.button>
            ))}

            <div className="w-px h-6 bg-border/40 mx-1.5 hidden sm:block" />

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={logout}
              className="flex h-9 px-3.5 items-center justify-center gap-2 rounded-xl text-muted-foreground transition-all duration-200 hover:bg-red-500/10 hover:text-red-400 group"
              title="Sair do Sistema"
            >
              <span className="text-xs font-semibold hidden sm:block">Sair</span>
              <LogOut className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </motion.button>
          </div>
        </div>
        {/* Neon Gold Accent Bar */}
        <div className="neon-bar-wrapper">
          <div className="neon-bar" />
        </div>
      </header>

      <div className="flex-1 overflow-hidden pb-20">
        <AnimatePresence mode="wait">
          {activeTab === "crm" && (
            <motion.div
              key="crm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <KanbanBoard />
            </motion.div>
          )}
          {activeTab === "phc" && (
            <motion.div
              key="phc"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <PHCView />
            </motion.div>
          )}
          {activeTab === "painel" && (
            <motion.div
              key="painel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <DashboardView />
            </motion.div>
          )}
          {activeTab === "tarefas" && (
            <motion.div
              key="tarefas"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <TasksView />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <BottomNavBar activeTab={activeTab} onTabChange={setActiveTab} />
      <SofiaTaskNotifier />
      <SofiaMessageNotifier />
    </div>
  );
};

export default CRM;
