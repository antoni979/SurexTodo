import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  type EnrichedTask,
  type Priority,
  PRIORITIES,
  PRIORITY_META,
} from "../util";
import {
  CloseIcon,
  TrashIcon,
  CheckIcon,
  SunIcon,
  FolderIcon,
} from "./icons";
import RecurrencePicker from "./RecurrencePicker";
import SubtaskList from "./SubtaskList";
import AttachmentsPanel from "./AttachmentsPanel";

type Member = { userId: Id<"users">; username: string };

export default function TaskDetail({
  task,
  today,
  members,
  onClose,
  onOpenProject,
}: {
  task: EnrichedTask;
  today: string;
  members?: Member[];
  onClose: () => void;
  onOpenProject?: (projectId: Id<"tasks">) => void;
}) {
  const updateTask = useMutation(api.tasks.updateTask);
  const toggleComplete = useMutation(api.tasks.toggleComplete);
  const setMyDay = useMutation(api.tasks.setMyDay);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const convertToProject = useMutation(api.projects.convertToProject);

  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? "");
  const [converting, setConverting] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagFocused, setTagFocused] = useState(false);
  const allTags = useQuery(api.tasks.listAllTags) ?? [];

  function saveTitle() {
    const t = title.trim();
    if (t && t !== task.title) void updateTask({ taskId: task._id, title: t });
    else if (!t) setTitle(task.title);
  }

  async function convert() {
    if (converting) return;
    if (
      !confirm(
        "¿Convertir esta tarea en proyecto? Podrás añadir tareas, subtareas, hitos y un tablero kanban.",
      )
    )
      return;
    setConverting(true);
    try {
      await convertToProject({ taskId: task._id });
      if (onOpenProject) onOpenProject(task._id);
    } finally {
      setConverting(false);
    }
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
        {task.projectName && onOpenProject && task.parentTaskId && (
          <button
            className="detail-action"
            onClick={() => onOpenProject(task.parentTaskId as Id<"tasks">)}
          >
            <FolderIcon size={18} />
            Ir al proyecto · {task.projectName}
          </button>
        )}

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
            placeholder="Añade detalles, contexto, decisiones tomadas…"
            rows={9}
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

        <div className="detail-field">
          <label>Etiquetas</label>
          <div className="tag-chips">
            {(task.tags ?? []).map((tag) => (
              <span key={tag} className="tag-chip">
                {tag}
                <button
                  type="button"
                  className="tag-chip-remove"
                  onClick={() =>
                    void updateTask({
                      taskId: task._id,
                      tags: (task.tags ?? []).filter((t) => t !== tag),
                    })
                  }
                >×</button>
              </span>
            ))}
          </div>
          <div className="tag-autocomplete">
            <input
              type="text"
              className="tag-input"
              value={tagInput}
              placeholder="Nueva etiqueta…"
              autoComplete="off"
              onChange={(e) => setTagInput(e.target.value)}
              onFocus={() => setTagFocused(true)}
              onBlur={() => setTimeout(() => setTagFocused(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  const val = tagInput.trim().replace(/,/g, "");
                  if (!val) return;
                  const current = task.tags ?? [];
                  if (!current.includes(val)) {
                    void updateTask({ taskId: task._id, tags: [...current, val] });
                  }
                  setTagInput("");
                }
              }}
            />
            {tagFocused && (() => {
              const current = task.tags ?? [];
              const q = tagInput.trim().toLowerCase();
              const suggestions = allTags.filter(
                (t) => !current.includes(t) && (q === "" || t.toLowerCase().includes(q)),
              );
              return suggestions.length > 0 ? (
                <div className="tag-suggestions">
                  {suggestions.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      className="tag-suggestion"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        void updateTask({ taskId: task._id, tags: [...current, sug] });
                        setTagInput("");
                      }}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              ) : null;
            })()}
          </div>
          <small className="field-hint">Enter o coma para crear · o elige una existente</small>
        </div>

        <SubtaskList parentId={task._id} today={today} />

        <AttachmentsPanel taskId={task._id} />

        {!task.parentTaskId && (
          <button
            className="detail-action convert-action"
            onClick={() => void convert()}
            disabled={converting}
          >
            <FolderIcon size={18} />
            Convertir en proyecto
          </button>
        )}
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
