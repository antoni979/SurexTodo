import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { sortTasks } from "../../util";
import Composer from "../Composer";
import TaskScreen, { type TaskGroup } from "../TaskScreen";

export default function TasksView({
  today,
  onOpenProject,
  workspaceId,
}: {
  today: string;
  onOpenProject?: (projectId: Id<"tasks">) => void;
  workspaceId?: Id<"workspaces"> | null;
}) {
  const tasks = useQuery(api.tasks.listPersonal, {
    today,
    ...(workspaceId ? { workspaceId } : {}),
  });
  const createTask = useMutation(api.tasks.createTask);

  const list = tasks ?? [];
  const pending = sortTasks(list.filter((t) => !t.completed));
  const done = sortTasks(list.filter((t) => t.completed));

  const groups: TaskGroup[] = [
    { tasks: pending },
    { label: "Completadas", tasks: done },
  ];

  return (
    <TaskScreen
      title="Tareas"
      subtitle={
        pending.length === 1
          ? "1 tarea pendiente"
          : `${pending.length} tareas pendientes`
      }
      accent="#3a6ea5"
      groups={groups}
      today={today}
      onOpenProject={onOpenProject}
      showTeamChip={false}
      loading={tasks === undefined}
      emptyText="No tienes tareas personales todavía. Añade la primera abajo."
      composer={
        <Composer
          placeholder="Añadir una tarea"
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
