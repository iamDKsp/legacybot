import React, { useState } from "react";

// ============================================================
// CONTROLE DE PAUSA DO SISTEMA
// Defina SYSTEM_PAUSED = true para bloquear o acesso.
// Defina SYSTEM_PAUSED = false para liberar normalmente.
// ============================================================
const SYSTEM_PAUSED = true;

// Senha secreta para o dono do sistema desativar a tela sem alterar o código
// Mude para uma senha forte de sua preferência
const OWNER_SECRET = "legacy@admin2024";
// ============================================================

export function SystemPaused() {
  const [showSecret, setShowSecret] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [wrongPassword, setWrongPassword] = useState(false);
  const [bypassed, setBypassed] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  if (!SYSTEM_PAUSED || bypassed) return null;

  const handleLogoClick = () => {
    const next = clickCount + 1;
    setClickCount(next);
    if (next >= 5) {
      setShowSecret(true);
    }
  };

  const handleSecretSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (secretInput === OWNER_SECRET) {
      setBypassed(true);
    } else {
      setWrongPassword(true);
      setSecretInput("");
      setTimeout(() => setWrongPassword(false), 2000);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "linear-gradient(135deg, #0a0a0f 0%, #12071a 50%, #0a0a0f 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Partículas de fundo */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: `${Math.random() * 3 + 1}px`,
              height: `${Math.random() * 3 + 1}px`,
              background: "#c9a227",
              borderRadius: "50%",
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.4 + 0.1,
              animation: `float ${Math.random() * 6 + 4}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 4}s`,
            }}
          />
        ))}
      </div>

      {/* Glow de fundo */}
      <div
        style={{
          position: "absolute",
          width: "600px",
          height: "600px",
          background: "radial-gradient(circle, rgba(201,162,39,0.08) 0%, transparent 70%)",
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />

      {/* Card principal */}
      <div
        style={{
          position: "relative",
          background: "rgba(18, 7, 26, 0.85)",
          border: "1px solid rgba(201, 162, 39, 0.25)",
          borderRadius: "24px",
          padding: "56px 64px",
          maxWidth: "520px",
          width: "90%",
          backdropFilter: "blur(20px)",
          boxShadow: "0 0 60px rgba(201,162,39,0.12), 0 40px 80px rgba(0,0,0,0.6)",
          textAlign: "center",
        }}
      >
        {/* Ícone de pausa */}
        <div
          onClick={handleLogoClick}
          style={{
            cursor: "default",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "88px",
            height: "88px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(201,162,39,0.15), rgba(201,162,39,0.05))",
            border: "2px solid rgba(201,162,39,0.4)",
            marginBottom: "32px",
            boxShadow: "0 0 30px rgba(201,162,39,0.2)",
            userSelect: "none",
          }}
        >
          {/* Ícone de pausa (dois traços) */}
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <rect x="8" y="6" width="8" height="24" rx="3" fill="#c9a227" />
            <rect x="20" y="6" width="8" height="24" rx="3" fill="#c9a227" />
          </svg>
        </div>

        {/* Badge */}
        <div
          style={{
            display: "inline-block",
            background: "rgba(201,162,39,0.12)",
            border: "1px solid rgba(201,162,39,0.35)",
            color: "#c9a227",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "3px",
            textTransform: "uppercase",
            padding: "6px 16px",
            borderRadius: "100px",
            marginBottom: "24px",
          }}
        >
          Sistema Pausado
        </div>

        {/* Título */}
        <h1
          style={{
            color: "#ffffff",
            fontSize: "28px",
            fontWeight: 700,
            margin: "0 0 16px 0",
            lineHeight: 1.2,
          }}
        >
          Acesso Temporariamente
          <br />
          <span style={{ color: "#c9a227" }}>Suspenso</span>
        </h1>

        {/* Mensagem */}
        <p
          style={{
            color: "rgba(255,255,255,0.55)",
            fontSize: "15px",
            lineHeight: 1.7,
            margin: "0 0 36px 0",
          }}
        >
          Este sistema está temporariamente suspenso devido a pendência financeira.
          Entre em contato com o suporte para regularizar e reativar o acesso.
        </p>

        {/* Divisor */}
        <div
          style={{
            height: "1px",
            background: "linear-gradient(90deg, transparent, rgba(201,162,39,0.3), transparent)",
            marginBottom: "36px",
          }}
        />

        {/* Contato */}
        <div
          style={{
            background: "rgba(201,162,39,0.07)",
            border: "1px solid rgba(201,162,39,0.2)",
            borderRadius: "12px",
            padding: "20px 24px",
          }}
        >
          <p
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: "12px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              margin: "0 0 8px 0",
              fontWeight: 600,
            }}
          >
            Suporte
          </p>
          <p
            style={{
              color: "#c9a227",
              fontSize: "16px",
              fontWeight: 600,
              margin: 0,
            }}
          >
            📱 Entre em contato com o administrador
          </p>
        </div>

        {/* Formulário secreto (aparece após 5 cliques no ícone) */}
        {showSecret && (
          <form
            onSubmit={handleSecretSubmit}
            style={{
              marginTop: "32px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <input
              type="password"
              placeholder="Senha de administrador"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              autoFocus
              style={{
                background: wrongPassword
                  ? "rgba(220,53,69,0.1)"
                  : "rgba(255,255,255,0.06)",
                border: wrongPassword
                  ? "1px solid rgba(220,53,69,0.5)"
                  : "1px solid rgba(255,255,255,0.15)",
                borderRadius: "10px",
                padding: "12px 16px",
                color: "#fff",
                fontSize: "14px",
                outline: "none",
                textAlign: "center",
                transition: "border 0.2s",
              }}
            />
            {wrongPassword && (
              <p style={{ color: "#ff4d6d", fontSize: "13px", margin: 0 }}>
                Senha incorreta. Tente novamente.
              </p>
            )}
            <button
              type="submit"
              style={{
                background: "linear-gradient(135deg, #c9a227, #a8841c)",
                border: "none",
                borderRadius: "10px",
                padding: "12px",
                color: "#0a0a0f",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Desbloquear
            </button>
          </form>
        )}
      </div>

      {/* Rodapé */}
      <p
        style={{
          marginTop: "32px",
          color: "rgba(255,255,255,0.2)",
          fontSize: "12px",
          letterSpacing: "1px",
        }}
      >
        Legacy Bot — Sistema de Automação Inteligente
      </p>

      {/* Animações CSS */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); opacity: 0.2; }
          50% { transform: translateY(-20px); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
