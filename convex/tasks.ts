import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { priorityValidator, recurrenceValidator } from "./schema";

type Recurrence = {
  type: "daily" | "weekdays" | "weekly" | "monthly" | "custom";
  days?: number[];
};

/* ---------- recurrence date math (UTC, date-only) ---------- */

function ymdToUTC(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function utcToYmd(d: Date): string {
  return (
    d.getUTCFullYear() +
    "-" +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getUTCDate()).padStart(2, "0")
  );
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function nextOccurrence(base: string, rec: Recurrence): string {
  const d = ymdToUTC(base);
  switch (rec.type) {
    case "daily":
      return utcToYmd(addDays(d, 1));
    case "weekly":
      return utcToYmd(addDays(d, 7));
    case "monthly": {
      const r = new Date(d);
      const day = r.getUTCDate();
      r.setUTCMonth(r.getUTCMonth() + 1);
      if (r.getUTCDate() !== day) r.setUTCDate(0);
      return utcToYmd(r);
    }
    case "weekdays": {
      let next = addDays(d, 1);
      while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
        next = addDays(next, 1);
      }
      return utcToYmd(next);
    }
    case "custom": {
      const days = rec.days && rec.days.length ? rec.days : [d.getUTCDay()];
      let next = addDays(d, 1);
      for (let i = 0; i < 14; i++) {
        if (days.includes(next.getUTCDay())) return utcToYmd(next);
        next = addDays(next, 1);
      }
      return utcToYmd(addDays(d, 7));
    }
  }
}

/* ---------- helpers ---------- */

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("No has iniciado sesión");
  return userId;
}

async function nameOf(ctx: QueryCtx, userId: Id<"users"> | undefined) {
  if (!userId) return null;
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  return profile?.username ?? "(sin nombre)";
}

async function isTeamMember(
  ctx: QueryCtx | MutationCtx,
  teamId: Id<"teams">,
  userId: Id<"users">,
) {
  const row = await ctx.db
    .query("teamMembers")
    .withIndex("by_team_user", (q) =>
      q.eq("teamId", teamId).eq("userId", userId),
    )
    .unique();
  return row !== null;
}

// A user may view/edit a task if it is their personal task,
// or if it belongs to a team they are a member of.
async function assertAccess(
  ctx: QueryCtx | MutationCtx,
  task: Doc<"tasks">,
  userId: Id<"users">,
) {
  if (task.teamId) {
    if (!(await isTeamMember(ctx, task.teamId, userId))) {
      throw new Error("No tienes acceso a esta tarea");
    }
  } else if (task.creatorId !== userId) {
    throw new Error("No tienes acceso a esta tarea");
  }
}

async function myDayTaskIds(
  ctx: QueryCtx,
  userId: Id<"users">,
  date: string | undefined,
) {
  if (!date) return new Set<string>();
  const rows = await ctx.db
    .query("myDay")
    .withIndex("by_user_date", (q) =>
      q.eq("userId", userId).eq("date", date),
    )
    .collect();
  return new Set(rows.map((r) => r.taskId as string));
}

async function enrich(
  ctx: QueryCtx,
  task: Doc<"tasks">,
  myDaySet: Set<string>,
) {
  let teamName: string | null = null;
  if (task.teamId) {
    const team = await ctx.db.get(task.teamId);
    teamName = team?.name ?? null;
  }
  return {
    ...task,
    creatorName: await nameOf(ctx, task.creatorId),
    assigneeName: await nameOf(ctx, task.assigneeId),
    teamName,
    inMyDay: myDaySet.has(task._id),
  };
}

/* ---------- queries ---------- */

// Personal tasks: created by me and not attached to a team.
export const listPersonal = query({
  args: { today: v.optional(v.string()) },
  handler: async (ctx, { today }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const all = await ctx.db
      .query("tasks")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .collect();
    const personal = all.filter((t) => !t.teamId);
    const myDaySet = await myDayTaskIds(ctx, userId, today);
    return Promise.all(personal.map((t) => enrich(ctx, t, myDaySet)));
  },
});

// All tasks of a team I belong to.
export const listTeamTasks = query({
  args: { teamId: v.id("teams"), today: v.optional(v.string()) },
  handler: async (ctx, { teamId, today }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    if (!(await isTeamMember(ctx, teamId, userId))) return [];
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const myDaySet = await myDayTaskIds(ctx, userId, today);
    return Promise.all(tasks.map((t) => enrich(ctx, t, myDaySet)));
  },
});

// Tasks I added to "Mi día" for the given date.
export const listMyDay = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("myDay")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", today),
      )
      .collect();
    const myDaySet = new Set(rows.map((r) => r.taskId as string));
    const tasks = [];
    for (const row of rows) {
      const task = await ctx.db.get(row.taskId);
      if (task) tasks.push(await enrich(ctx, task, myDaySet));
    }
    return tasks;
  },
});

// Planned: personal tasks of mine with a due date, plus team tasks
// ASSIGNED TO ME with a due date. A team task only shows here for the
// person it is assigned to.
export const listPlanned = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const created = await ctx.db
      .query("tasks")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .collect();
    const personalWithDue = created.filter((t) => !t.teamId && t.dueDate);

    const assigned = await ctx.db
      .query("tasks")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", userId))
      .collect();
    const teamWithDue = assigned.filter((t) => t.teamId && t.dueDate);

    const combined = [...personalWithDue, ...teamWithDue];
    const myDaySet = await myDayTaskIds(ctx, userId, today);
    return Promise.all(combined.map((t) => enrich(ctx, t, myDaySet)));
  },
});

/* ---------- mutations ---------- */

export const createTask = mutation({
  args: {
    title: v.string(),
    priority: priorityValidator,
    dueDate: v.optional(v.string()),
    teamId: v.optional(v.id("teams")),
    assigneeId: v.optional(v.id("users")),
    recurrence: v.optional(recurrenceValidator),
    addToMyDay: v.optional(v.boolean()),
    today: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const title = args.title.trim();
    if (!title) throw new Error("La tarea necesita un título");

    const teamId = args.teamId;
    const assigneeId = args.assigneeId;

    if (teamId) {
      if (!(await isTeamMember(ctx, teamId, userId))) {
        throw new Error("No perteneces a este equipo");
      }
      if (assigneeId && !(await isTeamMember(ctx, teamId, assigneeId))) {
        throw new Error("La persona asignada no está en el equipo");
      }
    }

    const taskId = await ctx.db.insert("tasks", {
      title,
      priority: args.priority,
      completed: false,
      dueDate: args.dueDate || undefined,
      creatorId: userId,
      teamId,
      assigneeId: teamId ? assigneeId : undefined,
      recurrence: args.recurrence,
    });

    if (args.addToMyDay && args.today) {
      await ctx.db.insert("myDay", { userId, taskId, date: args.today });
    }
    return taskId;
  },
});

export const updateTask = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    priority: v.optional(priorityValidator),
    dueDate: v.optional(v.union(v.string(), v.null())),
    assigneeId: v.optional(v.union(v.id("users"), v.null())),
    note: v.optional(v.union(v.string(), v.null())),
    recurrence: v.optional(v.union(recurrenceValidator, v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Tarea no encontrada");
    await assertAccess(ctx, task, userId);

    const patch: {
      title?: string;
      priority?: "baja" | "media" | "alta" | "urgente";
      dueDate?: string;
      note?: string;
      assigneeId?: Id<"users">;
      recurrence?: Recurrence;
    } = {};

    if (args.title !== undefined) {
      const t = args.title.trim();
      if (t) patch.title = t;
    }
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate ?? undefined;
    if (args.note !== undefined) patch.note = args.note ?? undefined;
    if (args.recurrence !== undefined) {
      patch.recurrence = args.recurrence ?? undefined;
    }
    if (args.assigneeId !== undefined) {
      const teamId = task.teamId;
      if (!teamId) {
        throw new Error("Solo las tareas de equipo se pueden asignar");
      }
      const newAssignee = args.assigneeId;
      if (newAssignee && !(await isTeamMember(ctx, teamId, newAssignee))) {
        throw new Error("La persona asignada no está en el equipo");
      }
      patch.assigneeId = newAssignee ?? undefined;
    }

    await ctx.db.patch(args.taskId, patch);
  },
});

export const toggleComplete = mutation({
  args: { taskId: v.id("tasks"), today: v.optional(v.string()) },
  handler: async (ctx, { taskId, today }) => {
    const userId = await requireUser(ctx);
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Tarea no encontrada");
    await assertAccess(ctx, task, userId);

    const completing = !task.completed;
    const recurrence = task.recurrence;

    // Completing a recurring task: keep this one as completed history and
    // spawn the next occurrence as a fresh, active task.
    if (completing && recurrence) {
      const base = task.dueDate ?? today ?? utcToYmd(new Date());
      await ctx.db.insert("tasks", {
        title: task.title,
        priority: task.priority,
        completed: false,
        dueDate: nextOccurrence(base, recurrence),
        note: task.note,
        creatorId: task.creatorId,
        teamId: task.teamId,
        assigneeId: task.assigneeId,
        recurrence,
      });
      await ctx.db.patch(taskId, { completed: true, recurrence: undefined });
    } else {
      await ctx.db.patch(taskId, { completed: completing });
    }
  },
});

export const deleteTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const userId = await requireUser(ctx);
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Tarea no encontrada");
    await assertAccess(ctx, task, userId);

    const dayRows = await ctx.db
      .query("myDay")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    for (const row of dayRows) await ctx.db.delete(row._id);

    await ctx.db.delete(taskId);
  },
});

// Add/remove a task from MY "Mi día" for the given date.
export const setMyDay = mutation({
  args: {
    taskId: v.id("tasks"),
    today: v.string(),
    inMyDay: v.boolean(),
  },
  handler: async (ctx, { taskId, today, inMyDay }) => {
    const userId = await requireUser(ctx);
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Tarea no encontrada");
    await assertAccess(ctx, task, userId);

    const todays = await ctx.db
      .query("myDay")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", today),
      )
      .collect();
    const existing = todays.find((r) => r.taskId === taskId);

    if (inMyDay && !existing) {
      await ctx.db.insert("myDay", { userId, taskId, date: today });
    } else if (!inMyDay && existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
