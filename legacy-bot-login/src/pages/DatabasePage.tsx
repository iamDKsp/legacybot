import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Database, FileText, Brain, Users, ShieldCheck, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FunnelSelector } from "@/components/database/FunnelSelector";
import { DocumentUpload } from "@/components/database/DocumentUpload";
import { PromptEditor } from "@/components/database/PromptEditor";
import { CollectedData } from "@/components/database/CollectedData";
import { VerifiedDocuments } from "@/components/database/VerifiedDocuments";

type Tab = "documents" | "prompts" | "collected" | "verified";

const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "documents", label: "Base de Conhecimento", icon: FileText },
  { id: "prompts", label: "Prompts da I.A", icon: Brain },
  { id: "collected", label: "Dados Coletados", icon: Users },
  { id: "verified", label: "Docs Verificados", icon: ShieldCheck },
];

export default function DatabasePage() {
  const [activeTab, setActiveTab] = useState<Tab>("prompts");
  const [activeFunnel, setActiveFunnel] = useState("trabalhista");
  const navigate = useNavigate();

  const showFunnelSelector = activeTab === "documents" || activeTab === "prompts";

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="flex-none border-b border-border bg-sidebar">
        <div className="max-w-7xl w-full mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/crm")}
              className="p-2 rounded-lg hover:bg-surface transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <div className="flex items-center gap-3">
              <Database className="w-6 h-6 text-primary" />
              <div>
                <h1 className="text-lg font-bold text-foreground">
                  Legacy Bot <span className="text-primary">• Banco de Dados</span>
                </h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="flex-none border-b border-border bg-sidebar/50">
        <div className="max-w-7xl w-full mx-auto px-6">
          <div className="flex gap-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                  {isActive && (
                    <motion.div
                      layoutId="db-tab-underline"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 flex flex-col min-h-0 max-w-7xl w-full mx-auto px-6 py-6 pb-2">
        {/* Funnel Selector */}
        {showFunnelSelector && (
          <div className="flex-none mb-6">
            <FunnelSelector activeFunnel={activeFunnel} onSelect={setActiveFunnel} />
          </div>
        )}

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab + (showFunnelSelector ? activeFunnel : "")}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-2 scrollbar-thin"
          >
            {activeTab === "documents" && <DocumentUpload activeFunnel={activeFunnel} />}
            {activeTab === "prompts" && <PromptEditor activeFunnel={activeFunnel} />}
            {activeTab === "collected" && <CollectedData />}
            {activeTab === "verified" && <VerifiedDocuments />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
