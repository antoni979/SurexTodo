import { useEffect, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { localToday } from "../util";
import Sidebar from "./Sidebar";
import MyDayView from "./views/MyDayView";
import PlannedView from "./views/PlannedView";
import TasksView from "./views/TasksView";
import TeamView from "./views/TeamView";
import ProjectsView from "./views/ProjectsView";
import ProjectView from "./views/ProjectView";
import { MenuIcon } from "./icons";

export type View =
  | { kind: "myday" }
  | { kind: "planned" }
  | { kind: "tasks" }
  | { kind: "team"; teamId: Id<"teams"> }
  | { kind: "projects" }
  | { kind: "project"; projectId: Id<"tasks"> };

export default function MainApp({
  username,
  userId,
}: {
  username: string;
  userId: Id<"users">;
}) {
  const [view, setView] = useState<View>({ kind: "myday" });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<Id<"workspaces"> | null>(null);
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
        onWorkspaceChange={setWorkspaceId}
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
        {view.kind === "myday" && (
          <MyDayView today={today} onOpenProject={openProject} />
        )}
        {view.kind === "planned" && (
          <PlannedView today={today} onOpenProject={openProject} />
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
      </main>
    </div>
  );
}
