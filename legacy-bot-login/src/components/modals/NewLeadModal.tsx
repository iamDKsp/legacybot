import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Funnel } from "@/services/api";
import { useCreateLead } from "@/hooks/useLeads";
import { StyledSelect } from "@/components/ui/StyledSelect";

interface NewLeadModalProps {
    funnels: Funnel[];
    currentFunnelId: number | null;
    onClose: () => void;
}

export default function NewLeadModal({ funnels, currentFunnelId, onClose }: NewLeadModalProps) {
    const [form, setForm] = useState({
        name: "",
        phone: "",
        email: "",
        cpf: "",
        funnel_id: currentFunnelId ?? funnels[0]?.id ?? 1,
        origin: "manual" as const,
        description: "",
    });

    const { mutateAsync: createLead, isPending } = useCreateLead();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createLead({
                name: form.name,
                phone: form.phone,
                email: form.email || undefined,
                cpf: form.cpf || undefined,
                funnel_id: Number(form.funnel_id),
                origin: form.origin,
                description: form.description || undefined,
            });
            onClose();
        } catch {
            // Error is handled by the hook's onError toast
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border p-5">
                    <h2 className="text-lg font-semibold text-card-foreground">Novo Lead</h2>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Nome *
                        </label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="Nome completo"
                            className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            required
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Telefone (WhatsApp) *
                        </label>
                        <input
                            type="tel"
                            value={form.phone}
                            onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                            placeholder="(11) 99999-9999"
                            className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                E-mail
                            </label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                                placeholder="email@exemplo.com"
                                className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                CPF
                            </label>
                            <input
                                type="text"
                                value={form.cpf}
                                onChange={(e) => setForm(f => ({ ...f, cpf: e.target.value }))}
                                placeholder="000.000.000-00"
                                className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Funil
                        </label>
                        <StyledSelect
                            value={form.funnel_id}
                            onChange={(v) => setForm(f => ({ ...f, funnel_id: Number(v) }))}
                            options={funnels.map((f) => ({ value: f.id, label: f.name }))}
                            placeholder="Selecionar funil..."
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Descrição / Observações
                        </label>
                        <textarea
                            value={form.description}
                            onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Descreva brevemente o caso..."
                            rows={3}
                            className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isPending}
                            className="flex-1 rounded-lg border border-border bg-secondary py-2.5 text-sm font-medium text-card-foreground hover:bg-secondary/70 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isPending}
                            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                            {isPending ? "Criando..." : "Criar Lead"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
