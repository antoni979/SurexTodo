import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";

export type EnrichedTask = FunctionReturnType<
  typeof api.tasks.listPersonal
>[number];

export type ProjectSummary = FunctionReturnType<
  typeof api.projects.listMyProjects
>[number];

export type ProjectDetail = NonNullable<
  FunctionReturnType<typeof api.projects.getProject>
>;

export type ProjectTask = ProjectDetail["tasks"][number];

export type Priority = "baja" | "media" | "alta" | "urgente";

export const PRIORITIES: Priority[] = ["baja", "media", "alta", "urgente"];

export const PRIORITY_META: Record<
  Priority,
  { label: string; short: string; color: string; rank: number }
> = {
  baja: { label: "Baja", short: "Baja", color: "#6b7280", rank: 0 },
  media: { label: "Media", short: "Media", color: "#2563eb", rank: 1 },
  alta: { label: "Alta", short: "Alta", color: "#ea580c", rank: 2 },
  urgente: {
    label: "Súper urgente",
    short: "Urgente",
    color: "#dc2626",
    rank: 3,
  },
};

export type RecurrenceType =
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "custom";

export type Recurrence = { type: RecurrenceType; days?: number[] };

/** Weekday buttons, Monday-first. n = JS getDay() value (0 = domingo). */
export const WEEKDAYS: { n: number; label: string }[] = [
  { n: 1, label: "L" },
  { n: 2, label: "M" },
  { n: 3, label: "X" },
  { n: 4, label: "J" },
  { n: 5, label: "V" },
  { n: 6, label: "S" },
  { n: 0, label: "D" },
];

function weekdayOrder(n: number) {
  return n === 0 ? 7 : n;
}

export function recurrenceLabel(r: Recurrence | undefined): string | null {
  if (!r) return null;
  switch (r.type) {
    case "daily":
      return "Cada día";
    case "weekdays":
      return "Días laborales";
    case "weekly":
      return "Cada semana";
    case "monthly":
      return "Cada mes";
    case "custom": {
      const sel = [...(r.days ?? [])].sort(
        (a, b) => weekdayOrder(a) - weekdayOrder(b),
      );
      if (!sel.length) return "Días concretos";
      return sel
        .map((d) => WEEKDAYS.find((w) => w.n === d)?.label ?? "")
        .join(", ");
    }
  }
}

/** Local date as YYYY-MM-DD (not UTC). */
export function localToday(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function dateFromStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Whole-day difference: due - today (negative = overdue). */
export function dayDiff(due: string, today: string): number {
  const a = dateFromStr(today).getTime();
  const b = dateFromStr(due).getTime();
  return Math.round((b - a) / 86400000);
}

export function formatDue(due: string, today: string) {
  const diff = dayDiff(due, today);
  let label: string;
  if (diff === 0) label = "Hoy";
  else if (diff === 1) label = "Mañana";
  else if (diff === -1) label = "Ayer";
  else {
    label = dateFromStr(due).toLocaleDateString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }
  return { label, diff, overdue: diff < 0 };
}

export function shortDate(d: string): string {
  return dateFromStr(d).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

export function longToday(today: string): string {
  const s = dateFromStr(today).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Sort: incomplete first, then by priority (high first), then newest. */
export function sortTasks(tasks: EnrichedTask[]): EnrichedTask[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const pr =
      PRIORITY_META[b.priority as Priority].rank -
      PRIORITY_META[a.priority as Priority].rank;
    if (pr !== 0) return pr;
    return b._creationTime - a._creationTime;
  });
}

/* ---------- project meta ---------- */

export type ProjectStatus =
  | "not_started"
  | "in_progress"
  | "paused"
  | "completed"
  | "cancelled";

export const PROJECT_STATUSES: ProjectStatus[] = [
  "not_started",
  "in_progress",
  "paused",
  "completed",
  "cancelled",
];

export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; color: string }
> = {
  not_started: { label: "Sin iniciar", color: "#6b7280" },
  in_progress: { label: "En curso", color: "#2563eb" },
  paused: { label: "En pausa", color: "#b45309" },
  completed: { label: "Completado", color: "#16a34a" },
  cancelled: { label: "Cancelado", color: "#dc2626" },
};

export type KanbanStatus = "todo" | "in_progress" | "done";

export const KANBAN_COLUMNS: { key: KanbanStatus; label: string }[] = [
  { key: "todo", label: "Por hacer" },
  { key: "in_progress", label: "En curso" },
  { key: "done", label: "Hecho" },
];
