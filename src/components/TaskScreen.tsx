import { useState, type ReactNode } from "react";
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
  subtitle?: string;
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

  const q = search.trim().toLowerCase();
  const filteredGroups = q
    ? groups.map((g) => ({
        ...g,
        tasks: g.tasks.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            (t.note ?? "").toLowerCase().includes(q),
        ),
      }))
    : groups;

  const allTasks = filteredGroups.flatMap((g) => g.tasks);
  const selectedTask =
    allTasks.find((t) => t._id === selectedId) ?? null;
  const total = allTasks.length;

  return (
    <>
      <div className="screen">
        <header className="screen-head" style={{ color: accent }}>
          <h1>{title}</h1>
          {subtitle && <p className="screen-sub">{subtitle}</p>}
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
          </div>
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
                      onSelect={() => setSelectedId(task._id)}
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
