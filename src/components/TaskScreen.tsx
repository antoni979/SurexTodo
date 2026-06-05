import { useState, type ReactNode, isValidElement } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { EnrichedTask } from "../util";
import TaskRow from "./TaskRow";
import TaskDetail from "./TaskDetail";
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
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showDone, setShowDone] = useState(() => localStorage.getItem("showDone") !== "false");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const q = search.trim().toLowerCase();

  // Collect all unique tags across all groups
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
  const selectedTask =
    allTasks.find((t) => t._id === selectedId) ?? null;
  const total = allTasks.length;

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
                      <span className="group-count">
                        {group.tasks.length}
                      </span>
                    </div>
                  )}
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task._id}
                      task={task}
                      today={today}
                      selected={task._id === selectedId}
                      showTeam={showTeamChip}
                      onSelect={() => {
                        if (task.isProject && onOpenProject) {
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
      </div>

      {selectedTask && (
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
