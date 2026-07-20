import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { sortTasks } from "../../util";
import Composer from "../Composer";
import TaskScreen, { type TaskGroup } from "../TaskScreen";
import TaskDetail from "../TaskDetail";
import TeamKanbanBoard from "../TeamKanbanBoard";
import UserPicker from "../UserPicker";
import { PlusIcon, KanbanIcon, ListIcon } from "../icons";

function TeamBar({
  teamId,
  members,
  myUserId,
  isOwner,
}: {
  teamId: Id<"teams">;
  members: { userId: Id<"users">; username: string }[];
  myUserId: Id<"users">;
  isOwner: boolean;
}) {
  const addMember = useMutation(api.teams.addMember);
  const addable = useQuery(api.teams.listAddableUsers, { teamId }) ?? [];
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(userId: Id<"users">) {
    setError(null);
    try {
      await addMember({ teamId, userId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo añadir");
    }
  }

  return (
    <div className="team-bar">
      <div className="member-chips">
        {members.map((m) => (
          <span key={m.userId} className="member-chip">
            <span className="avatar sm">
              {m.username.charAt(0).toUpperCase()}
            </span>
            {m.username}
            {m.userId === myUserId && <em>&nbsp;(tú)</em>}
          </span>
        ))}
        {isOwner && (
          <button className="member-add" onClick={() => setOpen(!open)}>
            <PlusIcon size={14} />
            Añadir miembro
          </button>
        )}
      </div>
      {open && (
        <div className="member-form">
          <UserPicker users={addable} onPick={pick} />
          {addable.length === 0 && (
            <span className="field-hint">
              No hay más usuarios disponibles para añadir.
            </span>
          )}
          {error && <span className="composer-error">{error}</span>}
        </div>
      )}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "kanban" | "list";
  onChange: (v: "kanban" | "list") => void;
}) {
  return (
    <div className="view-toggle">
      <button
        type="button"
        className={"toggle-done-btn" + (view === "kanban" ? " active" : "")}
        onClick={() => onChange("kanban")}
      >
        <KanbanIcon size={14} /> Tablero
      </button>
      <button
        type="button"
        className={"toggle-done-btn" + (view === "list" ? " active" : "")}
        onClick={() => onChange("list")}
      >
        <ListIcon size={14} /> Lista
      </button>
    </div>
  );
}

export default function TeamView({
  teamId,
  today,
  myUserId,
  onOpenProject,
}: {
  teamId: Id<"teams">;
  today: string;
  myUserId: Id<"users">;
  onOpenProject?: (projectId: Id<"tasks">) => void;
}) {
  const team = useQuery(api.teams.getTeam, { teamId });
  const tasks = useQuery(api.tasks.listTeamTasks, { teamId, today });
  const createTask = useMutation(api.tasks.createTask);
  const [filter, setFilter] = useState<"all" | "mine" | "unassigned" | string>(
    "all",
  );
  const [view, setView] = useState<"kanban" | "list">(
    () => (localStorage.getItem("teamViewMode") as "kanban" | "list") || "kanban",
  );
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(null);

  function changeView(v: "kanban" | "list") {
    setView(v);
    localStorage.setItem("teamViewMode", v);
  }

  if (team === undefined) {
    return (
      <div className="screen">
        <div className="screen-scroll">
          <p className="screen-empty">Cargando…</p>
        </div>
      </div>
    );
  }

  if (team === null) {
    return (
      <div className="screen">
        <div className="screen-scroll">
          <div className="screen-empty">
            <p>No tienes acceso a este equipo.</p>
          </div>
        </div>
      </div>
    );
  }

  const list = tasks ?? [];
  const filtered = list.filter((t) => {
    if (filter === "all") return true;
    if (filter === "mine") return t.assigneeId === myUserId;
    if (filter === "unassigned") return !t.assigneeId;
    return t.assigneeId === filter;
  });

  const filterBar = (
    <div className="assignee-filter">
      <span className="assignee-filter-label">Mostrar:</span>
      <button
        type="button"
        className={"filter-chip" + (filter === "all" ? " active" : "")}
        onClick={() => setFilter("all")}
      >
        Todas
      </button>
      <button
        type="button"
        className={"filter-chip" + (filter === "mine" ? " active" : "")}
        onClick={() => setFilter("mine")}
      >
        Asignadas a mí
      </button>
      <button
        type="button"
        className={"filter-chip" + (filter === "unassigned" ? " active" : "")}
        onClick={() => setFilter("unassigned")}
      >
        Sin asignar
      </button>
      {team.members
        .filter((m) => m.userId !== myUserId)
        .map((m) => (
          <button
            key={m.userId}
            type="button"
            className={"filter-chip" + (filter === m.userId ? " active" : "")}
            onClick={() => setFilter(m.userId)}
          >
            <span className="avatar sm">{m.username.charAt(0).toUpperCase()}</span>
            {m.username}
          </button>
        ))}
    </div>
  );

  if (view === "kanban") {
    const selectedTask = filtered.find((t) => t._id === selectedTaskId) ?? null;
    return (
      <div className="screen">
        <header className="screen-head" style={{ color: "#2d7d52" }}>
          <h1>{team.name}</h1>
          <p className="screen-sub">
            {team.members.length} {team.members.length === 1 ? "miembro" : "miembros"} · tareas de equipo
          </p>
          <div className="screen-toolbar">
            <ViewToggle view={view} onChange={changeView} />
          </div>
          <TeamBar teamId={teamId} members={team.members} myUserId={myUserId} isOwner={team.isOwner} />
          {filterBar}
        </header>
        <div className="screen-scroll">
          {tasks === undefined ? (
            <p className="screen-empty">Cargando…</p>
          ) : (
            <TeamKanbanBoard
              teamId={teamId}
              tasks={filtered}
              today={today}
              members={team.members}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
            />
          )}
        </div>
        {selectedTask && (
          <TaskDetail
            key={selectedTask._id}
            task={selectedTask}
            today={today}
            members={team.members}
            onClose={() => setSelectedTaskId(null)}
            onOpenProject={onOpenProject}
          />
        )}
      </div>
    );
  }

  const pending = sortTasks(filtered.filter((t) => !t.completed));
  const done = sortTasks(filtered.filter((t) => t.completed));
  const groups: TaskGroup[] = [
    { tasks: pending },
    { label: "Completadas", tasks: done },
  ];

  return (
    <TaskScreen
      title={team.name}
      subtitle={`${team.members.length} ${
        team.members.length === 1 ? "miembro" : "miembros"
      } · tareas de equipo`}
      accent="#2d7d52"
      groups={groups}
      today={today}
      onOpenProject={onOpenProject}
      members={team.members}
      showTeamChip={false}
      loading={tasks === undefined}
      emptyText="Este equipo aún no tiene tareas. Crea una y asígnala a un miembro."
      headerExtra={<ViewToggle view={view} onChange={changeView} />}
      beforeList={
        <>
          <TeamBar
            teamId={teamId}
            members={team.members}
            myUserId={myUserId}
            isOwner={team.isOwner}
          />
          {filterBar}
        </>
      }
      composer={
        <Composer
          placeholder="Añadir una tarea de equipo"
          members={team.members}
          workspaceId={team.workspaceId}
          onCreate={(d) =>
            createTask({
              title: d.title,
              priority: d.priority,
              dueDate: d.dueDate,
              recurrence: d.recurrence,
              tags: d.tags,
              teamId,
              assigneeId: d.assigneeId,
            }).then(() => undefined)
          }
        />
      }
    />
  );
}
