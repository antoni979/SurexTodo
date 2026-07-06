import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type EnrichedTask,
  type Priority,
  PRIORITY_META,
  dayDiff,
} from "../../util";
import Composer from "../Composer";
import TaskScreen, { type TaskGroup } from "../TaskScreen";

function byDueThenPriority(today: string) {
  return (a: EnrichedTask, b: EnrichedTask) => {
    const d = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    if (d !== 0) return d;
    return (
      PRIORITY_META[b.priority as Priority].rank -
      PRIORITY_META[a.priority as Priority].rank
    );
  };
}

export default function PlannedView({
  today,
  onOpenProject,
  workspaceId,
}: {
  today: string;
  onOpenProject?: (projectId: Id<"tasks">) => void;
  workspaceId?: Id<"workspaces"> | null;
}) {
  const tasks = useQuery(api.tasks.listPlanned, {
    today,
    ...(workspaceId ? { workspaceId } : {}),
  });
  const createTask = useMutation(api.tasks.createTask);
  const lists = useQuery(api.lists.listMyLists, workspaceId ? { workspaceId } : {}) ?? [];
  const allTags =
    useQuery(api.tasks.listAllTags, workspaceId ? { workspaceId } : {}) ?? [];

  const [filterListId, setFilterListId] = useState<string>("");
  const [filterTag, setFilterTag] = useState<string>("");

  const rawList = tasks ?? [];

  const list = rawList.filter((t) => {
    if (filterListId && (t.listId ?? "") !== filterListId) return false;
    if (filterTag && !(t.tags ?? []).includes(filterTag)) return false;
    return true;
  });

  const sorter = byDueThenPriority(today);

  const overdue: EnrichedTask[] = [];
  const todayTasks: EnrichedTask[] = [];
  const tomorrowTasks: EnrichedTask[] = [];
  const upcoming: EnrichedTask[] = [];
  const done: EnrichedTask[] = [];

  for (const t of list) {
    if (t.completed) {
      done.push(t);
      continue;
    }
    const diff = t.dueDate ? dayDiff(t.dueDate, today) : 99;
    if (diff < 0) overdue.push(t);
    else if (diff === 0) todayTasks.push(t);
    else if (diff === 1) tomorrowTasks.push(t);
    else upcoming.push(t);
  }
  [overdue, todayTasks, tomorrowTasks, upcoming, done].forEach((g) =>
    g.sort(sorter),
  );

  const groups: TaskGroup[] = [
    { label: "Vencidas", tasks: overdue },
    { label: "Hoy", tasks: todayTasks },
    { label: "Mañana", tasks: tomorrowTasks },
    { label: "Próximamente", tasks: upcoming },
    { label: "Completadas", tasks: done },
  ];

  const filterBar = (
    <div className="planned-filters">
      {lists.length > 0 && (
        <select
          value={filterListId}
          onChange={(e) => setFilterListId(e.target.value)}
          className="filter-select"
          title="Filtrar por lista"
        >
          <option value="">Todas las listas</option>
          {lists.map((l) => (
            <option key={l._id} value={l._id}>{l.name}</option>
          ))}
        </select>
      )}
      {allTags.length > 0 && (
        <select
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
          className="filter-select"
          title="Filtrar por etiqueta"
        >
          <option value="">Todas las etiquetas</option>
          {allTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      )}
      {(filterListId || filterTag) && (
        <button
          className="filter-clear-btn"
          onClick={() => { setFilterListId(""); setFilterTag(""); }}
        >
          ✕ Limpiar
        </button>
      )}
    </div>
  );

  return (
    <TaskScreen
      title="Planeado"
      subtitle="Tareas con fecha de vencimiento"
      accent="#b0489e"
      groups={groups}
      today={today}
      onOpenProject={onOpenProject}
      showTeamChip={true}
      loading={tasks === undefined}
      workspaceId={workspaceId}
      emptyText="No tienes tareas con fecha de vencimiento. Las tareas de equipo asignadas a ti también aparecerán aquí."
      headerExtra={filterBar}
      composer={
        <Composer
          workspaceId={workspaceId}
          placeholder="Añadir una tarea con vencimiento"
          defaultDueDate={today}
          onCreate={(d) =>
            createTask({
              title: d.title,
              priority: d.priority,
              dueDate: d.dueDate,
              recurrence: d.recurrence,
              tags: d.tags,
              ...(workspaceId ? { workspaceId } : {}),
            }).then(() => undefined)
          }
        />
      }
    />
  );
}
