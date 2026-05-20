import { useState } from "react";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { View } from "./MainApp";
import {
  SunIcon,
  CalendarIcon,
  ListIcon,
  UsersIcon,
  PlusIcon,
  LogoutIcon,
} from "./icons";
import NewTeamModal from "./NewTeamModal";

export default function Sidebar({
  username,
  view,
  onSelect,
}: {
  username: string;
  view: View;
  onSelect: (v: View) => void;
}) {
  const teams = useQuery(api.teams.listMyTeams) ?? [];
  const { signOut } = useAuthActions();
  const [showNewTeam, setShowNewTeam] = useState(false);

  function navClass(active: boolean) {
    return active ? "nav-item active" : "nav-item";
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="/icon.svg" alt="" width={28} height={28} />
        <span>SurexTodo</span>
      </div>

      <nav className="sidebar-nav">
        <button
          className={navClass(view.kind === "myday")}
          onClick={() => onSelect({ kind: "myday" })}
        >
          <SunIcon size={18} />
          <span>Mi día</span>
        </button>
        <button
          className={navClass(view.kind === "planned")}
          onClick={() => onSelect({ kind: "planned" })}
        >
          <CalendarIcon size={18} />
          <span>Planeado</span>
        </button>
        <button
          className={navClass(view.kind === "tasks")}
          onClick={() => onSelect({ kind: "tasks" })}
        >
          <ListIcon size={18} />
          <span>Tareas</span>
        </button>
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <UsersIcon size={14} />
          <span>Equipos</span>
        </div>
        <div className="team-list">
          {teams.map((team) => (
            <button
              key={team._id}
              className={navClass(
                view.kind === "team" && view.teamId === team._id,
              )}
              onClick={() =>
                onSelect({
                  kind: "team",
                  teamId: team._id as Id<"teams">,
                })
              }
            >
              <span className="team-dot" />
              <span className="nav-label">{team.name}</span>
            </button>
          ))}
          {teams.length === 0 && (
            <p className="sidebar-empty">Aún no tienes equipos</p>
          )}
        </div>
        <button
          className="nav-item nav-add"
          onClick={() => setShowNewTeam(true)}
        >
          <PlusIcon size={18} />
          <span>Nuevo equipo</span>
        </button>
      </div>

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="avatar">{username.charAt(0).toUpperCase()}</div>
          <span className="username">{username}</span>
        </div>
        <button
          className="icon-btn"
          title="Cerrar sesión"
          onClick={() => signOut()}
        >
          <LogoutIcon size={18} />
        </button>
      </div>

      {showNewTeam && (
        <NewTeamModal
          onClose={() => setShowNewTeam(false)}
          onCreated={(teamId) => {
            setShowNewTeam(false);
            onSelect({ kind: "team", teamId });
          }}
        />
      )}
    </aside>
  );
}
