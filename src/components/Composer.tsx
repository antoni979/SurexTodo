import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import {
  PRIORITIES,
  PRIORITY_META,
  type Priority,
  type Recurrence,
} from "../util";
import { PlusIcon } from "./icons";
import RecurrencePicker from "./RecurrencePicker";

export type ComposerData = {
  title: string;
  priority: Priority;
  dueDate?: string;
  assigneeId?: Id<"users">;
  recurrence?: Recurrence;
};

type Member = { userId: Id<"users">; username: string };

export default function Composer({
  members,
  defaultDueDate,
  placeholder = "Añadir una tarea",
  onCreate,
}: {
  members?: Member[];
  defaultDueDate?: string;
  placeholder?: string;
  onCreate: (data: ComposerData) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("media");
  const [dueDate, setDueDate] = useState(defaultDueDate ?? "");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(
    undefined,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        title: title.trim(),
        priority,
        dueDate: dueDate || undefined,
        assigneeId: assigneeId ? (assigneeId as Id<"users">) : undefined,
        recurrence,
      });
      setTitle("");
      setDueDate(defaultDueDate ?? "");
      setRecurrence(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-main">
        <span className="composer-plus">
          <PlusIcon size={18} />
        </span>
        <input
          className="composer-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={placeholder}
        />
        <button type="submit" className="btn-primary btn-sm" disabled={busy}>
          Agregar
        </button>
      </div>
      <div className="composer-options">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          title="Prioridad"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_META[p].label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          title="Fecha de vencimiento"
        />
        {members && (
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            title="Asignar a"
          >
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.username}
              </option>
            ))}
          </select>
        )}
        <RecurrencePicker value={recurrence} onChange={setRecurrence} />
      </div>
      {error && <div className="composer-error">{error}</div>}
    </form>
  );
}
