import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { localToday } from "../util";
import { useTaskNotifications } from "../hooks/useTaskNotifications";
import Sidebar from "./Sidebar";
import MyDayView from "./views/MyDayView";
import PlannedView from "./views/PlannedView";
import TasksView from "./views/TasksView";
import TeamView from "./views/TeamView";
import ProjectsView from "./views/ProjectsView";
import ProjectView from "./views/ProjectView";
import ListView from "./views/ListView";
import CalendarView from "./views/CalendarView";
import BrainView from "./views/BrainView";
import QuickCapture from "./QuickCapture";
import { MenuIcon } from "./icons";

export type View =
  | { kind: "myday" }
  | { kind: "planned" }
  | { kind: "tasks" }
  | { kind: "calendar" }
  | { kind: "team"; teamId: Id<"teams"> }
  | { kind: "projects" }
  | { kind: "project"; projectId: Id<"tasks"> }
  | { kind: "list"; listId: Id<"lists"> }
  | { kind: "brain" };

export default function MainApp({
  username,
  userId,
}: {
  username: string;
  userId: Id<"users">;
}) {
  const [view, setView] = useState<View>(() => {
    const saved = localStorage.getItem("defaultView");
    if (saved === "planned") return { kind: "planned" };
    if (saved === "tasks") return { kind: "tasks" };
    if (saved === "calendar") return { kind: "calendar" };
    return { kind: "myday" };
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Preferencia del usuario (puede quedar obsoleta o ser de otra cuenta).
  const [workspacePref, setWorkspacePref] = useState<Id<"workspaces"> | null>(
    () => {
      const saved = localStorage.getItem("defaultWorkspace");
      return saved ? (saved as Id<"workspaces">) : null;
    },
  );
  const workspacesResult = useQuery(api.workspaces.listMyWorkspaces);
  const workspacesLoading = workspacesResult === undefined;
  const workspaces = workspacesResult ?? [];

  // ── FUENTE ÚNICA DE VERDAD ──────────────────────────────────────────────
  // El entorno "efectivo" está GARANTIZADO como uno del que el usuario es
  // miembro (o null si no tiene ninguno). Es lo único que se pasa a las
  // queries y a crear tareas, así que es imposible operar sobre un entorno
  // ajeno aunque el localStorage esté corrupto o heredado de otra cuenta.
  const workspaceId: Id<"workspaces"> | null = useMemo(() => {
    if (workspaces.length === 0) return null; // solo espacio personal
    if (workspacePref && workspaces.some((w) => w._id === workspacePref)) {
      return workspacePref;
    }
    return workspaces[0]._id; // fallback a un entorno válido
  }, [workspaces, workspacePref]);

  // Mantener preferencia y localStorage sincronizados con lo efectivo, sin
  // pisar nada mientras aún carga la lista de entornos.
  useEffect(() => {
    if (workspacesLoading) return;
    if (workspaceId !== workspacePref) {
      setWorkspacePref(workspaceId);
      if (workspaceId) localStorage.setItem("defaultWorkspace", workspaceId);
      else localStorage.removeItem("defaultWorkspace");
    }
  }, [workspacesLoading, workspaceId, workspacePref]);
  const [today, setToday] = useState(() => localToday());

  useEffect(() => {
    function msUntilMidnight() {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      return midnight.getTime() - now.getTime();
    }
    let timeout: ReturnType<typeof setTimeout>;
    function scheduleUpdate() {
      timeout = setTimeout(() => {
        setToday(localToday());
        scheduleUpdate();
      }, msUntilMidnight());
    }
    scheduleUpdate();
    return () => clearTimeout(timeout);
  }, []);

  // Fire a browser notification once per day for overdue / due-today tasks
  const { permission: notifPermission, enabled: notifEnabled, enableNotifications, disableNotifications } =
    useTaskNotifications({ today, workspaceId });

  // If we're viewing a list that no longer exists, go back to tasks
  const lists = useQuery(api.lists.listMyLists, workspaceId ? { workspaceId } : {}) ?? [];
  useEffect(() => {
    if (view.kind === "list" && lists.length > 0) {
      const exists = lists.some((l) => l._id === view.listId);
      if (!exists) setView({ kind: "tasks" });
    }
  }, [lists, view]);

  function selectView(v: View) {
    setView(v);
    setSidebarOpen(false);
  }

  const openProject = (projectId: Id<"tasks">) =>
    selectView({ kind: "project", projectId });

  return (
    <div className="app">
      <Sidebar
        username={username}
        view={view}
        onSelect={selectView}
        open={sidebarOpen}
        workspaceId={workspaceId}
        onWorkspaceChange={(id) => {
          setWorkspacePref(id);
          if (id) localStorage.setItem("defaultWorkspace", id);
          else localStorage.removeItem("defaultWorkspace");
        }}
        notifPermission={notifPermission}
        notifEnabled={notifEnabled}
        onEnableNotifications={enableNotifications}
        onDisableNotifications={disableNotifications}
      />
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <button
        className="menu-btn"
        onClick={() => setSidebarOpen(true)}
        aria-label="Abrir menú"
      >
        <MenuIcon size={22} />
      </button>
      <main className="content">
        {workspacesLoading ? (
          <div className="ws-loading">Cargando tu espacio…</div>
        ) : (
        <>
        {view.kind === "myday" && (
          <MyDayView today={today} onOpenProject={openProject} workspaceId={workspaceId} />
        )}
        {view.kind === "planned" && (
          <PlannedView today={today} onOpenProject={openProject} workspaceId={workspaceId} />
        )}
        {view.kind === "tasks" && (
          <TasksView today={today} onOpenProject={openProject} workspaceId={workspaceId} />
        )}
        {view.kind === "team" && (
          <TeamView
            key={view.teamId}
            teamId={view.teamId}
            today={today}
            myUserId={userId}
            onOpenProject={openProject}
          />
        )}
        {view.kind === "projects" && <ProjectsView onOpen={openProject} workspaceId={workspaceId} />}
        {view.kind === "project" && (
          <ProjectView key={view.projectId} projectId={view.projectId} today={today} />
        )}
        {view.kind === "calendar" && (
          <CalendarView today={today} onOpenProject={openProject} workspaceId={workspaceId} />
        )}
        {view.kind === "list" && (
          <ListView
            key={view.listId}
            listId={view.listId}
            today={today}
            onOpenProject={openProject}
            workspaceId={workspaceId}
          />
        )}
        {view.kind === "brain" && <BrainView />}
        </>
        )}
      </main>
      {!workspacesLoading && <QuickCapture workspaceId={workspaceId} />}
    </div>
  );
}
