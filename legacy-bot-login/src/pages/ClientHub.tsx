import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Loader2, User } from "lucide-react";
import CardDetailView from "../modules/modal/components/card-detail/CardDetailView";
import { useLead } from "@/hooks/useLeads";

const ClientHub = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const leadId = Number(id);

    const { data: lead, isLoading, isError } = useLead(leadId);

    // Redireciona para o CRM se o ID for inválido
    useEffect(() => {
        if (!id || isNaN(leadId)) {
            navigate("/crm", { replace: true });
        }
    }, [id, leadId, navigate]);

    if (isLoading) {
        return (
            <div className="h-screen flex flex-col items-center justify-center gap-4 text-muted-foreground bg-background">
                <Loader2 className="h-10 w-10 animate-spin text-accent" />
                <p className="text-sm">Carregando dados do cliente...</p>
            </div>
        );
    }

    if (isError || !lead) {
        return (
            <div className="h-screen flex flex-col items-center justify-center gap-4 text-muted-foreground bg-background">
                <User className="h-12 w-12 opacity-30" />
                <p className="text-sm">Lead não encontrado ou erro ao carregar.</p>
                <button
                    onClick={() => navigate("/crm")}
                    className="text-accent text-sm hover:underline"
                >
                    ← Voltar ao CRM
                </button>
            </div>
        );
    }

    return <CardDetailView initialLead={lead as any} />;
};

export default ClientHub;
