import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type KanbanStatus,
  type ProjectDetail,
  type ProjectStatus,
  type ProjectTask,
  KANBAN_COLUMNS,
  PROJECT_STATUSES,
  PROJECT_STATUS_META,
  PRIORITIES,
  PRIORITY_META,
  type Priority,
  shortDate,
  formatDue,
} from "../../util";
import {
  CheckIcon,
  CloseIcon,
  FlagIcon,
  KanbanIcon,
  LinkIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UsersIcon,
} from "../icons";
import TaskDetail from "../TaskDetail";

export default function ProjectView({
  projectId,
  today,
}: {
  projectId: Id<"tasks">;
  today: string;
}) {
  const project = useQuery(api.projects.getProject, { projectId });

  const [tab, setTab] = useState<"board" | "list">("board");
  const [search, setSearch] = useState("");
  const [showDone, setShowDone] = useState(() => localStorage.getItem("showDone") !== "false");
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);

  const selectedTask = useQuery(
    api.tasks.getTask,
    selectedTaskId ? { taskId: selectedTaskId, today } : "skip",
  );

  if (project === undefined) {
    return (
      <div className="screen">
        <div className="screen-scroll">
          <p className="screen-empty">Cargando…</p>
        </div>
      </div>
    );
  }
  if (project === null) {
    return (
      <div className="screen">
        <div className="screen-scroll">
          <div className="screen-empty">
            <p>No tienes acceso a este proyecto.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={"screen project-screen" + (selectedTaskId ? " with-detail" : "")}>
      <ProjectHeader project={project} />
      <div className="project-tabs">
        <button
          className={"tab-btn" + (tab === "board" ? " active" : "")}
          onClick={() => setTab("board")}
        >
          <KanbanIcon size={15} /> Tablero
        </button>
        <button
          className={"tab-btn" + (tab === "list" ? " active" : "")}
          onClick={() => setTab("list")}
        >
          Lista
        </button>
        <div className="project-tabs-spacer" />
        {project.tasks.some((t) => t.completed) && (
          <button
            className={"toggle-done-btn" + (showDone ? " active" : "")}
            onClick={() => {
              const next = !showDone;
              setShowDone(next);
              localStorage.setItem("showDone", String(next));
            }}
          >
            {showDone ? "Ocultar completadas" : "Mostrar completadas"}
          </button>
        )}
        <div className="search-input search-input-compact">
          <SearchIcon size={14} />
          <input
            type="search"
            value={search}
            placeholder="Buscar tarea…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="project-body">
        <div className="screen-scroll project-scroll">
          <ProjectMetaPanel project={project} />
          {tab === "board" ? (
            <KanbanBoard
              project={project}
              today={today}
              search={search}
              showDone={showDone}
              onSelectTask={setSelectedTaskId}
              selectedTaskId={selectedTaskId}
            />
          ) : (
            <TaskListPanel
              project={project}
              today={today}
              search={search}
              showDone={showDone}
              onSelectTask={setSelectedTaskId}
              selectedTaskId={selectedTaskId}
            />
          )}
          <MilestonesPanel project={project} />
          <LinksPanel project={project} />
        </div>
        {selectedTaskId && (
          <div className="project-detail-panel">
            {selectedTask === undefined && (
              <div className="detail-loading">Cargando…</div>
            )}
            {selectedTask !== null && selectedTask !== undefined && (
              <TaskDetail
                task={selectedTask}
                today={today}
                members={project.members}
                onClose={() => setSelectedTaskId(null)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------- header -------- */

function ProjectHeader({ project }: { project: ProjectDetail }) {
  const updateProject = useMutation(api.projects.updateProject);
  const convertFromProject = useMutation(api.projects.convertFromProject);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const updateTask = useMutation(api.tasks.updateTask);

  const [title, setTitle] = useState(project.title);
  const meta = PROJECT_STATUS_META[project.projectStatus];

  return (
    <header className="project-head" style={{ borderColor: meta.color }}>
      <div className="project-head-row">
        <input
          className="project-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const t = title.trim();
            if (t && t !== project.title)
              void updateTask({ taskId: project._id, title: t });
            else if (!t) setTitle(project.title);
          }}
        />
        <select
          className="project-status-select"
          value={project.projectStatus}
          style={{ borderColor: meta.color, color: meta.color }}
          onChange={(e) =>
            void updateProject({
              projectId: project._id,
              projectStatus: e.target.value as ProjectStatus,
            })
          }
        >
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_META[s].label}
            </option>
          ))}
        </select>
        <button
          className="btn-ghost btn-sm"
          onClick={async () => {
            try {
              await convertFromProject({ projectId: project._id });
            } catch (e) {
              alert(e instanceof Error ? e.message : "Error");
            }
          }}
          title="Volver a tarea normal"
        >
          ↩ Volver a tarea
        </button>
        <button
          className="btn-danger btn-sm"
          onClick={() => {
            if (
              confirm(
                "¿Eliminar el proyecto y todas sus tareas, subtareas, hitos y enlaces?",
              )
            )
              void deleteTask({ taskId: project._id });
          }}
        >
          <TrashIcon size={14} /> Eliminar
        </button>
      </div>
      <div className="project-head-meta">
        <ProgressBar
          progress={project.progress}
          color={meta.color}
          width={180}
        />
        <span className="project-progress-pct">{project.progress}%</span>
        <span className="meta-sep">·</span>
        <span>
          {project.tasks.length === 1
            ? "1 tarea"
            : `${project.tasks.length} tareas`}
        </span>
        {project.teamName && (
          <>
            <span className="meta-sep">·</span>
            <span>Equipo {project.teamName}</span>
          </>
        )}
        {project.leadName && (
          <>
            <span className="meta-sep">·</span>
            <span>Responsable {project.leadName}</span>
          </>
        )}
      </div>
    </header>
  );
}

function ProgressBar({
  progress,
  color,
  width,
}: {
  progress: number;
  color: string;
  width: number | string;
}) {
  return (
    <div className="project-progress-bar" style={{ width }}>
      <div
        className="project-progress-fill"
        style={{ width: `${progress}%`, background: color }}
      />
    </div>
  );
}

/* -------- meta panel: description, dates, lead, tags -------- */

function ProjectMetaPanel({ project }: { project: ProjectDetail }) {
  const updateProject = useMutation(api.projects.updateProject);
  const shareProject = useMutation(api.projects.shareProject);
  const unshareProject = useMutation(api.projects.unshareProject);
  const [description, setDescription] = useState(project.description);
  const [tagInput, setTagInput] = useState("");
  const [shareInput, setShareInput] = useState("");
  const [shareError, setShareError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    setShareError(null);
    try {
      await shareProject({ projectId: project._id, username: shareInput.trim() });
      setShareInput("");
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Error");
    }
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (project.tags.includes(t)) {
      setTagInput("");
      return;
    }
    void updateProject({
      projectId: project._id,
      tags: [...project.tags, t],
    });
    setTagInput("");
  }
  function removeTag(t: string) {
    void updateProject({
      projectId: project._id,
      tags: project.tags.filter((x) => x !== t),
    });
  }

  return (
    <section className="project-panel">
      <div className="project-panel-grid">
        <div className="detail-field">
          <label>Descripción / objetivo</label>
          <textarea
            value={description}
            rows={3}
            placeholder="¿Qué hay que conseguir con este proyecto?"
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (description !== project.description)
                void updateProject({
                  projectId: project._id,
                  description: description || null,
                });
            }}
          />
        </div>
        <div className="project-fields-side">
          <div className="detail-field">
            <label>Fecha de inicio</label>
            <input
              type="date"
              value={project.startDate ?? ""}
              onChange={(e) =>
                void updateProject({
                  projectId: project._id,
                  startDate: e.target.value || null,
                })
              }
            />
          </div>
          <div className="detail-field">
            <label>Fecha de entrega</label>
            <input
              type="date"
              value={project.endDate ?? ""}
              onChange={(e) =>
                void updateProject({
                  projectId: project._id,
                  endDate: e.target.value || null,
                })
              }
            />
          </div>
          <div className="detail-field">
            <label>Fecha de revisión</label>
            <input
              type="date"
              value={project.reviewDate ?? ""}
              onChange={(e) =>
                void updateProject({
                  projectId: project._id,
                  reviewDate: e.target.value || null,
                })
              }
            />
            <small className="field-hint">
              Aparecerá en Planeado y Mi día cuando llegue la fecha.
            </small>
          </div>
          {project.teamId && (
            <div className="detail-field">
              <label>Responsable</label>
              <select
                value={project.leadId ?? ""}
                onChange={(e) =>
                  void updateProject({
                    projectId: project._id,
                    leadId: e.target.value
                      ? (e.target.value as Id<"users">)
                      : null,
                  })
                }
              >
                <option value="">Sin asignar</option>
                {project.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.username}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="detail-field">
            <label>Etiquetas</label>
            <div className="project-tags">
              {project.tags.map((t) => (
                <span key={t} className="project-tag">
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    aria-label="Quitar"
                  >
                    <CloseIcon size={11} />
                  </button>
                </span>
              ))}
            </div>
            <div className="tag-input-row">
              <input
                type="text"
                value={tagInput}
                placeholder="Nueva etiqueta"
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <button
                className="btn-ghost btn-sm"
                type="button"
                onClick={addTag}
              >
                Añadir
              </button>
            </div>
          </div>

          {/* Sharing — only visible to project owner */}
          {project.isOwner && (
            <div className="detail-field project-share-field">
              <label
                className="project-share-toggle"
                onClick={() => setShowShare((v) => !v)}
              >
                <UsersIcon size={14} />
                Compartir proyecto
                <span className="share-count">
                  {project.sharedMembers.length > 0
                    ? `${project.sharedMembers.length} persona${project.sharedMembers.length > 1 ? "s" : ""}`
                    : "Solo tú"}
                </span>
              </label>
              {showShare && (
                <div className="project-share-panel">
                  {project.sharedMembers.map((m) => (
                    <div key={m.userId} className="share-member-row">
                      <div className="avatar avatar-sm">
                        {m.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="share-member-name">{m.username}</span>
                      <button
                        className="icon-btn"
                        title="Revocar acceso"
                        onClick={() =>
                          void unshareProject({
                            projectId: project._id,
                            memberId: m.userId,
                          })
                        }
                      >
                        <CloseIcon size={13} />
                      </button>
                    </div>
                  ))}
                  <form className="share-invite-form" onSubmit={handleShare}>
                    <input
                      type="text"
                      value={shareInput}
                      placeholder="Nombre de usuario"
                      onChange={(e) => setShareInput(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="btn-primary btn-sm"
                      disabled={!shareInput.trim()}
                    >
                      Invitar
                    </button>
                  </form>
                  {shareError && (
                    <p className="composer-error">{shareError}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* -------- kanban -------- */

function KanbanBoard({
  project,
  today,
  search,
  showDone,
  onSelectTask,
  selectedTaskId,
}: {
  project: ProjectDetail;
  today: string;
  search: string;
  showDone: boolean;
  onSelectTask: (id: Id<"tasks">) => void;
  selectedTaskId: Id<"tasks"> | null;
}) {
  const moveTask = useMutation(api.tasks.moveTaskInKanban);
  const createTask = useMutation(api.tasks.createTask);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [composer, setComposer] = useState<KanbanStatus | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("media");
  const [newAssignee, setNewAssignee] = useState("");

  const q = search.trim().toLowerCase();
  const byCol: Record<KanbanStatus, ProjectTask[]> = {
    todo: [],
    in_progress: [],
    done: [],
  };
  for (const t of project.tasks) {
    if (!showDone && t.completed) continue;
    if (q && !t.title.toLowerCase().includes(q)) continue;
    const col = (t.kanbanStatus as KanbanStatus) ?? "todo";
    byCol[col].push(t);
  }
  for (const k of Object.keys(byCol) as KanbanStatus[]) {
    byCol[k].sort(
      (a, b) =>
        (a.kanbanOrder ?? 0) - (b.kanbanOrder ?? 0) ||
        a._creationTime - b._creationTime,
    );
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!composer || !newTitle.trim()) return;
    const newId = await createTask({
      title: newTitle.trim(),
      priority: newPriority,
      dueDate: newDate || undefined,
      parentTaskId: project._id,
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
            "kanban-col" + (draggingId ? " kanban-col-droppable" : "")
          }
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            if (id) {
              void moveTask({
                taskId: id as Id<"tasks">,
                status: col.key,
              });
            }
            setDraggingId(null);
          }}
        >
          <div className="kanban-col-head">
            <span>{col.label}</span>
            <span className="group-count">{byCol[col.key].length}</span>
          </div>
          <div className="kanban-col-body">
            {byCol[col.key].map((t) => (
              <KanbanCard
                key={t._id}
                task={t}
                today={today}
                onDragStart={() => setDraggingId(t._id)}
                onDragEnd={() => setDraggingId(null)}
                projectId={project._id}
                members={project.members}
                selected={selectedTaskId === t._id}
                onSelect={() => onSelectTask(t._id as Id<"tasks">)}
                onMove={(s) =>
                  void moveTask({
                    taskId: t._id as Id<"tasks">,
                    status: s,
                  })
                }
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
                  <select
                    value={newPriority}
                    onChange={(e) =>
                      setNewPriority(e.target.value as Priority)
                    }
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_META[p].label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
                {project.teamId && (
                  <select
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                  >
                    <option value="">Sin asignar</option>
                    {project.members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.username}
                      </option>
                    ))}
                  </select>
                )}
                <div className="kanban-new-actions">
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => setComposer(null)}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary btn-sm">
                    Crear
                  </button>
                </div>
              </form>
            ) : (
              <button
                className="kanban-add"
                onClick={() => setComposer(col.key)}
              >
                <PlusIcon size={14} /> Añadir tarea
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function KanbanCard({
  task,
  today,
  onDragStart,
  onDragEnd,
  onMove,
  projectId,
  members,
  onSelect,
  selected,
}: {
  task: ProjectTask;
  today: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (s: KanbanStatus) => void;
  projectId: Id<"tasks">;
  members: { userId: Id<"users">; username: string }[];
  onSelect: () => void;
  selected: boolean;
}) {
  const toggle = useMutation(api.tasks.toggleComplete);
  const updateTask = useMutation(api.tasks.updateTask);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const [open, setOpen] = useState(false);
  const meta = PRIORITY_META[task.priority as Priority];
  const due = task.dueDate ? formatDue(task.dueDate, today) : null;
  const subsDone = task.subtasks.filter((s) => s.completed).length;
  void projectId;

  return (
    <div
      className={"kanban-card" + (task.completed ? " done" : "") + (selected ? " kanban-card-selected" : "")}
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
        <div
          className="kanban-card-title"
          onClick={onSelect}
        >
          {task.title}
        </div>
        <button
          className="icon-btn kanban-expand-btn"
          title="Expandir"
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        >
          {open ? "▲" : "▼"}
        </button>
      </div>
      <div className="kanban-card-meta">
        <span className="chip" style={{ color: meta.color }}>
          <span className="dot" style={{ background: meta.color }} />
          {meta.short}
        </span>
        {due && (
          <span className={"chip" + (due.overdue ? " overdue" : "")}>
            {due.label}
          </span>
        )}
        {task.assigneeName && (
          <span className="chip">{task.assigneeName}</span>
        )}
        {task.subtasks.length > 0 && (
          <span className="chip">
            {subsDone}/{task.subtasks.length}
          </span>
        )}
      </div>

      {open && (
        <div className="kanban-card-expand">
          {task.subtasks.length > 0 && (
            <div className="kanban-subs">
              {task.subtasks.map((s) => (
                <label key={s._id} className="kanban-sub">
                  <input
                    type="checkbox"
                    checked={s.completed}
                    onChange={() =>
                      void toggle({
                        taskId: s._id as Id<"tasks">,
                        today,
                      })
                    }
                  />
                  <span className={s.completed ? "done" : ""}>{s.title}</span>
                  {s.dueDate && (
                    <span className="kanban-sub-date">
                      {shortDate(s.dueDate)}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
          <div className="kanban-card-actions">
            {KANBAN_COLUMNS.filter((c) => c.key !== task.kanbanStatus).map(
              (c) => (
                <button
                  key={c.key}
                  className="btn-ghost btn-sm"
                  onClick={() => onMove(c.key)}
                >
                  → {c.label}
                </button>
              ),
            )}
            {members.length > 0 && (
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
            )}
            <button
              className="btn-danger btn-sm"
              onClick={() => {
                if (confirm("¿Eliminar esta tarea del proyecto?"))
                  void deleteTask({ taskId: task._id });
              }}
            >
              <TrashIcon size={12} />
            </button>
          </div>
          <KanbanCardSubAdd taskId={task._id} />
        </div>
      )}
    </div>
  );
}

function KanbanCardSubAdd({ taskId }: { taskId: Id<"tasks"> }) {
  const createSubtask = useMutation(api.tasks.createSubtask);
  const [v, setV] = useState("");
  return (
    <form
      className="kanban-subadd"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        void createSubtask({ parentId: taskId, title: v.trim() });
        setV("");
      }}
    >
      <input
        type="text"
        value={v}
        placeholder="+ subtarea"
        onChange={(e) => setV(e.target.value)}
      />
    </form>
  );
}

/* -------- list view (alternative to kanban) -------- */

function TaskListPanel({
  project,
  today,
  search,
  showDone,
  onSelectTask,
  selectedTaskId,
}: {
  project: ProjectDetail;
  today: string;
  search: string;
  showDone: boolean;
  onSelectTask: (id: Id<"tasks">) => void;
  selectedTaskId: Id<"tasks"> | null;
}) {
  const toggle = useMutation(api.tasks.toggleComplete);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const q = search.trim().toLowerCase();
  const filtered = project.tasks.filter((t) => {
    if (!showDone && t.completed) return false;
    if (q && !t.title.toLowerCase().includes(q)) return false;
    return true;
  });
  return (
    <section className="task-group project-list">
      <div className="group-label">
        Todas las tareas
        <span className="group-count">{filtered.length}</span>
      </div>
      {filtered.length === 0 && (
        <p className="screen-empty">
          {q
            ? "Ninguna tarea coincide con tu búsqueda."
            : "Añade tareas al proyecto desde el tablero."}
        </p>
      )}
      {filtered.map((t) => {
        const meta = PRIORITY_META[t.priority as Priority];
        const due = t.dueDate ? formatDue(t.dueDate, today) : null;
        const isSelected = selectedTaskId === t._id;
        return (
          <div
            key={t._id}
            className={"task-row" + (t.completed ? " done" : "") + (isSelected ? " task-row-selected" : "")}
            onClick={() => onSelectTask(t._id as Id<"tasks">)}
            style={{ cursor: "pointer" }}
          >
            <button
              className={"check" + (t.completed ? " checked" : "")}
              onClick={(e) => { e.stopPropagation(); void toggle({ taskId: t._id, today }); }}
            >
              {t.completed && <CheckIcon size={13} />}
            </button>
            <div className="task-main">
              <div className="task-title">{t.title}</div>
              <div className="task-meta">
                <span className="chip" style={{ color: meta.color }}>
                  <span className="dot" style={{ background: meta.color }} />
                  {meta.short}
                </span>
                {due && (
                  <span
                    className={"chip" + (due.overdue ? " overdue" : "")}
                  >
                    {due.label}
                  </span>
                )}
                {t.assigneeName && (
                  <span className="chip">{t.assigneeName}</span>
                )}
                {t.subtasks.length > 0 && (
                  <span className="chip">
                    {t.subtasks.filter((s) => s.completed).length}/
                    {t.subtasks.length} subtareas
                  </span>
                )}
              </div>
            </div>
            <button
              className="icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("¿Eliminar esta tarea?"))
                  void deleteTask({ taskId: t._id });
              }}
            >
              <TrashIcon size={15} />
            </button>
          </div>
        );
      })}
    </section>
  );
}

/* -------- milestones -------- */

function MilestonesPanel({ project }: { project: ProjectDetail }) {
  const addMilestone = useMutation(api.projects.addMilestone);
  const updateMilestone = useMutation(api.projects.updateMilestone);
  const deleteMilestone = useMutation(api.projects.deleteMilestone);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");

  return (
    <section className="project-panel">
      <div className="panel-title">
        <FlagIcon size={16} /> Hitos
      </div>
      <div className="milestones">
        {project.milestones.length === 0 && (
          <p className="field-hint">
            Añade los hitos clave del proyecto (entrega de prototipo, demo,
            revisión, etc.).
          </p>
        )}
        {project.milestones.map((m) => (
          <div
            key={m._id}
            className={"milestone-row" + (m.completed ? " done" : "")}
          >
            <button
              className={"check" + (m.completed ? " checked" : "")}
              onClick={() =>
                void updateMilestone({
                  milestoneId: m._id,
                  completed: !m.completed,
                })
              }
            >
              {m.completed && <CheckIcon size={11} />}
            </button>
            <span className="milestone-name">{m.name}</span>
            <input
              type="date"
              value={m.date ?? ""}
              onChange={(e) =>
                void updateMilestone({
                  milestoneId: m._id,
                  date: e.target.value || null,
                })
              }
            />
            <button
              className="icon-btn"
              onClick={() => void deleteMilestone({ milestoneId: m._id })}
            >
              <TrashIcon size={13} />
            </button>
          </div>
        ))}
      </div>
      <form
        className="milestone-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void addMilestone({
            projectId: project._id,
            name: name.trim(),
            date: date || undefined,
          });
          setName("");
          setDate("");
        }}
      >
        <input
          type="text"
          value={name}
          placeholder="Nuevo hito"
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button type="submit" className="btn-ghost btn-sm">
          <PlusIcon size={13} /> Añadir
        </button>
      </form>
    </section>
  );
}

/* -------- links -------- */

function LinksPanel({ project }: { project: ProjectDetail }) {
  const addLink = useMutation(api.projects.addLink);
  const deleteLink = useMutation(api.projects.deleteLink);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  return (
    <section className="project-panel">
      <div className="panel-title">
        <LinkIcon size={16} /> Enlaces y recursos
      </div>
      <div className="links-list">
        {project.links.length === 0 && (
          <p className="field-hint">
            Añade enlaces a documentos, repositorios, diseños…
          </p>
        )}
        {project.links.map((l) => (
          <div key={l._id} className="link-row">
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="link-label"
            >
              <LinkIcon size={13} /> {l.label}
            </a>
            <button
              className="icon-btn"
              onClick={() => void deleteLink({ linkId: l._id })}
            >
              <TrashIcon size={13} />
            </button>
          </div>
        ))}
      </div>
      <form
        className="link-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!url.trim()) return;
          void addLink({
            projectId: project._id,
            label: label.trim(),
            url: url.trim(),
          });
          setLabel("");
          setUrl("");
        }}
      >
        <input
          type="text"
          value={label}
          placeholder="Etiqueta (opcional)"
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          type="url"
          value={url}
          placeholder="https://…"
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" className="btn-ghost btn-sm">
          <PlusIcon size={13} /> Añadir
        </button>
      </form>
    </section>
  );
}
