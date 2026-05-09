import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Clock, Server, FileJson, X, RefreshCw } from "lucide-react";

export function AILogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("legacy_token") || localStorage.getItem("token");
      const res = await fetch("/api/ai-config/logs", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setLogs(data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch AI logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(d);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Server className="w-6 h-6 text-primary" />
            Logs do Sistema (Sofia)
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Histórico de falhas de IA e erros técnicos capturados nos bastidores.
          </p>
        </div>
        <button 
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface/80 rounded-lg text-sm transition-colors border border-border"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <RefreshCw className="w-8 h-8 animate-spin text-primary opacity-50" />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Server className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>Nenhum erro registrado recentemente.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface/50 border-b border-border">
                  <th className="p-4 font-medium text-muted-foreground text-sm">Data/Hora</th>
                  <th className="p-4 font-medium text-muted-foreground text-sm">Lead</th>
                  <th className="p-4 font-medium text-muted-foreground text-sm">Erro</th>
                  <th className="p-4 font-medium text-muted-foreground text-sm text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border hover:bg-surface/30 transition-colors">
                    <td className="p-4 text-sm whitespace-nowrap">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(log.created_at)}
                      </div>
                    </td>
                    <td className="p-4">
                      {log.lead_name ? (
                        <div>
                          <p className="font-medium text-sm">{log.lead_name}</p>
                          <p className="text-xs text-muted-foreground">{log.lead_phone}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic text-sm">Sistema</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-red-400 line-clamp-1 max-w-md">
                          {log.error_message}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-2 bg-surface hover:bg-primary/20 text-foreground hover:text-primary rounded-lg transition-colors inline-flex"
                        title="Ver detalhes"
                      >
                        <FileJson className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Detalhes */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-5 border-b border-border flex items-center justify-between bg-surface/50">
              <h3 className="font-bold flex items-center gap-2 text-red-400">
                <AlertTriangle className="w-5 h-5" />
                Detalhes do Erro #{selectedLog.id}
              </h3>
              <button 
                onClick={() => setSelectedLog(null)}
                className="p-2 hover:bg-surface rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Mensagem de Erro</h4>
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 font-medium font-mono text-sm break-words">
                  {selectedLog.error_message}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Data da Ocorrência</h4>
                  <p className="text-sm">{formatDate(selectedLog.created_at)}</p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Lead Afetado</h4>
                  <p className="text-sm">{selectedLog.lead_name ? `${selectedLog.lead_name} (${selectedLog.lead_phone})` : 'N/A'}</p>
                </div>
              </div>

              {selectedLog.payload && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payload (Contexto)</h4>
                  <pre className="p-4 bg-surface rounded-lg text-xs font-mono overflow-x-auto border border-border text-primary/80">
                    {JSON.stringify(typeof selectedLog.payload === 'string' ? JSON.parse(selectedLog.payload) : selectedLog.payload, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.stack_trace && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Stack Trace</h4>
                  <pre className="p-4 bg-surface rounded-lg text-xs font-mono overflow-x-auto border border-border text-muted-foreground">
                    {selectedLog.stack_trace}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
