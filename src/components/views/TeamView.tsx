import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { sortTasks } from "../../util";
import Composer from "../Composer";
import TaskScreen, { type TaskGroup } from "../TaskScreen";
import UserPicker from "../UserPicker";
import { PlusIcon } from "../icons";

function TeamBar({
  teamId,
  members,
  myUserId,
}: {
  teamId: Id<"teams">;
  members: { userId: Id<"users">; username: string }[];
  myUserId: Id<"users">;
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
        <button className="member-add" onClick={() => setOpen(!open)}>
          <PlusIcon size={14} />
          Añadir miembro
        </button>
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
  const pending = sortTasks(list.filter((t) => !t.completed));
  const done = sortTasks(list.filter((t) => t.completed));

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
      beforeList={
        <TeamBar teamId={teamId} members={team.members} myUserId={myUserId} />
      }
      composer={
        <Composer
          placeholder="Añadir una tarea de equipo"
          members={team.members}
          onCreate={(d) =>
            createTask({
              title: d.title,
              priority: d.priority,
              dueDate: d.dueDate,
              recurrence: d.recurrence,
              teamId,
              assigneeId: d.assigneeId,
            }).then(() => undefined)
          }
        />
      }
    />
  );
}
