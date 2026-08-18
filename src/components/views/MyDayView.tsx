import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { longToday } from "../../util";
import Composer from "../Composer";
import TaskScreen, { type TaskGroup } from "../TaskScreen";

export default function MyDayView({
  today,
  onOpenProject,
  workspaceId,
}: {
  today: string;
  onOpenProject?: (projectId: Id<"tasks">) => void;
  workspaceId?: Id<"workspaces"> | null;
}) {
  const tasks = useQuery(api.tasks.listMyDay, {
    today,
    ...(workspaceId ? { workspaceId } : {}),
  });
  const createTask = useMutation(api.tasks.createTask);
  const lists = useQuery(api.lists.listMyLists, workspaceId ? { workspaceId } : {}) ?? [];

  const list = tasks ?? [];
  const pending = list.filter((t) => !t.completed);
  const done = list.filter((t) => t.completed);

  const groups: TaskGroup[] = [
    { tasks: pending },
    { label: "Completadas", tasks: done },
  ];

  return (
    <TaskScreen
      title="Mi día"
      subtitle={longToday(today)}
      accent="#2564cf"
      groups={groups}
      today={today}
      onOpenProject={onOpenProject}
      showTeamChip={true}
      loading={tasks === undefined}
      workspaceId={workspaceId}
      emptyText="Aquí aparecerán las tareas que planees para hoy. Añade una abajo o pulsa el sol en cualquier tarea."
      composer={
        <Composer
          workspaceId={workspaceId}
          placeholder="Añadir una tarea a Mi día"
          lists={lists}
          onCreate={(d) =>
            createTask({
              title: d.title,
              priority: d.priority,
              dueDate: d.dueDate,
              recurrence: d.recurrence,
              tags: d.tags,
              listId: d.listId,
              addToMyDay: true,
              today,
              ...(workspaceId ? { workspaceId } : {}),
            }).then(() => undefined)
          }
        />
      }
    />
  );
}
