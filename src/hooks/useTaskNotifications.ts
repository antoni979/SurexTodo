import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { dayDiff } from "../util";

const STORAGE_KEY = "lastNotifiedDate";

/**
 * Requests notification permission on first use and fires a browser notification
 * once per calendar day when there are overdue or due-today pending tasks.
 */
export function useTaskNotifications({
  today,
  workspaceId,
}: {
  today: string;
  workspaceId: Id<"workspaces"> | null;
}) {
  const tasks = useQuery(api.tasks.listPlanned, {
    today,
    ...(workspaceId ? { workspaceId } : {}),
  });

  // Track whether we've already fired the notification this session
  const firedRef = useRef(false);

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (tasks === undefined) return; // still loading
    if (firedRef.current) return;

    // Only fire once per calendar day
    const lastDate = localStorage.getItem(STORAGE_KEY);
    if (lastDate === today) return;

    const pending = tasks.filter((t) => !t.completed);
    const overdue = pending.filter(
      (t) => t.dueDate && dayDiff(t.dueDate, today) < 0,
    );
    const dueToday = pending.filter(
      (t) => t.dueDate && dayDiff(t.dueDate, today) === 0,
    );

    if (overdue.length === 0 && dueToday.length === 0) return;

    function fire() {
      firedRef.current = true;
      localStorage.setItem(STORAGE_KEY, today);

      const parts: string[] = [];
      if (overdue.length > 0)
        parts.push(
          overdue.length === 1
            ? "1 tarea vencida"
            : `${overdue.length} tareas vencidas`,
        );
      if (dueToday.length > 0)
        parts.push(
          dueToday.length === 1
            ? "1 tarea para hoy"
            : `${dueToday.length} tareas para hoy`,
        );

      new Notification("SurexTODO", {
        body: parts.join(" · "),
        icon: "/pwa-192.png",
        tag: "surex-daily",       // replaces previous notification of same tag
      });
    }

    if (Notification.permission === "granted") {
      fire();
    } else if (Notification.permission === "default") {
      // Ask once; if user grants, fire immediately
      void Notification.requestPermission().then((result) => {
        if (result === "granted") fire();
      });
    }
    // If "denied", silently skip
  }, [tasks, today, workspaceId]);
}
