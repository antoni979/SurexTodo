import { useMemo, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { localToday } from "../util";
import Sidebar from "./Sidebar";
import MyDayView from "./views/MyDayView";
import PlannedView from "./views/PlannedView";
import TasksView from "./views/TasksView";
import TeamView from "./views/TeamView";
import { MenuIcon } from "./icons";

export type View =
  | { kind: "myday" }
  | { kind: "planned" }
  | { kind: "tasks" }
  | { kind: "team"; teamId: Id<"teams"> };

export default function MainApp({
  username,
  userId,
}: {
  username: string;
  userId: Id<"users">;
}) {
  const [view, setView] = useState<View>({ kind: "myday" });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const today = useMemo(() => localToday(), []);

  function selectView(v: View) {
    setView(v);
    setSidebarOpen(false);
  }

  return (
    <div className="app">
      <Sidebar
        username={username}
        view={view}
        onSelect={selectView}
        open={sidebarOpen}
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
        {view.kind === "myday" && <MyDayView today={today} />}
        {view.kind === "planned" && <PlannedView today={today} />}
        {view.kind === "tasks" && <TasksView today={today} />}
        {view.kind === "team" && (
          <TeamView
            key={view.teamId}
            teamId={view.teamId}
            today={today}
            myUserId={userId}
          />
        )}
      </main>
    </div>
  );
}
