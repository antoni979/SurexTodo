import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { sortTasks } from "../../util";
import Composer from "../Composer";
import TaskScreen, { type TaskGroup } from "../TaskScreen";
import { LIST_COLORS, DEFAULT_COLOR } from "../../../convex/lists";

export default function ListView({
  listId,
  today,
  onOpenProject,
  workspaceId,
}: {
  listId: Id<"lists">;
  today: string;
  onOpenProject?: (projectId: Id<"tasks">) => void;
  workspaceId?: Id<"workspaces"> | null;
}) {
  const lists = useQuery(api.lists.listMyLists, workspaceId ? { workspaceId } : {}) ?? [];
  const list = lists.find((l) => l._id === listId);

  const tasks = useQuery(api.tasks.listByList, { listId, today });
  const createTask = useMutation(api.tasks.createTask);
  const renameList = useMutation(api.lists.renameList);
  const setListColor = useMutation(api.lists.setListColor);
  const deleteList = useMutation(api.lists.deleteList);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [showColorPicker, setShowColorPicker] = useState(false);

  const color = list?.color ?? DEFAULT_COLOR;
  const taskList = tasks ?? [];
  const pending = sortTasks(taskList.filter((t) => !t.completed));
  const done = sortTasks(taskList.filter((t) => t.completed));

  const groups: TaskGroup[] = [
    { tasks: pending },
    { label: "Completadas", tasks: done },
  ];

  const subtitle = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {editingName ? (
        <input
          className="list-name-input"
          autoFocus
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onBlur={() => {
            const t = nameInput.trim();
            if (t && t !== list?.name) void renameList({ listId, name: t });
            setEditingName(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") { setEditingName(false); }
          }}
        />
      ) : (
        <button
          className="list-name-btn"
          onClick={() => { setNameInput(list?.name ?? ""); setEditingName(true); }}
          title="Renombrar lista"
        >
          ✎ Renombrar
        </button>
      )}
      <span style={{ position: "relative" }}>
        <button
          className="list-color-btn"
          style={{ background: color }}
          onClick={() => setShowColorPicker((v) => !v)}
          title="Cambiar color"
        />
        {showColorPicker && (
          <div className="list-color-picker">
            {LIST_COLORS.map((c) => (
              <button
                key={c}
                className={"list-color-dot" + (c === color ? " active" : "")}
                style={{ background: c }}
                onClick={() => { void setListColor({ listId, color: c }); setShowColorPicker(false); }}
              />
            ))}
          </div>
        )}
      </span>
      <button
        className="list-delete-btn"
        onClick={() => {
          if (confirm(`¿Eliminar la lista "${list?.name}"? Las tareas no se borran.`))
            void deleteList({ listId });
        }}
        title="Eliminar lista"
      >
        🗑
      </button>
    </span>
  );

  return (
    <TaskScreen
      title={list?.name ?? "Lista"}
      accent={color}
      subtitle={subtitle}
      groups={groups}
      today={today}
      onOpenProject={onOpenProject}
      showTeamChip={false}
      loading={tasks === undefined}
      emptyText="Esta lista está vacía. Añade la primera tarea abajo."
      composer={
        <Composer
          placeholder={`Añadir a "${list?.name ?? "lista"}"`}
          onCreate={(d) =>
            createTask({
              title: d.title,
              priority: d.priority,
              dueDate: d.dueDate,
              recurrence: d.recurrence,
              tags: d.tags,
              listId,
              ...(workspaceId ? { workspaceId } : {}),
            }).then(() => undefined)
          }
        />
      }
    />
  );
}
