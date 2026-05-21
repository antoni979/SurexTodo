import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CheckIcon, PlusIcon, TrashIcon } from "./icons";
import { formatDue } from "../util";

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
  const [date, setDate] = useState("");
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
      setDate("");
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
        {list.map((s) => {
          const due = s.dueDate ? formatDue(s.dueDate, today) : null;
          return (
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
              <input
                type="date"
                className="subtask-date"
                value={s.dueDate ?? ""}
                onChange={(e) =>
                  void updateTask({
                    taskId: s._id,
                    dueDate: e.target.value || null,
                  })
                }
              />
              {due && (
                <span
                  className={
                    "subtask-due" + (due.overdue ? " overdue" : "")
                  }
                >
                  {due.label}
                </span>
              )}
              <button
                className="icon-btn subtask-del"
                title="Eliminar"
                onClick={() => void deleteTask({ taskId: s._id })}
              >
                <TrashIcon size={13} />
              </button>
            </div>
          );
        })}
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
        <input
          type="date"
          value={date}
          title="Fecha (opcional)"
          onChange={(e) => setDate(e.target.value)}
        />
        <button
          type="submit"
          className="btn-primary btn-sm"
          disabled={busy || !title.trim()}
        >
          +
        </button>
      </form>
    </div>
  );
}
