import { useState } from "react";
import { useMutation } from "../data/react";
import { useCachedQuery } from "../hooks/useCachedQuery";
import { api } from "../data/api";
import type { Id } from "../data/types";
import { CloseIcon, PlusIcon } from "./icons";

// El botón flotante abre directamente la tarea rápida. (La "nota rápida"
// iba al Segundo Cerebro, que ya no forma parte de la app.)
export default function QuickCapture({
  workspaceId,
}: {
  workspaceId: Id<"workspaces"> | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="quick-capture">
        <button
          type="button"
          className="quick-capture-fab"
          title="Tarea rápida"
          onClick={() => setOpen(true)}
        >
          <PlusIcon size={22} />
        </button>
      </div>
      {open && <QuickTaskModal workspaceId={workspaceId} onClose={() => setOpen(false)} />}
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
  const lists = useCachedQuery(api.lists.listMyLists, workspaceId ? { workspaceId } : {}) ?? [];
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [listId, setListId] = useState("");
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
        listId: listId ? (listId as Id<"lists">) : undefined,
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
          {lists.length > 0 && (
            <select
              style={{ marginTop: 8 }}
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              title="Añadir a una lista"
            >
              <option value="">Sin lista</option>
              {lists.map((l) => (
                <option key={l._id} value={l._id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          {error && <div className="composer-error">{error}</div>}
          <button type="submit" className="btn-primary btn-sm settings-goto" disabled={busy}>
            Crear tarea
          </button>
        </div>
      </form>
    </div>
  );
}
