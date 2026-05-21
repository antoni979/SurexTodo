import { useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CalendarIcon, CheckIcon, PlusIcon, TrashIcon } from "./icons";
import { formatDue } from "../util";

function DateChip({
  value,
  onChange,
  today,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  today: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const due = value ? formatDue(value, today) : null;
  const open = () => {
    const el = ref.current;
    if (!el) return;
    // Native picker; showPicker is widely supported in modern Chromium/Safari
    if ("showPicker" in el && typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* fall through */
      }
    }
    el.focus();
    el.click();
  };
  return (
    <div className="subtask-date-chip">
      <button
        type="button"
        className={
          "date-chip" +
          (due ? " set" : "") +
          (due?.overdue ? " overdue" : "")
        }
        onClick={open}
        title={due ? `Vence ${due.label}` : "Añadir fecha"}
      >
        <CalendarIcon size={12} />
        {due ? due.label : "Fecha"}
      </button>
      {value && (
        <button
          type="button"
          className="date-chip-clear"
          onClick={() => onChange(null)}
          title="Quitar fecha"
        >
          ×
        </button>
      )}
      <input
        ref={ref}
        type="date"
        value={value ?? ""}
        className="date-chip-input"
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  );
}

export default function SubtaskList({
  parentId,
  today,
}: {
  parentId: Id<"tasks">;
  today: string;
}) {
  const subs = useQuery(api.tasks.listSubtasks, { parentId });
  const createSubtask = useMutation(api.tasks.createSubtask);
  const toggle = useMutation(api.tasks.toggleComplete);
  const updateTask = useMutation(api.tasks.updateTask);
  const deleteTask = useMutation(api.tasks.deleteTask);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await createSubtask({
        parentId,
        title: title.trim(),
        dueDate: date || undefined,
      });
      setTitle("");
      setDate(null);
    } finally {
      setBusy(false);
    }
  }

  const list = subs ?? [];
  const done = list.filter((s) => s.completed).length;

  return (
    <div className="subtasks">
      <div className="subtasks-header">
        <span>Subtareas</span>
        {list.length > 0 && (
          <span className="subtasks-count">
            {done}/{list.length}
          </span>
        )}
      </div>
      <div className="subtasks-list">
        {list.map((s) => (
          <div
            key={s._id}
            className={"subtask-row" + (s.completed ? " done" : "")}
          >
            <button
              className={"check" + (s.completed ? " checked" : "")}
              onClick={() => void toggle({ taskId: s._id, today })}
              title={s.completed ? "Marcar pendiente" : "Completar"}
            >
              {s.completed && <CheckIcon size={11} />}
            </button>
            <span className="subtask-title">{s.title}</span>
            <DateChip
              value={s.dueDate}
              today={today}
              onChange={(v) =>
                void updateTask({ taskId: s._id, dueDate: v })
              }
            />
            <button
              className="icon-btn subtask-del"
              title="Eliminar"
              onClick={() => void deleteTask({ taskId: s._id })}
            >
              <TrashIcon size={13} />
            </button>
          </div>
        ))}
      </div>
      <form className="subtask-add" onSubmit={add}>
        <span className="composer-plus">
          <PlusIcon size={14} />
        </span>
        <input
          type="text"
          value={title}
          placeholder="Añadir subtarea"
          onChange={(e) => setTitle(e.target.value)}
        />
        <DateChip value={date} onChange={setDate} today={today} />
        <button
          type="submit"
          className="btn-primary btn-sm"
          disabled={busy || !title.trim()}
        >
          Añadir
        </button>
      </form>
    </div>
  );
}
