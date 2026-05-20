import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CloseIcon } from "./icons";

export default function NewTeamModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (teamId: Id<"teams">) => void;
}) {
  const createTeam = useMutation(api.teams.createTeam);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const teamId = await createTeam({ name });
      onCreated(teamId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Nuevo equipo</h2>
          <button className="icon-btn" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <label>
            Nombre del equipo
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Casa, Trabajo, Proyecto X"
              autoFocus
              required
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Creando…" : "Crear equipo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
