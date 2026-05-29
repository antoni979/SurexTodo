import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
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
  FolderIcon,
  BellIcon,
} from "./icons";
import { PROJECT_STATUS_META } from "../util";
import NewTeamModal from "./NewTeamModal";

export default function Sidebar({
  username,
  view,
  onSelect,
  open,
  workspaceId,
  onWorkspaceChange,
  notifPermission,
  onEnableNotifications,
}: {
  username: string;
  view: View;
  onSelect: (v: View) => void;
  open: boolean;
  workspaceId: Id<"workspaces"> | null;
  onWorkspaceChange: (id: Id<"workspaces"> | null) => void;
  notifPermission: NotificationPermission;
  onEnableNotifications: () => void;
}) {
  const workspaces = useQuery(api.workspaces.listMyWorkspaces) ?? [];
  const createWorkspace = useMutation(api.workspaces.createWorkspace);
  const teams = useQuery(api.teams.listMyTeams, workspaceId ? { workspaceId } : {}) ?? [];
  const projects = useQuery(api.projects.listMyProjects, workspaceId ? { workspaceId } : {}) ?? [];
  const { signOut } = useAuthActions();
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [wsError, setWsError] = useState<string | null>(null);
  const [showNotifHelp, setShowNotifHelp] = useState(false);

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setWsError(null);
    try {
      const id = await createWorkspace({ name: newWsName });
      setNewWsName("");
      setShowNewWorkspace(false);
      onWorkspaceChange(id);
    } catch (err) {
      setWsError(err instanceof Error ? err.message : "Error");
    }
  }

  function navClass(active: boolean) {
    return active ? "nav-item active" : "nav-item";
  }

  return (
    <aside className={"sidebar" + (open ? " open" : "")}>
      <div className="sidebar-brand">
        <img src="/icon.svg" alt="" width={28} height={28} />
        <span>SurexTodo</span>
      </div>

      {/* Workspace switcher */}
      <div className="workspace-switcher">
        {workspaces.length === 0 && (
          <button
            className={"ws-pill" + (workspaceId === null ? " active" : "")}
            onClick={() => onWorkspaceChange(null)}
          >
            Personal
          </button>
        )}
        {workspaces.map((ws) => (
          <button
            key={ws._id}
            className={"ws-pill" + (workspaceId === ws._id ? " active" : "")}
            onClick={() => onWorkspaceChange(ws._id)}
          >
            {ws.name}
          </button>
        ))}
        <button
          className="ws-pill ws-add"
          title="Nuevo entorno"
          onClick={() => setShowNewWorkspace(!showNewWorkspace)}
        >
          <PlusIcon size={12} />
        </button>
      </div>
      {showNewWorkspace && (
        <form className="ws-new-form" onSubmit={handleCreateWorkspace}>
          <input
            type="text"
            value={newWsName}
            onChange={(e) => setNewWsName(e.target.value)}
            placeholder="Nombre del entorno"
            autoFocus
          />
          <button type="submit" className="btn-primary btn-sm" disabled={!newWsName.trim()}>
            Crear
          </button>
          {wsError && <span className="composer-error">{wsError}</span>}
        </form>
      )}

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
          <FolderIcon size={14} />
          <span>Proyectos</span>
        </div>
        <button
          className={navClass(view.kind === "projects")}
          onClick={() => onSelect({ kind: "projects" })}
        >
          <ListIcon size={18} />
          <span>Todos los proyectos</span>
        </button>
        <div className="team-list">
          {projects.slice(0, 8).map((p) => {
            const meta = PROJECT_STATUS_META[p.projectStatus];
            return (
              <button
                key={p._id}
                className={navClass(
                  view.kind === "project" && view.projectId === p._id,
                )}
                onClick={() =>
                  onSelect({
                    kind: "project",
                    projectId: p._id as Id<"tasks">,
                  })
                }
                title={p.title}
              >
                <span
                  className="project-dot"
                  style={{ background: meta.color }}
                />
                <span className="nav-label">{p.title}</span>
              </button>
            );
          })}
          {projects.length === 0 && (
            <p className="sidebar-empty">Aún no tienes proyectos</p>
          )}
        </div>
      </div>

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

      <div className="sidebar-spacer" />

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="avatar">{username.charAt(0).toUpperCase()}</div>
          <span className="username">{username}</span>
        </div>
        {"Notification" in window && (
          <div className="notif-wrap">
            <button
              className={
                "icon-btn notif-btn" +
                (notifPermission === "granted" ? " notif-on" : "") +
                (notifPermission === "denied" ? " notif-off" : "")
              }
              title={
                notifPermission === "granted"
                  ? "Notificaciones activas · pulsa para probar"
                  : notifPermission === "denied"
                  ? "Bloqueadas — pulsa para ver cómo desbloquear"
                  : "Activar notificaciones de escritorio"
              }
              onClick={() => {
                if (notifPermission === "denied") {
                  setShowNotifHelp((v) => !v);
                } else {
                  void onEnableNotifications();
                  if (notifPermission === "default") setShowNotifHelp(true);
                }
              }}
            >
              <BellIcon size={18} />
            </button>
            {showNotifHelp && (
              <div className="notif-help">
                {notifPermission === "denied" ? (
                  <>
                    <strong>Notificaciones bloqueadas</strong>
                    <p>
                      Chrome las denegó automáticamente. Para activarlas:
                    </p>
                    <ol>
                      <li>Haz clic en el 🔒 de la barra de dirección</li>
                      <li>Abre <em>Configuración del sitio</em></li>
                      <li>En <em>Notificaciones</em> elige <em>Permitir</em></li>
                      <li>Recarga la página y vuelve a pulsar la campana</li>
                    </ol>
                  </>
                ) : notifPermission === "default" ? (
                  <>
                    <strong>Acepta el permiso</strong>
                    <p>
                      Busca el cuadro de diálogo del navegador (puede aparecer
                      en la barra de dirección como un icono 🔔) y pulsa
                      <em> Permitir</em>.
                    </p>
                  </>
                ) : (
                  <p>¡Notificaciones activas! 🎉 Notificación de prueba enviada.</p>
                )}
                <button
                  className="notif-help-close"
                  onClick={() => setShowNotifHelp(false)}
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        )}
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
          workspaceId={workspaceId}
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
