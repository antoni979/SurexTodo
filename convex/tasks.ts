import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  priorityValidator,
  recurrenceValidator,
  kanbanStatusValidator,
} from "./schema";

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
export async function assertAccess(
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
  // Subtasks summary for normal tasks (and project root cards).
  const childRows = await ctx.db
    .query("tasks")
    .withIndex("by_parent", (q) => q.eq("parentTaskId", task._id))
    .collect();
  const subtaskTotal = childRows.length;
  const subtaskDone = childRows.filter((c) => c.completed).length;

  let projectName: string | null = null;
  if (task.parentTaskId) {
    const parent = await ctx.db.get(task.parentTaskId);
    if (parent?.isProject) projectName = parent.title;
  }

  return {
    ...task,
    creatorName: await nameOf(ctx, task.creatorId),
    assigneeName: await nameOf(ctx, task.assigneeId),
    teamName,
    inMyDay: myDaySet.has(task._id),
    subtaskTotal,
    subtaskDone,
    projectName,
  };
}

// Top-level filter: hide subtasks (anything with a non-project parent)
// from the main lists. Project root tasks (isProject=true) are also
// hidden — they live in the Proyectos section.
async function isTopLevel(ctx: QueryCtx, task: Doc<"tasks">) {
  if (task.isProject) return false;
  if (!task.parentTaskId) return true;
  const parent = await ctx.db.get(task.parentTaskId);
  // If parent is a project, this task is a "project task" and we still
  // want it to show in the main lists (it's a real working task).
  return !!parent?.isProject;
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
    const personal = [];
    for (const t of all) {
      if (t.teamId) continue;
      if (await isTopLevel(ctx, t)) personal.push(t);
    }
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
    const filtered = [];
    for (const t of tasks) {
      if (await isTopLevel(ctx, t)) filtered.push(t);
    }
    const myDaySet = await myDayTaskIds(ctx, userId, today);
    return Promise.all(filtered.map((t) => enrich(ctx, t, myDaySet)));
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
      if (!task) continue;
      if (task.isProject) continue;
      // Subtasks (parent is a normal task) hidden, but project tasks ok.
      if (task.parentTaskId) {
        const parent = await ctx.db.get(task.parentTaskId);
        if (parent && !parent.isProject) continue;
      }
      tasks.push(await enrich(ctx, task, myDaySet));
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

    const personalWithDue = [];
    for (const t of created) {
      if (t.teamId) continue;
      if (!t.dueDate) continue;
      if (await isTopLevel(ctx, t)) personalWithDue.push(t);
    }

    const assigned = await ctx.db
      .query("tasks")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", userId))
      .collect();
    const teamWithDue = [];
    for (const t of assigned) {
      if (!t.teamId) continue;
      if (!t.dueDate) continue;
      if (await isTopLevel(ctx, t)) teamWithDue.push(t);
    }

    const combined = [...personalWithDue, ...teamWithDue];
    const myDaySet = await myDayTaskIds(ctx, userId, today);
    return Promise.all(combined.map((t) => enrich(ctx, t, myDaySet)));
  },
});

// Subtasks for a given parent (returned in creation order).
export const listSubtasks = query({
  args: { parentId: v.id("tasks") },
  handler: async (ctx, { parentId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const parent = await ctx.db.get(parentId);
    if (!parent) return [];
    await assertAccess(ctx, parent, userId);
    const subs = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", parentId))
      .collect();
    subs.sort((a, b) => a._creationTime - b._creationTime);
    return subs.map((s) => ({
      _id: s._id,
      _creationTime: s._creationTime,
      title: s.title,
      completed: s.completed,
      dueDate: s.dueDate ?? null,
    }));
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
    parentTaskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const title = args.title.trim();
    if (!title) throw new Error("La tarea necesita un título");

    let teamId = args.teamId;
    let assigneeId = args.assigneeId;

    // If creating as a child, inherit the parent's team and validate access.
    if (args.parentTaskId) {
      const parent = await ctx.db.get(args.parentTaskId);
      if (!parent) throw new Error("Tarea padre no encontrada");
      await assertAccess(ctx, parent, userId);
      teamId = parent.teamId;
    }

    if (teamId) {
      if (!(await isTeamMember(ctx, teamId, userId))) {
        throw new Error("No perteneces a este equipo");
      }
      if (assigneeId && !(await isTeamMember(ctx, teamId, assigneeId))) {
        throw new Error("La persona asignada no está en el equipo");
      }
    } else {
      assigneeId = undefined;
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
      parentTaskId: args.parentTaskId,
      kanbanStatus: args.parentTaskId ? "todo" : undefined,
    });

    if (args.addToMyDay && args.today) {
      await ctx.db.insert("myDay", { userId, taskId, date: args.today });
    }
    return taskId;
  },
});

// Quick subtask: only title + optional date.
export const createSubtask = mutation({
  args: {
    parentId: v.id("tasks"),
    title: v.string(),
    dueDate: v.optional(v.string()),
  },
  handler: async (ctx, { parentId, title, dueDate }) => {
    const userId = await requireUser(ctx);
    const parent = await ctx.db.get(parentId);
    if (!parent) throw new Error("Tarea padre no encontrada");
    await assertAccess(ctx, parent, userId);
    const clean = title.trim();
    if (!clean) throw new Error("La subtarea necesita un título");
    return await ctx.db.insert("tasks", {
      title: clean,
      priority: "media",
      completed: false,
      dueDate: dueDate || undefined,
      creatorId: userId,
      teamId: parent.teamId,
      parentTaskId: parentId,
    });
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
      const patch: { completed: boolean; kanbanStatus?: "todo" | "done" } = {
        completed: completing,
      };
      // Auto-move on the kanban when this is a project child.
      if (task.parentTaskId) {
        patch.kanbanStatus = completing ? "done" : "todo";
      }
      await ctx.db.patch(taskId, patch);
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

    await cascadeDelete(ctx, taskId);
  },
});

async function cascadeDelete(ctx: MutationCtx, taskId: Id<"tasks">) {
  // Children (subtasks or project tasks)
  const children = await ctx.db
    .query("tasks")
    .withIndex("by_parent", (q) => q.eq("parentTaskId", taskId))
    .collect();
  for (const c of children) await cascadeDelete(ctx, c._id);

  // Milestones + links if this was a project
  const ms = await ctx.db
    .query("milestones")
    .withIndex("by_project", (q) => q.eq("projectId", taskId))
    .collect();
  for (const m of ms) await ctx.db.delete(m._id);
  const links = await ctx.db
    .query("projectLinks")
    .withIndex("by_project", (q) => q.eq("projectId", taskId))
    .collect();
  for (const l of links) await ctx.db.delete(l._id);

  const dayRows = await ctx.db
    .query("myDay")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  for (const row of dayRows) await ctx.db.delete(row._id);

  await ctx.db.delete(taskId);
}

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

/* ---------- kanban ---------- */

export const moveTaskInKanban = mutation({
  args: {
    taskId: v.id("tasks"),
    status: kanbanStatusValidator,
  },
  handler: async (ctx, { taskId, status }) => {
    const userId = await requireUser(ctx);
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Tarea no encontrada");
    await assertAccess(ctx, task, userId);
    if (!task.parentTaskId) {
      throw new Error("Solo las tareas dentro de un proyecto van al tablero");
    }
    const patch: {
      kanbanStatus: "todo" | "in_progress" | "done";
      completed?: boolean;
    } = { kanbanStatus: status };
    if (status === "done" && !task.completed) patch.completed = true;
    if (status !== "done" && task.completed) patch.completed = false;
    await ctx.db.patch(taskId, patch);
  },
});
