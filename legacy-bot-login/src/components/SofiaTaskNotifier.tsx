import { useState, useEffect, useCallback } from "react";
import { X, Sparkles, ClipboardList } from "lucide-react";
import sofiaImg from "@/assets/sofia-3d.png";
import { useTasks } from "@/hooks/useTasks";
import { Task } from "@/services/api";
import { useLocation, useNavigate } from "react-router-dom";

// Key to store which task IDs we've already notified the user about
const getNotifiedTasksKey = () => "legacy_notified_tasks";

export default function SofiaTaskNotifier() {
    const { data: tasks, isLoading } = useTasks();
    const [pendingTask, setPendingTask] = useState<Task | null>(null);
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        if (isLoading || !tasks) return;

        // Find a pending manual task (specifically 'Análise do caso', but any pending could work)
        const pending = tasks.find((t: Task) => t.status === "pendente" && t.title.includes("Análise do caso"));

        if (pending) {
            const notifiedStorage = localStorage.getItem(getNotifiedTasksKey());
            const notifiedIds: number[] = notifiedStorage ? JSON.parse(notifiedStorage) : [];

            // If we haven't notified about this specific task ID yet
            if (!notifiedIds.includes(pending.id)) {
                setPendingTask(pending);
                const t = setTimeout(() => setVisible(true), 1500); // Small delay on load
                return () => clearTimeout(t);
            }
        }
    }, [tasks, isLoading]);

    const closeHandler = useCallback(() => {
        if (!pendingTask) return;

        // Mark as notified
        const notifiedStorage = localStorage.getItem(getNotifiedTasksKey());
        const notifiedIds: number[] = notifiedStorage ? JSON.parse(notifiedStorage) : [];
        if (!notifiedIds.includes(pendingTask.id)) {
            notifiedIds.push(pendingTask.id);
            localStorage.setItem(getNotifiedTasksKey(), JSON.stringify(notifiedIds));
        }

        setExiting(true);
        setTimeout(() => {
            setVisible(false);
            setExiting(false);
            setPendingTask(null);
        }, 400);
    }, [pendingTask]);

    if (!visible || !pendingTask) return null;

    return (
        <div
            className={`wizard-sofia-container ${exiting ? "wizard-sofia-exit" : "wizard-sofia-enter"}`}
            style={{ zIndex: 9999, position: "fixed", bottom: "80px", left: "20px" }}
        >
            <div className="wizard-bubble-wrap shadow-xl shadow-accent/20 border border-accent/20">
                <div className="wizard-bubble-title text-accent">
                    <Sparkles className="h-4 w-4" />
                    <span>Nova Tarefa de Triagem!</span>
                </div>

                <p className="wizard-bubble-text text-sm mt-2 text-primary-foreground/90">
                    Opa! Acabei de concluir a triagem de <strong>{pendingTask.lead_name || 'um cliente'}</strong>. 
                    <br/><br/>
                    Deixei uma tarefa de <strong>{pendingTask.title}</strong> pendente para você! 😉
                </p>

                <div className="wizard-bubble-actions mt-4 flex justify-between items-center w-full">
                    <button
                        className="text-xs text-primary-foreground/50 hover:text-primary-foreground transition-colors py-1 px-2"
                        onClick={closeHandler}
                    >
                        Deixar para depois
                    </button>
                    <button
                        className="bg-accent text-accent-foreground px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 hover:bg-accent/90 transition-colors"
                        onClick={() => {
                            closeHandler();
                            // If they are on mobile, they might need to open the tasks drawer
                            // We can trigger a custom event or let the user click the tasks icon physically
                            document.querySelector<HTMLElement>('[data-tab="tasks"]')?.click();
                            document.querySelector<HTMLElement>('button[aria-controls="radix-:r0:-content-tasks"]')?.click();
                        }}
                    >
                        <ClipboardList className="h-3.5 w-3.5" />
                        Ver Tarefas
                    </button>
                </div>

                <div className="wizard-bubble-tail" />
            </div>

            <div className="wizard-sofia-wrap mt-2 ml-4">
                <div className="wizard-sofia-glow bg-accent/20 rounded-full blur-xl absolute inset-0" />
                <img
                    src={sofiaImg}
                    alt="Sofia"
                    className="wizard-sofia-img relative h-32 w-auto object-contain drop-shadow-2xl"
                    draggable={false}
                />
            </div>
        </div>
    );
}
