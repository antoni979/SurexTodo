import { useState, type ReactNode } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { EnrichedTask } from "../util";
import TaskRow from "./TaskRow";
import TaskDetail from "./TaskDetail";

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
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allTasks = groups.flatMap((g) => g.tasks);
  const selectedTask =
    allTasks.find((t) => t._id === selectedId) ?? null;
  const total = allTasks.length;

  return (
    <>
      <div className="screen">
        <header className="screen-head" style={{ color: accent }}>
          <h1>{title}</h1>
          {subtitle && <p className="screen-sub">{subtitle}</p>}
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
            groups.map((group, i) =>
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
        />
      )}
    </>
  );
}
