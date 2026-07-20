import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  type EnrichedTask,
  type Priority,
  type KanbanStatus,
  PRIORITIES,
  PRIORITY_META,
  KANBAN_COLUMNS,
  formatDue,
} from "../util";
import { PlusIcon, CheckIcon, TrashIcon } from "./icons";

type Member = { userId: Id<"users">; username: string };

export default function TeamKanbanBoard({
  teamId,
  tasks,
  today,
  members,
  onSelectTask,
  selectedTaskId,
}: {
  teamId: Id<"teams">;
  tasks: EnrichedTask[];
  today: string;
  members: Member[];
  onSelectTask: (id: Id<"tasks">) => void;
  selectedTaskId: Id<"tasks"> | null;
}) {
  const moveTask = useMutation(api.tasks.moveTaskInKanban);
  const createTask = useMutation(api.tasks.createTask);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<KanbanStatus | null>(null);
  const [composer, setComposer] = useState<KanbanStatus | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("media");
  const [newAssignee, setNewAssignee] = useState("");

  const byCol: Record<KanbanStatus, EnrichedTask[]> = { todo: [], in_progress: [], done: [] };
  for (const t of tasks) {
    const col = (t.kanbanStatus as KanbanStatus) ?? "todo";
    byCol[col].push(t);
  }
  for (const k of Object.keys(byCol) as KanbanStatus[]) {
    byCol[k].sort(
      (a, b) => (a.kanbanOrder ?? 0) - (b.kanbanOrder ?? 0) || a._creationTime - b._creationTime,
    );
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!composer || !newTitle.trim()) return;
    const newId = await createTask({
      title: newTitle.trim(),
      priority: newPriority,
      dueDate: newDate || undefined,
      teamId,
      assigneeId: newAssignee ? (newAssignee as Id<"users">) : undefined,
    });
    if (composer !== "todo") {
      await moveTask({ taskId: newId, status: composer });
    }
    setNewTitle("");
    setNewDate("");
    setNewPriority("media");
    setNewAssignee("");
    setComposer(null);
  }

  return (
    <section className="kanban">
      {KANBAN_COLUMNS.map((col) => (
        <div
          key={col.key}
          className={
            "kanban-col" +
            (draggingId ? " kanban-col-droppable" : "") +
            (dragOverCol === col.key ? " kanban-col-dragover" : "")
          }
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOverCol(col.key);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setDragOverCol((c) => (c === col.key ? null : c));
          }}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            if (id) void moveTask({ taskId: id as Id<"tasks">, status: col.key });
            setDraggingId(null);
            setDragOverCol(null);
          }}
        >
          <div className="kanban-col-head">
            <span>{col.label}</span>
            <span className="group-count">{byCol[col.key].length}</span>
          </div>
          <div className="kanban-col-body">
            {byCol[col.key].map((t) => (
              <TeamKanbanCard
                key={t._id}
                task={t}
                today={today}
                members={members}
                selected={selectedTaskId === t._id}
                isDragging={draggingId === t._id}
                onSelect={() => onSelectTask(t._id as Id<"tasks">)}
                onDragStart={() => setDraggingId(t._id)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverCol(null);
                }}
                onMove={(s) => void moveTask({ taskId: t._id as Id<"tasks">, status: s })}
              />
            ))}
            {composer === col.key ? (
              <form className="kanban-new" onSubmit={submitNew}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Título"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
                <div className="kanban-new-row">
                  <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as Priority)}>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_META[p].label}
                      </option>
                    ))}
                  </select>
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                </div>
                <select value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.username}
                    </option>
                  ))}
                </select>
                <div className="kanban-new-actions">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setComposer(null)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary btn-sm">
                    Crear
                  </button>
                </div>
              </form>
            ) : (
              <button className="kanban-add" onClick={() => setComposer(col.key)}>
                <PlusIcon size={14} /> Añadir tarea
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function TeamKanbanCard({
  task,
  today,
  members,
  onSelect,
  selected,
  isDragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  task: EnrichedTask;
  today: string;
  members: Member[];
  onSelect: () => void;
  selected: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (s: KanbanStatus) => void;
}) {
  const toggle = useMutation(api.tasks.toggleComplete);
  const updateTask = useMutation(api.tasks.updateTask);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const [open, setOpen] = useState(false);
  const meta = PRIORITY_META[task.priority as Priority];
  const due = task.dueDate ? formatDue(task.dueDate, today) : null;

  return (
    <div
      className={
        "kanban-card" +
        (task.completed ? " done" : "") +
        (selected ? " kanban-card-selected" : "") +
        (isDragging ? " kanban-card-dragging" : "")
      }
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task._id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="kanban-card-row">
        <button
          className={"check" + (task.completed ? " checked" : "")}
          onClick={() => void toggle({ taskId: task._id, today })}
        >
          {task.completed && <CheckIcon size={11} />}
        </button>
        <div className="kanban-card-title" onClick={onSelect}>
          {task.title}
        </div>
        <button
          className="icon-btn kanban-expand-btn"
          title="Expandir"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          {open ? "▲" : "▼"}
        </button>
      </div>
      <div className="kanban-card-meta">
        <span className="chip" style={{ color: meta.color }}>
          <span className="dot" style={{ background: meta.color }} />
          {meta.short}
        </span>
        {due && <span className={"chip" + (due.overdue ? " overdue" : "")}>{due.label}</span>}
        {task.assigneeName && <span className="chip">{task.assigneeName}</span>}
        {task.subtaskTotal > 0 && (
          <span className="chip">
            {task.subtaskDone}/{task.subtaskTotal}
          </span>
        )}
      </div>

      {open && (
        <div className="kanban-card-expand">
          <div className="kanban-card-actions">
            {KANBAN_COLUMNS.filter((c) => c.key !== task.kanbanStatus).map((c) => (
              <button key={c.key} className="btn-ghost btn-sm" onClick={() => onMove(c.key)}>
                → {c.label}
              </button>
            ))}
            <select
              value={task.assigneeId ?? ""}
              onChange={(e) =>
                void updateTask({
                  taskId: task._id,
                  assigneeId: e.target.value ? (e.target.value as Id<"users">) : null,
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
            <button
              className="btn-danger btn-sm"
              onClick={() => {
                if (confirm("¿Eliminar esta tarea?")) void deleteTask({ taskId: task._id });
              }}
            >
              <TrashIcon size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
