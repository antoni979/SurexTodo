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

  const list = tasks ?? [];
  const sorter = byDueThenPriority(today);

  const overdue: EnrichedTask[] = [];
  const todayTasks: EnrichedTask[] = [];
  const tomorrow: EnrichedTask[] = [];
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
    else if (diff === 1) tomorrow.push(t);
    else upcoming.push(t);
  }
  [overdue, todayTasks, tomorrow, upcoming, done].forEach((g) =>
    g.sort(sorter),
  );

  const groups: TaskGroup[] = [
    { label: "Vencidas", tasks: overdue },
    { label: "Hoy", tasks: todayTasks },
    { label: "Mañana", tasks: tomorrow },
    { label: "Próximamente", tasks: upcoming },
    { label: "Completadas", tasks: done },
  ];

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
      emptyText="No tienes tareas con fecha de vencimiento. Las tareas de equipo asignadas a ti también aparecerán aquí."
      composer={
        <Composer
          placeholder="Añadir una tarea con vencimiento"
          defaultDueDate={today}
          onCreate={(d) =>
            createTask({
              title: d.title,
              priority: d.priority,
              dueDate: d.dueDate,
              recurrence: d.recurrence,
              ...(workspaceId ? { workspaceId } : {}),
            }).then(() => undefined)
          }
        />
      }
    />
  );
}
