/**
 * useNotifications.ts
 * Connects to the backend Socket.IO and fires browser notifications
 * when the bot receives a new inbound message from a lead.
 */
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const BACKEND_URL = (import.meta.env.VITE_API_URL as string || 'http://localhost:3001')
    .replace('/api', '');

// Backend emits snake_case; we normalise to camelCase for the frontend
interface RawNewMessageEvent {
    lead_id?: number;
    leadId?: number;
    lead_name?: string;
    leadName?: string;
    message: string;
    conversation_id?: number;
    conversationId?: number;
    funnel?: string;
}

interface NewMessageEvent {
    leadId: number;
    leadName: string;
    message: string;
    conversationId?: number;
    funnel?: string;
}

// Request notification permission once on first use
async function requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
}

function showNotification(leadName: string, message: string, leadId: number) {
    try {
        const n = new Notification(`💬 ${leadName}`, {
            body: message.length > 120 ? message.slice(0, 117) + '…' : message,
            icon: '/favicon.ico',
            tag: `lead-${leadId}`, // Replaces previous notification for same lead
            requireInteraction: false,
        });

        n.onclick = () => {
            window.focus();
            // Navigate to the lead if possible (CRM page is already open)
            n.close();
        };

        // Auto-close after 6 seconds
        setTimeout(() => n.close(), 6000);
    } catch { /* ignore */ }
}

export function useNotifications() {
    const socketRef = useRef<Socket | null>(null);
    const permissionGrantedRef = useRef(false);

    useEffect(() => {
        // Request permission on mount
        requestPermission().then((granted) => {
            permissionGrantedRef.current = granted;
        });

        const token = localStorage.getItem('legacy_token');
        if (!token) return;

        // Connect to backend Socket.IO
        const socket = io(BACKEND_URL, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 10,
            reconnectionDelay: 2000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('[Notifications] Socket.IO connected:', socket.id);
        });

        socket.on('new_message', (raw: RawNewMessageEvent) => {
            // Normalise: backend sends snake_case, frontend expects camelCase
            const data: NewMessageEvent = {
                leadId:         raw.lead_id   ?? raw.leadId   ?? 0,
                leadName:       raw.lead_name ?? raw.leadName ?? 'Cliente',
                message:        raw.message   ?? '',
                conversationId: raw.conversation_id ?? raw.conversationId,
                funnel:         raw.funnel,
            };

            // Only notify for inbound messages (from the lead, not bot)
            if (!data.leadId || !data.message) return;
            console.log('[Notifications] new_message:', data.leadName, data.message.slice(0, 60));

            // Fire browser notification if permission granted
            if (permissionGrantedRef.current) {
                showNotification(data.leadName, data.message, data.leadId);
            }

            // Also dispatch a custom DOM event for in-app Sofia notifier
            window.dispatchEvent(new CustomEvent('legacy_new_message', { detail: data }));
        });

        socket.on('disconnect', (reason) => {
            console.log('[Notifications] Socket.IO disconnected:', reason);
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, []);
}
