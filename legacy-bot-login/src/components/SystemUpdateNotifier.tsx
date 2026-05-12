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
                className="fixed bottom-6 right-6 z-[9999] flex items-end gap-3 w-[560px] max-w-[calc(100vw-48px)] pointer-events-none"
            >
                <div className="relative pointer-events-auto shrink-0">
                    <img 
                        src={sofiaImg} 
                        alt="Sofia" 
                        className="w-28 h-28 object-contain mb-[-14px] z-10 relative drop-shadow-2xl"
                    />
                </div>
                
                <div className="bg-card/95 backdrop-blur-md border border-border p-5 rounded-2xl shadow-2xl pointer-events-auto relative w-full flex flex-col gap-3">
                    <button 
                        onClick={() => setDismissed(true)}
                        className="absolute -top-3 -right-3 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-full p-1.5 transition-colors shadow-sm border border-border"
                        aria-label="Fechar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    
                    <h4 className="font-semibold text-foreground flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        Sistema Atualizado
                    </h4>
                    
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Olá! O sistema foi atualizado no servidor. Para não usar uma versão antiga e evitar erros, por favor, recarregue a página. Você pode clicar no botão abaixo ou apertar <kbd className="bg-muted border border-border rounded px-1.5 py-0.5 text-xs text-foreground font-mono">F5</kbd>.
                    </p>
                    
                    <Button 
                        onClick={handleReload}
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-md group mt-1"
                    >
                        <RefreshCw className="w-4 h-4 mr-2 group-hover:rotate-180 transition-transform duration-500" />
                        Recarregar Agora
                    </Button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
