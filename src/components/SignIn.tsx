import { useState } from "react";
import { useAuthActions } from "../data/react";

// Se entra con la misma cuenta que en la Intranet (nº SAP + contraseña). No
// hay registro: las cuentas las da de alta RRHH en la Intranet, y el acceso
// al todo se concede aparte.
export default function SignIn() {
  const { signIn } = useAuthActions();
  const [sapId, setSapId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(sapId, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Usuario o contraseña incorrectos");
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/icon.svg" alt="" width={48} height={48} />
          <h1>SurexTodo</h1>
        </div>
        <p className="auth-sub">Entra con tu usuario de la Intranet</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Nº de usuario (SAP)
            <input
              type="text"
              inputMode="numeric"
              value={sapId}
              onChange={(e) => setSapId(e.target.value)}
              placeholder="Tu número de personal"
              required
              autoComplete="username"
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="La misma de la Intranet"
              required
              autoComplete="current-password"
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Un momento…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
