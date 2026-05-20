import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

export default function SignIn() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn("password", { email, password, flow });
    } catch {
      setError(
        flow === "signIn"
          ? "Email o contraseña incorrectos."
          : "No se pudo crear la cuenta. Revisa el email o usa una contraseña más larga (mín. 8 caracteres).",
      );
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
        <p className="auth-sub">
          {flow === "signIn"
            ? "Inicia sesión para ver tus tareas"
            : "Crea una cuenta para empezar"}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@ejemplo.com"
              required
              autoComplete="email"
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              minLength={8}
              autoComplete={
                flow === "signIn" ? "current-password" : "new-password"
              }
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading
              ? "Un momento…"
              : flow === "signIn"
                ? "Iniciar sesión"
                : "Crear cuenta"}
          </button>
        </form>

        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setError(null);
            setFlow(flow === "signIn" ? "signUp" : "signIn");
          }}
        >
          {flow === "signIn"
            ? "¿No tienes cuenta? Regístrate"
            : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </div>
    </div>
  );
}
