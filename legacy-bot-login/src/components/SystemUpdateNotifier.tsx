import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, X } from 'lucide-react';
import sofiaImg from '@/assets/sofia-3d.png';
import { AnimatePresence, motion } from 'framer-motion';

// Extract the BASE_URL in a similar way as api.ts
const BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3001/api';
// Determine the health endpoint.
// In the backend, API routes are prefixed with /api, but /health is at the root.
const HEALTH_URL = BASE_URL.replace(/\/api\/?$/, '') + '/health';

export const SystemUpdateNotifier = () => {
    const [initialStartTime, setInitialStartTime] = useState<number | null>(null);
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const checkHealth = async () => {
            try {
                // Previne cache do navegador para garantir que recebemos o startTime real
                const urlWithCacheBuster = `${HEALTH_URL}?t=${Date.now()}`;
                const res = await fetch(urlWithCacheBuster, { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                
                if (!data.startTime) return;

                if (initialStartTime === null) {
                    if (isMounted) setInitialStartTime(data.startTime);
                } else if (data.startTime !== initialStartTime) {
                    if (isMounted) setUpdateAvailable(true);
                }
            } catch (error) {
                // Silently ignore fetch errors (e.g. backend temporarily down)
            }
        };

        // Check immediately
        checkHealth();

        // Then check every 30 seconds
        const interval = setInterval(checkHealth, 30000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [initialStartTime]);

    const handleReload = () => {
        window.location.reload();
    };

    if (!updateAvailable || dismissed) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 50, x: 50 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="fixed bottom-6 right-6 z-[9999] flex items-end gap-3 max-w-sm pointer-events-none"
            >
                <div className="relative pointer-events-auto">
                    <img 
                        src={sofiaImg} 
                        alt="Sofia" 
                        className="w-20 h-20 object-cover rounded-full border-4 border-indigo-500/30 shadow-xl bg-gradient-to-tr from-indigo-600 to-purple-600 mb-[-10px] z-10 relative"
                    />
                </div>
                
                <div className="bg-white/90 backdrop-blur-md border border-indigo-100 p-4 rounded-2xl shadow-2xl pointer-events-auto relative dark:bg-slate-900/90 dark:border-slate-800">
                    <button 
                        onClick={() => setDismissed(true)}
                        className="absolute -top-2 -right-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full p-1 transition-colors dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400"
                        aria-label="Fechar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    
                    <h4 className="font-semibold text-indigo-900 dark:text-indigo-300 mb-1 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        Sistema Atualizado
                    </h4>
                    
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
                        Olá! O sistema foi atualizado no servidor. Para não usar uma versão antiga e evitar erros, por favor, recarregue a página. Você pode clicar no botão abaixo ou apertar <kbd className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 text-xs">F5</kbd>.
                    </p>
                    
                    <Button 
                        onClick={handleReload}
                        className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-md group"
                    >
                        <RefreshCw className="w-4 h-4 mr-2 group-hover:rotate-180 transition-transform duration-500" />
                        Recarregar Agora
                    </Button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
