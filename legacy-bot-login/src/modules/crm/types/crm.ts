export interface Lead {
  id: string;
  name: string;
  phone: string;
  origin: "whatsapp" | "manual";
  createdAt: string;
  funnel: string;
  stage: string;
  notes?: string;
}

export type FunnelType = "trabalhista" | "negativado" | "golpe-pix" | "golpe-cibernetico";

export const FUNNELS: { id: FunnelType; label: string; color: string }[] = [
  { id: "trabalhista",       label: "Trabalhista",        color: "hsl(43 72% 49%)"  },
  { id: "negativado",        label: "Cliente Negativado", color: "hsl(20 80% 55%)"  },
  { id: "golpe-pix",         label: "Golpe do Pix",       color: "hsl(0 65% 55%)"   },
  { id: "golpe-cibernetico", label: "Golpe Cibernético",  color: "hsl(200 70% 50%)" },
];

// Global stage list — used as fallback if backend stages aren't loaded yet
// The KanbanBoard loads per-funnel stages from the backend via useStages()
export const STAGES = [
  { id: "recebido",     label: "Recebido"              },
  { id: "abordagem",    label: "Abordagem"              },
  { id: "coleta_info",  label: "Coleta de Informações"  },
  { id: "documentacao", label: "Documentação"           },
  { id: "procuracao",   label: "Procuração"             },
  { id: "analise",      label: "Análise"                },
  { id: "assinatura",   label: "Assinatura"             },
  { id: "envio_espera", label: "Envio e Espera"         },
  { id: "finalizado",   label: "Finalizado"             },
];

