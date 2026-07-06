import { useEffect, useState } from "react";
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
import { MenuIcon } from "./icons";

export type View =
  | { kind: "myday" }
  | { kind: "planned" }
  | { kind: "tasks" }
  | { kind: "calendar" }
  | { kind: "team"; teamId: Id<"teams"> }
  | { kind: "projects" }
  | { kind: "project"; projectId: Id<"tasks"> }
  | { kind: "list"; listId: Id<"lists"> };

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
  const [workspaceId, setWorkspaceId] = useState<Id<"workspaces"> | null>(() => {
    const saved = localStorage.getItem("defaultWorkspace");
    return saved ? (saved as Id<"workspaces">) : null;
  });
  const workspaces = useQuery(api.workspaces.listMyWorkspaces) ?? [];

  // Auto-seleccionar / auto-corregir el entorno una vez cargada la lista.
  useEffect(() => {
    if (workspaces.length === 0) return;
    // Caso 1: no hay entorno seleccionado → coger el primero.
    if (workspaceId === null) {
      const first = workspaces[0]._id;
      setWorkspaceId(first);
      localStorage.setItem("defaultWorkspace", first);
      return;
    }
    // Caso 2: el entorno guardado ya no es válido (el usuario no es miembro,
    // p.ej. localStorage heredado de otra cuenta) → corregir al primero suyo.
    if (!workspaces.some((w) => w._id === workspaceId)) {
      // eslint-disable-next-line no-console
      console.warn(
        "[SUREX] workspaceId guardado no válido para este usuario; corrigiendo.",
        { guardado: workspaceId, disponibles: workspaces.map((w) => w._id) },
      );
      const first = workspaces[0]._id;
      setWorkspaceId(first);
      localStorage.setItem("defaultWorkspace", first);
    }
  }, [workspaces, workspaceId]);
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
          setWorkspaceId(id);
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
        {localStorage.getItem("surexDebug") === "1" && (
          <div
            style={{
              background: "#fef3c7",
              border: "1px solid #f59e0b",
              borderRadius: 8,
              padding: "8px 12px",
              margin: "8px 12px",
              fontSize: 12,
              fontFamily: "monospace",
              color: "#78350f",
              lineHeight: 1.6,
            }}
          >
            <strong>DEBUG</strong> · user: {username} ({userId.slice(0, 8)}…)
            <br />
            workspaceId actual:{" "}
            <b>
              {workspaceId
                ? `${workspaces.find((w) => w._id === workspaceId)?.name ?? "??"} (${workspaceId.slice(0, 8)}…)`
                : "NULL (Personal)"}
            </b>
            {workspaceId &&
              !workspaces.some((w) => w._id === workspaceId) && (
                <span style={{ color: "#b91c1c" }}>
                  {" "}
                  ⚠️ NO ERES MIEMBRO DE ESTE ENTORNO
                </span>
              )}
            <br />
            entornos: {workspaces.map((w) => w.name).join(", ") || "(ninguno)"}
          </div>
        )}
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
      </main>
    </div>
  );
}
