import { useState, type ReactNode, isValidElement } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { EnrichedTask } from "../util";
import TaskRow from "./TaskRow";
import TaskDetail from "./TaskDetail";
import BulkActionBar from "./BulkActionBar";
import { SearchIcon } from "./icons";

type Member = { userId: Id<"users">; username: string };

export type TaskGroup = { label?: string; tasks: EnrichedTask[] };

export default function TaskScreen({
  title,
  accent,
  subtitle,
  groups,
  composer,
  beforeList,
  today,
  members,
  showTeamChip,
  loading,
  emptyText,
  onOpenProject,
  workspaceId,
}: {
  title: string;
  accent: string;
  subtitle?: ReactNode;
  groups: TaskGroup[];
  composer?: ReactNode;
  beforeList?: ReactNode;
  today: string;
  members?: Member[];
  showTeamChip: boolean;
  loading: boolean;
  emptyText: string;
  onOpenProject?: (projectId: Id<"tasks">) => void;
  workspaceId?: Id<"workspaces"> | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showDone, setShowDone] = useState(() => localStorage.getItem("showDone") !== "false");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const q = search.trim().toLowerCase();

  const allTags = Array.from(
    new Set(groups.flatMap((g) => g.tasks).flatMap((t) => t.tags ?? []))
  ).sort();

  const filteredGroups = groups.map((g) => ({
    ...g,
    tasks: g.tasks.filter((t) => {
      if (!showDone && t.completed) return false;
      if (activeTag && !(t.tags ?? []).includes(activeTag)) return false;
      if (q) return t.title.toLowerCase().includes(q) || (t.note ?? "").toLowerCase().includes(q);
      return true;
    }),
  }));

  const doneCount = groups.flatMap((g) => g.tasks).filter((t) => t.completed).length;
  const allTasks = filteredGroups.flatMap((g) => g.tasks);
  const selectedTask = allTasks.find((t) => t._id === selectedId) ?? null;
  const total = allTasks.length;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === allTasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allTasks.map((t) => t._id)));
    }
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  // Print: opens a print-friendly window with current filtered tasks
  function handlePrint() {
    const tagLabel = activeTag ? `Etiqueta: ${activeTag}` : title;
    const rows = allTasks.map((t) =>
      `<tr class="${t.completed ? "done" : ""}">
        <td>${t.completed ? "✓" : "○"}</td>
        <td>${t.title}</td>
        <td>${t.priority}</td>
        <td>${t.dueDate ?? ""}</td>
        <td>${(t.tags ?? []).join(", ")}</td>
       </tr>`
    ).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>${tagLabel}</title>
      <style>
        body{font-family:sans-serif;font-size:13px;padding:24px}
        h1{font-size:20px;margin-bottom:4px}
        p{color:#666;margin:0 0 16px}
        table{border-collapse:collapse;width:100%}
        th{text-align:left;border-bottom:2px solid #333;padding:6px 8px;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
        td{padding:6px 8px;border-bottom:1px solid #e5e7eb}
        tr.done td{color:#9ca3af;text-decoration:line-through}
        @media print{body{padding:0}}
      </style></head><body>
      <h1>${tagLabel}</h1>
      <p>${new Date().toLocaleDateString("es-ES",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
      <table>
        <thead><tr><th></th><th>Tarea</th><th>Prioridad</th><th>Vencimiento</th><th>Etiquetas</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></body></html>`;

    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  }

  return (
    <>
      <div className="screen">
        <header className="screen-head" style={{ color: accent }}>
          <h1>{title}</h1>
          {subtitle && (
            isValidElement(subtitle)
              ? <div className="screen-sub screen-sub-controls">{subtitle}</div>
              : <p className="screen-sub">{subtitle}</p>
          )}
          <div className="screen-toolbar">
            <div className="search-input">
              <SearchIcon size={15} />
              <input
                type="search"
                value={search}
                placeholder="Buscar en estas tareas…"
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              className={"toggle-done-btn" + (showDone ? " active" : "")}
              onClick={() => {
                const next = !showDone;
                setShowDone(next);
                localStorage.setItem("showDone", String(next));
              }}
              title={showDone ? "Ocultar completadas" : "Mostrar completadas"}
            >
              {showDone
                ? `Ocultar completadas${doneCount > 0 ? ` (${doneCount})` : ""}`
                : `Mostrar completadas${doneCount > 0 ? ` (${doneCount})` : ""}`}
            </button>
            <button
              className={"toggle-done-btn" + (selectMode ? " active" : "")}
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              title={selectMode ? "Cancelar selección" : "Seleccionar varias tareas"}
            >
              {selectMode ? "✕ Selección" : "☑ Seleccionar"}
            </button>
            <button
              className="toggle-done-btn"
              onClick={handlePrint}
              title="Imprimir lista actual"
            >
              🖨 Imprimir
            </button>
          </div>
          {allTags.length > 0 && (
            <div className="tag-filter">
              <button
                className={"filter-chip" + (activeTag === null ? " active" : "")}
                onClick={() => setActiveTag(null)}
              >Todas</button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  className={"filter-chip" + (activeTag === tag ? " active" : "")}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
          {/* Select-all row */}
          {selectMode && allTasks.length > 0 && (
            <div className="select-all-row">
              <label>
                <input
                  type="checkbox"
                  checked={selectedIds.size === allTasks.length && allTasks.length > 0}
                  onChange={toggleSelectAll}
                />
                {selectedIds.size > 0
                  ? `${selectedIds.size} de ${allTasks.length} seleccionadas`
                  : `Seleccionar todas (${allTasks.length})`}
              </label>
            </div>
          )}
        </header>

        <div className="screen-scroll">
          {beforeList}
          {composer}

          {loading && <p className="screen-empty">Cargando…</p>}

          {!loading && total === 0 && (
            <div className="screen-empty">
              <p>{emptyText}</p>
            </div>
          )}

          {!loading &&
            filteredGroups.map((group, i) =>
              group.tasks.length === 0 ? null : (
                <section key={group.label ?? i} className="task-group">
                  {group.label && (
                    <div className="group-label">
                      {group.label}
                      <span className="group-count">{group.tasks.length}</span>
                    </div>
                  )}
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task._id}
                      task={task}
                      today={today}
                      selected={!selectMode && task._id === selectedId}
                      showTeam={showTeamChip}
                      selectMode={selectMode}
                      isSelected={selectedIds.has(task._id)}
                      onToggleSelect={() => toggleSelect(task._id)}
                      onSelect={() => {
                        if (selectMode) {
                          toggleSelect(task._id);
                        } else if (task.isProject && onOpenProject) {
                          onOpenProject(task._id);
                        } else {
                          setSelectedId(task._id);
                        }
                      }}
                    />
                  ))}
                </section>
              ),
            )}
        </div>

        {/* Bulk action bar */}
        {selectMode && selectedIds.size > 0 && (
          <BulkActionBar
            selectedIds={selectedIds}
            onClear={exitSelectMode}
            workspaceId={workspaceId}
          />
        )}
      </div>

      {!selectMode && selectedTask && (
        <TaskDetail
          key={selectedTask._id}
          task={selectedTask}
          today={today}
          members={members}
          onClose={() => setSelectedId(null)}
          onOpenProject={onOpenProject}
        />
      )}
    </>
  );
}
