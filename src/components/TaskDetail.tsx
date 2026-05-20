import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  type EnrichedTask,
  type Priority,
  PRIORITIES,
  PRIORITY_META,
} from "../util";
import { CloseIcon, TrashIcon, CheckIcon, SunIcon } from "./icons";
import RecurrencePicker from "./RecurrencePicker";

type Member = { userId: Id<"users">; username: string };

export default function TaskDetail({
  task,
  today,
  members,
  onClose,
}: {
  task: EnrichedTask;
  today: string;
  members?: Member[];
  onClose: () => void;
}) {
  const updateTask = useMutation(api.tasks.updateTask);
  const toggleComplete = useMutation(api.tasks.toggleComplete);
  const setMyDay = useMutation(api.tasks.setMyDay);
  const deleteTask = useMutation(api.tasks.deleteTask);

  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? "");

  function saveTitle() {
    const t = title.trim();
    if (t && t !== task.title) void updateTask({ taskId: task._id, title: t });
    else if (!t) setTitle(task.title);
  }

  return (
    <aside className="detail">
      <div className="detail-head">
        <button
          className={"check" + (task.completed ? " checked" : "")}
          onClick={() => void toggleComplete({ taskId: task._id, today })}
        >
          {task.completed && <CheckIcon size={13} />}
        </button>
        <input
          className="detail-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <button className="icon-btn" onClick={onClose} title="Cerrar">
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="detail-body">
        <button
          className={"detail-action" + (task.inMyDay ? " on" : "")}
          onClick={() =>
            void setMyDay({
              taskId: task._id,
              today,
              inMyDay: !task.inMyDay,
            })
          }
        >
          <SunIcon size={18} />
          {task.inMyDay ? "Quitar de Mi día" : "Añadir a Mi día"}
        </button>

        <div className="detail-field">
          <label>Prioridad</label>
          <div className="prio-buttons">
            {PRIORITIES.map((p) => {
              const meta = PRIORITY_META[p];
              const active = task.priority === p;
              return (
                <button
                  key={p}
                  className={"prio-btn" + (active ? " active" : "")}
                  style={
                    active
                      ? {
                          background: meta.color,
                          borderColor: meta.color,
                          color: "#fff",
                        }
                      : { color: meta.color }
                  }
                  onClick={() =>
                    void updateTask({ taskId: task._id, priority: p })
                  }
                >
                  {meta.short}
                </button>
              );
            })}
          </div>
        </div>

        <div className="detail-field">
          <label>Fecha de vencimiento</label>
          <input
            type="date"
            value={task.dueDate ?? ""}
            onChange={(e) =>
              void updateTask({
                taskId: task._id,
                dueDate: e.target.value || null,
              })
            }
          />
        </div>

        <div className="detail-field">
          <label>Repetir</label>
          <RecurrencePicker
            value={task.recurrence}
            onChange={(r) =>
              void updateTask({ taskId: task._id, recurrence: r ?? null })
            }
          />
          {task.recurrence && (
            <small className="field-hint">
              Al completarla se crea automáticamente la siguiente.
            </small>
          )}
        </div>

        {task.teamId && members && (
          <div className="detail-field">
            <label>Asignar a</label>
            <select
              value={task.assigneeId ?? ""}
              onChange={(e) =>
                void updateTask({
                  taskId: task._id,
                  assigneeId: e.target.value
                    ? (e.target.value as Id<"users">)
                    : null,
                })
              }
            >
              <option value="">Sin asignar</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.username}
                </option>
              ))}
            </select>
            <small className="field-hint">
              Si la tarea tiene vencimiento, solo aparece en "Planeado" de la
              persona asignada.
            </small>
          </div>
        )}

        <div className="detail-field">
          <label>Nota</label>
          <textarea
            value={note}
            placeholder="Añade detalles…"
            rows={4}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if (note !== (task.note ?? ""))
                void updateTask({
                  taskId: task._id,
                  note: note.trim() || null,
                });
            }}
          />
        </div>
      </div>

      <div className="detail-foot">
        <span className="detail-info">Creada por {task.creatorName}</span>
        <button
          className="btn-danger"
          onClick={() => {
            if (confirm("¿Eliminar esta tarea?")) {
              void deleteTask({ taskId: task._id });
              onClose();
            }
          }}
        >
          <TrashIcon size={16} />
          Eliminar
        </button>
      </div>
    </aside>
  );
}
