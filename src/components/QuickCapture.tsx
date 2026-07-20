import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CloseIcon, PlusIcon } from "./icons";

export default function QuickCapture({
  workspaceId,
}: {
  workspaceId: Id<"workspaces"> | null;
}) {
  const [openMenu, setOpenMenu] = useState(false);
  const [modal, setModal] = useState<"task" | "note" | null>(null);

  return (
    <>
      <div className="quick-capture">
        {openMenu && (
          <div className="quick-capture-menu">
            <button
              type="button"
              onClick={() => {
                setModal("task");
                setOpenMenu(false);
              }}
            >
              ✅ Tarea rápida
            </button>
            <button
              type="button"
              onClick={() => {
                setModal("note");
                setOpenMenu(false);
              }}
            >
              🧠 Nota rápida
            </button>
          </div>
        )}
        <button
          type="button"
          className="quick-capture-fab"
          title="Captura rápida"
          onClick={() => setOpenMenu((v) => !v)}
        >
          <PlusIcon size={22} />
        </button>
      </div>

      {modal === "task" && (
        <QuickTaskModal workspaceId={workspaceId} onClose={() => setModal(null)} />
      )}
      {modal === "note" && <QuickNoteModal onClose={() => setModal(null)} />}
    </>
  );
}

function QuickTaskModal({
  workspaceId,
  onClose,
}: {
  workspaceId: Id<"workspaces"> | null;
  onClose: () => void;
}) {
  const createTask = useMutation(api.tasks.createTask);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createTask({
        title: t,
        priority: "media",
        dueDate: dueDate || undefined,
        ...(workspaceId ? { workspaceId } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="settings-modal" onSubmit={submit}>
        <div className="settings-head">
          <h2>✅ Tarea rápida</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="settings-section">
          <input
            className="quick-capture-input"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="¿Qué hay que hacer?"
          />
          <input
            type="date"
            style={{ marginTop: 8 }}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          {error && <div className="composer-error">{error}</div>}
          <button type="submit" className="btn-primary btn-sm settings-goto" disabled={busy}>
            Crear tarea
          </button>
        </div>
      </form>
    </div>
  );
}

function QuickNoteModal({ onClose }: { onClose: () => void }) {
  const createNote = useMutation(api.brain.createNote);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim() || body.trim().slice(0, 60);
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createNote({ title: t, body });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="settings-modal" onSubmit={submit}>
        <div className="settings-head">
          <h2>🧠 Nota rápida</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="settings-section">
          <input
            className="quick-capture-input"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título (opcional, se infiere del texto)"
          />
          <textarea
            className="quick-capture-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribe aquí… usa [[Título]] para enlazar otra nota."
          />
          {error && <div className="composer-error">{error}</div>}
          <button type="submit" className="btn-primary btn-sm settings-goto" disabled={busy}>
            Guardar en el Segundo Cerebro
          </button>
        </div>
      </form>
    </div>
  );
}
