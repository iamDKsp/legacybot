import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/hooks/useNotifications";
import Index from "./pages/Index";
import CRM from "./pages/CRM";
import ClientHub from "./pages/ClientHub";
import Setup from "./pages/Setup";
import AIConfig from "./pages/AIConfig";
import DatabasePage from "./pages/DatabasePage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Inner component always calls the hook (follows Rules of Hooks)
function NotificationsActive() {
  useNotifications();
  return null;
}

// Boots up WebSocket notifications when user is authenticated
function NotificationsBootstrap() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <NotificationsActive /> : null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <NotificationsBootstrap />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route
              path="/crm"
              element={
                <ProtectedRoute>
                  <CRM />
                </ProtectedRoute>
              }
            />
            <Route
              path="/setup"
              element={
                <ProtectedRoute>
                  <Setup />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ai-config"
              element={
                <ProtectedRoute>
                  <AIConfig />
                </ProtectedRoute>
              }
            />
            <Route
              path="/client-hub"
              element={
                <ProtectedRoute>
                  <ClientHub />
                </ProtectedRoute>
              }
            />
            <Route
              path="/database"
              element={
                <ProtectedRoute>
                  <DatabasePage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
