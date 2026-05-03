import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, User, Loader2, AlertCircle, Hash, Phone } from "lucide-react";
import { phcApi, Lawyer } from "@/services/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import LawyerForm from "./LawyerForm";

export function LawyerList() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Lawyer | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const { data: lawyers = [], isLoading, error } = useQuery({
    queryKey: ["phc-lawyers"],
    queryFn: () => phcApi.getLawyers().then((r) => r.data.data),
  });

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja remover este advogado?")) return;
    setDeletingId(id);
    setDeleteError("");
    try {
      await phcApi.deleteLawyer(id);
      qc.invalidateQueries({ queryKey: ["phc-lawyers"] });
    } catch (err: any) {
      setDeleteError(err?.response?.data?.error ?? "Erro ao remover advogado.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 pb-24 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-card-foreground">Advogados Cadastrados</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lawyers.length} advogado{lawyers.length !== 1 ? "s" : ""} no sistema
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => { setEditing(undefined); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg gold-gradient text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Novo Advogado
        </motion.button>
      </div>

      {deleteError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {deleteError}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-accent" />
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="flex flex-1 items-center justify-center flex-col gap-2 text-sm text-red-400">
          <AlertCircle className="h-8 w-8" />
          <p>Erro ao carregar advogados.</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && lawyers.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border/40 bg-muted">
            <User className="h-7 w-7 opacity-40" />
          </div>
          <div className="text-center">
            <p className="font-medium text-sm">Nenhum advogado cadastrado</p>
            <p className="text-xs mt-1 opacity-60">Cadastre um advogado para criar PHCs</p>
          </div>
          <button
            onClick={() => { setEditing(undefined); setShowForm(true); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-accent border border-accent/30 hover:bg-accent/10 transition-colors"
          >
            <Plus className="h-4 w-4" /> Cadastrar primeiro advogado
          </button>
        </div>
      )}

      {/* List */}
      {!isLoading && !error && lawyers.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lawyers.map((lawyer, i) => (
            <motion.div
              key={lawyer.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="group rounded-xl border border-border/40 bg-card p-4 hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 transition-all duration-200"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg gold-gradient shadow">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-card-foreground leading-tight line-clamp-1">
                      {lawyer.name}
                    </h3>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Hash className="h-3 w-3 text-accent opacity-70" />
                      <span className="text-xs text-accent font-medium">{lawyer.oab}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setEditing(lawyer); setShowForm(true); }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(lawyer.id)}
                    disabled={deletingId === lawyer.id}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    title="Remover"
                  >
                    {deletingId === lawyer.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />
                    }
                  </button>
                </div>
              </div>

              {/* Card Details */}
              <div className="space-y-1.5">
                {lawyer.phone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span className="truncate">{lawyer.phone}</span>
                  </div>
                )}
                {(lawyer.city || lawyer.state) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">
                      {[lawyer.city, lawyer.state].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                )}
                {lawyer.cpf && (
                  <div className="text-xs text-muted-foreground/60 font-mono">{lawyer.cpf}</div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <LawyerForm
          lawyer={editing}
          onClose={() => { setShowForm(false); setEditing(undefined); }}
        />
      )}
    </div>
  );
}

export default LawyerList;
