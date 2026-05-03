import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authApi, User } from '@/services/api';

interface RememberedUser {
    id: number;
    name: string;
    email: string;
    avatar_url?: string;
    token: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    rememberedUsers: RememberedUser[];
    login: (email: string, password: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
    loginAsRemembered: (rememberedUser: RememberedUser) => Promise<{ success: boolean; error?: string }>;
    forgetUser: (userId: number) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const REMEMBERED_KEY = 'legacy_remembered_users';

function loadRemembered(): RememberedUser[] {
    try {
        const raw = localStorage.getItem(REMEMBERED_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveRemembered(users: RememberedUser[]) {
    localStorage.setItem(REMEMBERED_KEY, JSON.stringify(users));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [rememberedUsers, setRememberedUsers] = useState<RememberedUser[]>(loadRemembered);

    // Restore session from localStorage on mount
    useEffect(() => {
        const savedToken = localStorage.getItem('legacy_token');
        const savedUser = localStorage.getItem('legacy_user');

        if (savedToken && savedUser) {
            try {
                setToken(savedToken);
                setUser(JSON.parse(savedUser));
            } catch {
                localStorage.removeItem('legacy_token');
                localStorage.removeItem('legacy_user');
            }
        }
        setIsLoading(false);
    }, []);

    const login = useCallback(async (email: string, password: string, rememberMe = false) => {
        try {
            const response = await authApi.login(email, password);
            const { token: newToken, user: newUser } = response.data.data;

            setToken(newToken);
            setUser(newUser);

            localStorage.setItem('legacy_token', newToken);
            localStorage.setItem('legacy_user', JSON.stringify(newUser));

            // Save to remembered users if "remember me" is checked
            if (rememberMe) {
                setRememberedUsers(prev => {
                    const filtered = prev.filter(u => u.id !== newUser.id);
                    const updated = [
                        { id: newUser.id, name: newUser.name, email: newUser.email, avatar_url: newUser.avatar_url, token: newToken },
                        ...filtered,
                    ];
                    saveRemembered(updated);
                    return updated;
                });
            }

            return { success: true };
        } catch (err: unknown) {
            const error = err as { response?: { data?: { error?: string } } };
            return {
                success: false,
                error: error?.response?.data?.error || 'Erro ao fazer login. Verifique suas credenciais.',
            };
        }
    }, []);

    const loginAsRemembered = useCallback(async (rememberedUser: RememberedUser) => {
        try {
            // Set the token temporarily to make the /me request
            localStorage.setItem('legacy_token', rememberedUser.token);

            const response = await authApi.me();
            const freshUser = response.data.data;

            setToken(rememberedUser.token);
            setUser(freshUser);
            localStorage.setItem('legacy_user', JSON.stringify(freshUser));

            // Update remembered user data with fresh info
            setRememberedUsers(prev => {
                const updated = prev.map(u =>
                    u.id === rememberedUser.id
                        ? { ...u, name: freshUser.name, email: freshUser.email, avatar_url: freshUser.avatar_url }
                        : u
                );
                saveRemembered(updated);
                return updated;
            });

            return { success: true };
        } catch {
            // Token expired or invalid — remove from remembered
            setRememberedUsers(prev => {
                const updated = prev.filter(u => u.id !== rememberedUser.id);
                saveRemembered(updated);
                return updated;
            });
            localStorage.removeItem('legacy_token');
            return { success: false, error: 'Sessão expirada. Faça login novamente.' };
        }
    }, []);

    const forgetUser = useCallback((userId: number) => {
        setRememberedUsers(prev => {
            const updated = prev.filter(u => u.id !== userId);
            saveRemembered(updated);
            return updated;
        });
    }, []);

    const logout = useCallback(() => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('legacy_token');
        localStorage.removeItem('legacy_user');
    }, []);

    return (
        <AuthContext.Provider value={{
            user,
            token,
            isLoading,
            isAuthenticated: !!user && !!token,
            rememberedUsers,
            login,
            loginAsRemembered,
            forgetUser,
            logout,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
}
