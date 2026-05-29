import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { dayDiff } from "../util";

const STORAGE_KEY = "lastNotifiedDate";

function getPermission(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

function buildMessage(
  overdue: number,
  dueToday: number,
  projects: number,
): string {
  const parts: string[] = [];
  if (overdue > 0)
    parts.push(overdue === 1 ? "1 tarea vencida" : `${overdue} tareas vencidas`);
  if (dueToday > 0)
    parts.push(dueToday === 1 ? "1 tarea para hoy" : `${dueToday} tareas para hoy`);
  if (projects > 0)
    parts.push(projects === 1 ? "1 proyecto pendiente de revisión" : `${projects} proyectos pendientes de revisión`);
  return parts.join(" · ");
}

function fireNotification(body: string) {
  new Notification("SurexTODO", {
    body,
    icon: "/pwa-192.png",
    tag: "surex-daily",
  });
}

/**
 * Returns:
 *  - permission: current Notification.permission state
 *  - enableNotifications(): call from a button click to request permission + fire immediately
 *
 * Also auto-fires once per calendar day when permission is already granted.
 */
export function useTaskNotifications({
  today,
  workspaceId,
}: {
  today: string;
  workspaceId: Id<"workspaces"> | null;
}) {
  const [permission, setPermission] =
    useState<NotificationPermission>(getPermission);

  const tasks = useQuery(api.tasks.listPlanned, {
    today,
    ...(workspaceId ? { workspaceId } : {}),
  });

  const autoFiredRef = useRef(false);

  // ── helpers ──────────────────────────────────────────────────────────────

  function counts() {
    const pending = (tasks ?? []).filter((t) => !t.completed);
    const overdue = pending.filter(
      (t) => t.isProject ? false : t.dueDate && dayDiff(t.dueDate, today) < 0,
    ).length;
    const dueToday = pending.filter(
      (t) => t.isProject ? false : t.dueDate && dayDiff(t.dueDate, today) === 0,
    ).length;
    const reviewProjects = pending.filter((t) => t.isProject).length;
    return { overdue, dueToday, reviewProjects };
  }

  // ── auto-fire once per day when already granted ───────────────────────

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (tasks === undefined) return;        // still loading
    if (autoFiredRef.current) return;       // already fired this session

    const lastDate = localStorage.getItem(STORAGE_KEY);
    if (lastDate === today) return;         // already fired today

    const { overdue, dueToday, reviewProjects } = counts();
    if (overdue === 0 && dueToday === 0 && reviewProjects === 0) return;

    autoFiredRef.current = true;
    localStorage.setItem(STORAGE_KEY, today);
    fireNotification(buildMessage(overdue, dueToday, reviewProjects));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, today]);

  // ── manual enable (requires user gesture) ────────────────────────────

  const enableNotifications = useCallback(async () => {
    if (!("Notification" in window)) return;

    if (Notification.permission === "granted") {
      // Already granted — fire immediately (useful as a "test" button)
      const { overdue, dueToday, reviewProjects } = counts();
      const msg =
        overdue === 0 && dueToday === 0 && reviewProjects === 0
          ? "No tienes tareas pendientes para hoy 🎉"
          : buildMessage(overdue, dueToday, reviewProjects);
      fireNotification(msg);
      // Reset daily flag so it fires again on next reload too
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === "granted") {
      const { overdue, dueToday, reviewProjects } = counts();
      const msg =
        overdue === 0 && dueToday === 0 && reviewProjects === 0
          ? "Notificaciones activadas. No tienes tareas pendientes para hoy 🎉"
          : buildMessage(overdue, dueToday, reviewProjects);
      localStorage.setItem(STORAGE_KEY, today);
      autoFiredRef.current = true;
      fireNotification(msg);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, today]);

  return { permission, enableNotifications };
}
