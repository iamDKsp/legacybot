import { Lead } from "@/services/api";
import LeadCard from "./LeadCard";
import { motion } from "framer-motion";

interface KanbanColumnProps {
  stageId: string;
  stageLabel: string;
  leads: (Lead & Record<string, unknown>)[];
  index: number;
}

const KanbanColumn = ({ stageLabel, leads, index }: KanbanColumnProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className="kanban-column rounded-xl min-w-[280px] w-[280px] flex-shrink-0 flex flex-col max-h-full"
    >
      <div className="p-3 border-b border-border/30">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {stageLabel}
          </h3>
          <span className="text-[10px] font-medium bg-secondary text-secondary-foreground rounded-full px-2 py-0.5">
            {leads.length}
          </span>
        </div>
      </div>
      <div className="p-2 flex flex-col gap-2 overflow-y-auto kanban-scroll-y flex-1">
        {leads.map((lead, i) => (
          <LeadCard key={lead.id} lead={lead} index={i} />
        ))}
        {leads.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-xs">
            Nenhum lead
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default KanbanColumn;
