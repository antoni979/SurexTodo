import { useState } from "react";
import { useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";

export default function UsernameSetup() {
  const setUsername = useMutation(api.profiles.setUsername);
  const { signOut } = useAuthActions();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await setUsername({ username: value });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar el nombre",
      );
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/icon.svg" alt="" width={48} height={48} />
          <h1>¡Casi listo!</h1>
        </div>
        <p className="auth-sub">
          Elige tu nombre de usuario. Tus compañeros lo usarán para añadirte a
          sus equipos.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Nombre de usuario
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="ej. antonio"
              required
              autoFocus
            />
          </label>
          <small className="auth-hint">
            3 a 20 caracteres. Letras, números y . _ -
          </small>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Guardando…" : "Continuar"}
          </button>
        </form>

        <button type="button" className="auth-switch" onClick={() => signOut()}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
