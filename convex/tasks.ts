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
  interval?: number;
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
  const n = Math.max(1, rec.interval ?? 1);
  const d = ymdToUTC(base);
  switch (rec.type) {
    case "daily":
      return utcToYmd(addDays(d, n));
    case "weekly":
      return utcToYmd(addDays(d, 7 * n));
    case "monthly": {
      const r = new Date(d);
      const day = r.getUTCDate();
      r.setUTCMonth(r.getUTCMonth() + n);
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
      // For custom days with interval > 1, skip N-1 whole weeks between occurrences
      const days = rec.days && rec.days.length ? [...rec.days].sort((a, b) => a - b) : [d.getUTCDay()];
      let next = addDays(d, 1);
      // Find the next matching weekday
      for (let i = 0; i < 14; i++) {
        if (days.includes(next.getUTCDay())) {
          if (n <= 1) return utcToYmd(next);
          // Skip (n-1) full weeks from this occurrence
          return utcToYmd(addDays(next, 7 * (n - 1)));
        }
        next = addDays(next, 1);
      }
      return utcToYmd(addDays(d, 7 * n));
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
// if it belongs to a team they are a member of,
// or if it lives inside a project they have been invited to.
export async function assertAccess(
  ctx: QueryCtx | MutationCtx,
  task: Doc<"tasks">,
  userId: Id<"users">,
) {
  if (task.teamId) {
    if (!(await isTeamMember(ctx, task.teamId, userId))) {
      throw new Error("No tienes acceso a esta tarea");
    }
    return;
  }
  if (task.creatorId === userId) return;

  // Check project sharing: either this task is a shared project,
  // or it lives inside one (parentTaskId → project).
  const projectId = task.isProject ? task._id : task.parentTaskId;
  if (projectId) {
    const member = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_user", (q) =>
        q.eq("projectId", projectId as Id<"tasks">).eq("userId", userId),
      )
      .unique();
    if (member) return;
  }

  throw new Error("No tienes acceso a esta tarea");
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

// Top-level filter: only tasks with no parent and that are not projects
// appear in the main lists. Project tasks stay inside their project.
function isTopLevel(_ctx: QueryCtx, task: Doc<"tasks">) {
  if (task.isProject) return false;
  if (task.parentTaskId) return false;
  return true;
}

/* ---------- queries ---------- */

// All tags owned by this user, scoped to a single entorno. Stored in
// userTags table (persistent) plus any tags still on tasks created by the
// user (backward compat). Does NOT include tags from tasks merely assigned
// to this user, and never mixes tags across entornos.
export const listAllTags = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const filterWS = workspaceId ?? null;

    // Explicit user tag store (persists even when removed from tasks)
    const stored = await ctx.db
      .query("userTags")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Backward-compat: also surface tags on tasks the user created
    const created = await ctx.db
      .query("tasks")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .collect();

    const tagSet = new Set<string>(
      stored.filter((t) => (t.workspaceId ?? null) === filterWS).map((t) => t.name),
    );
    for (const t of created) {
      if ((t.workspaceId ?? null) !== filterWS) continue;
      for (const tag of t.tags ?? []) tagSet.add(tag);
    }
    return Array.from(tagSet).sort();
  },
});

// Helper: upsert a tag into the user's personal tag library.
async function ensureUserTag(
  ctx: MutationCtx,
  userId: Id<"users">,
  name: string,
  workspaceId?: Id<"workspaces">,
) {
  const existing = await ctx.db
    .query("userTags")
    .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("name", name))
    .unique();
  if (!existing) {
    await ctx.db.insert("userTags", { userId, name, workspaceId });
  }
}

export const deleteUserTag = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("userTags")
      .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("name", name))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

// Fetch a single task enriched with names / myDay flag.
// Returns null if the task doesn't exist or the caller has no access.
export const getTask = query({
  args: { taskId: v.id("tasks"), today: v.optional(v.string()) },
  handler: async (ctx, { taskId, today }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const task = await ctx.db.get(taskId);
    if (!task) return null;
    try {
      await assertAccess(ctx, task, userId);
    } catch {
      return null;
    }
    const myDayRows = await ctx.db
      .query("myDay")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    const inMyDay = myDayRows.some((r) => r.userId === userId);
    const myDaySet = inMyDay ? new Set([taskId as string]) : new Set<string>();
    return enrich(ctx, task, myDaySet);
  },
});

// Personal tasks: created by me and not attached to a team.
export const listPersonal = query({
  args: {
    today: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, { today, workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const all = await ctx.db
      .query("tasks")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .collect();
    const personal = [];
    const filterWS = workspaceId ?? null;
    for (const t of all) {
      if (t.teamId) continue;
      if (t.listId) continue;                         // las listas tienen su propia vista
      if ((t.workspaceId ?? null) !== filterWS) continue;
      if (isTopLevel(ctx, t)) personal.push(t);
    }
    const myDaySet = await myDayTaskIds(ctx, userId, today);
    return Promise.all(personal.map((t) => enrich(ctx, t, myDaySet)));
  },
});

// Tasks belonging to a specific list.
export const listByList = query({
  args: { listId: v.id("lists"), today: v.optional(v.string()) },
  handler: async (ctx, { listId, today }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    // Verify the list belongs to this user
    const list = await ctx.db.get(listId);
    if (!list || list.ownerId !== userId) return [];

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_list", (q) => q.eq("listId", listId))
      .collect();

    const myDaySet = await myDayTaskIds(ctx, userId, today);
    const visible = tasks.filter((t) => isTopLevel(ctx, t));
    return Promise.all(visible.map((t) => enrich(ctx, t, myDaySet)));
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
      if (isTopLevel(ctx, t)) filtered.push(t);
    }
    const myDaySet = await myDayTaskIds(ctx, userId, today);
    return Promise.all(filtered.map((t) => enrich(ctx, t, myDaySet)));
  },
});

// Tasks I added to "Mi día" for the given date.
export const listMyDay = query({
  args: { today: v.string(), workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, { today, workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("myDay")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", userId).eq("date", today),
      )
      .collect();
    const myDaySet = new Set(rows.map((r) => r.taskId as string));
    const filterWS = workspaceId ?? null;
    const tasks = [];
    for (const row of rows) {
      const task = await ctx.db.get(row.taskId);
      if (!task) continue;
      if (task.isProject) continue;
      if (task.parentTaskId) {
        const parent = await ctx.db.get(task.parentTaskId);
        if (parent && !parent.isProject) continue;
      }
      // Filter by workspace: personal tasks by workspaceId, team tasks by team's workspace
      if (task.teamId) {
        const team = await ctx.db.get(task.teamId);
        if ((team?.workspaceId ?? null) !== filterWS) continue;
      } else {
        if ((task.workspaceId ?? null) !== filterWS) continue;
      }
      tasks.push(await enrich(ctx, task, myDaySet));
    }

    // Also include personal tasks due today or overdue (not yet in myDay)
    const createdByMe = await ctx.db
      .query("tasks")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .collect();
    for (const t of createdByMe) {
      if (myDaySet.has(t._id)) continue;
      if (!t.dueDate || t.dueDate > today) continue;
      if (t.completed) continue;
      if (t.isProject) continue;
      if (t.teamId) continue;
      if ((t.workspaceId ?? null) !== filterWS) continue;
      if (t.parentTaskId) {
        const parent = await ctx.db.get(t.parentTaskId);
        if (parent && !parent.isProject) continue;
      }
      tasks.push(await enrich(ctx, t, myDaySet));
    }

    // Also include team tasks assigned to me due today or overdue (not yet in myDay)
    const assignedToMe = await ctx.db
      .query("tasks")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", userId))
      .collect();
    for (const t of assignedToMe) {
      if (myDaySet.has(t._id)) continue;
      if (!t.dueDate || t.dueDate > today) continue;
      if (t.completed) continue;
      if (!t.teamId) continue;
      const team = await ctx.db.get(t.teamId);
      if ((team?.workspaceId ?? null) !== filterWS) continue;
      tasks.push(await enrich(ctx, t, myDaySet));
    }

    // Include projects with a reviewDate due today or overdue
    for (const p of createdByMe) {
      if (!p.isProject) continue;
      if (!p.reviewDate || p.reviewDate > today) continue;
      if ((p.workspaceId ?? null) !== filterWS) continue;
      if (tasks.some((t) => t._id === p._id)) continue;
      tasks.push(await enrich(ctx, { ...p, dueDate: p.reviewDate } as Doc<"tasks">, myDaySet));
    }

    return tasks;
  },
});

// Planned: personal tasks of mine with a due date, plus team tasks
// ASSIGNED TO ME with a due date. A team task only shows here for the
// person it is assigned to.
export const listPlanned = query({
  args: { today: v.string(), workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, { today, workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const filterWS = workspaceId ?? null;

    const created = await ctx.db
      .query("tasks")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .collect();

    const personalWithDue = [];
    for (const t of created) {
      if (t.teamId) continue;
      if (!t.dueDate) continue;
      if ((t.workspaceId ?? null) !== filterWS) continue;
      if (isTopLevel(ctx, t)) personalWithDue.push(t);
    }

    const assigned = await ctx.db
      .query("tasks")
      .withIndex("by_assignee", (q) => q.eq("assigneeId", userId))
      .collect();
    const teamWithDue = [];
    for (const t of assigned) {
      if (!t.teamId) continue;
      if (!t.dueDate) continue;
      const team = await ctx.db.get(t.teamId);
      if ((team?.workspaceId ?? null) !== filterWS) continue;
      if (isTopLevel(ctx, t)) teamWithDue.push(t);
    }

    // Projects with a reviewDate (shown as "pending review" in Planeado)
    const projectReviews: Doc<"tasks">[] = [];
    for (const t of created) {
      if (!t.isProject) continue;
      if (!t.reviewDate) continue;
      if ((t.workspaceId ?? null) !== filterWS) continue;
      projectReviews.push({ ...t, dueDate: t.reviewDate } as Doc<"tasks">);
    }

    const combined = [...personalWithDue, ...teamWithDue, ...projectReviews];
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
    workspaceId: v.optional(v.id("workspaces")),
    tags: v.optional(v.array(v.string())),
    listId: v.optional(v.id("lists")),
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

    const cleanTags = (args.tags ?? [])
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

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
      workspaceId: args.workspaceId,
      tags: cleanTags.length > 0 ? cleanTags : undefined,
      listId: args.listId,
    });

    // Persist new tags in the user's tag library
    for (const tag of cleanTags) {
      await ensureUserTag(ctx, userId, tag, args.workspaceId);
    }

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
    tags: v.optional(v.union(v.array(v.string()), v.null())),
    listId: v.optional(v.union(v.id("lists"), v.null())),
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
      tags?: string[];
      listId?: Id<"lists">;
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
    if (args.tags !== undefined) {
      const newTags = args.tags ?? undefined;
      patch.tags = newTags;
      // Persist any new tags in the user's tag library
      for (const tag of newTags ?? []) {
        await ensureUserTag(ctx, userId, tag, task.workspaceId);
      }
    }
    if (args.listId !== undefined) {
      patch.listId = args.listId ?? undefined;
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
      const today_s = today ?? utcToYmd(new Date());
      // If the task had no due date, or was overdue when completed,
      // calculate the next occurrence from today so it never lands in the past.
      const base =
        task.dueDate && task.dueDate >= today_s ? task.dueDate : today_s;
      const nextDue = nextOccurrence(base, recurrence);

      await ctx.db.insert("tasks", {
        title: task.title,
        priority: task.priority,
        completed: false,
        dueDate: nextDue,
        note: task.note,
        creatorId: task.creatorId,
        teamId: task.teamId,
        assigneeId: task.assigneeId,
        recurrence,
        workspaceId: task.workspaceId,
        tags: task.tags,
        listId: task.listId,
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

export const bulkUpdate = mutation({
  args: {
    taskIds: v.array(v.id("tasks")),
    priority: v.optional(priorityValidator),
    dueDate: v.optional(v.union(v.string(), v.null())),
    addTags: v.optional(v.array(v.string())),
    listId: v.optional(v.union(v.id("lists"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    for (const taskId of args.taskIds) {
      const task = await ctx.db.get(taskId);
      if (!task) continue;
      try { await assertAccess(ctx, task, userId); } catch { continue; }
      const patch: {
        priority?: "baja" | "media" | "alta" | "urgente";
        dueDate?: string;
        tags?: string[];
        listId?: Id<"lists">;
      } = {};
      if (args.priority !== undefined) patch.priority = args.priority;
      if (args.dueDate !== undefined) patch.dueDate = args.dueDate ?? undefined;
      if (args.addTags && args.addTags.length > 0) {
        patch.tags = [...new Set([...(task.tags ?? []), ...args.addTags])];
        for (const tag of args.addTags) {
          await ensureUserTag(ctx, userId, tag, task.workspaceId);
        }
      }
      if (args.listId !== undefined) patch.listId = args.listId ?? undefined;
      await ctx.db.patch(taskId, patch);
    }
  },
});

export const bulkDelete = mutation({
  args: { taskIds: v.array(v.id("tasks")) },
  handler: async (ctx, { taskIds }) => {
    const userId = await requireUser(ctx);
    for (const taskId of taskIds) {
      const task = await ctx.db.get(taskId);
      if (!task) continue;
      try { await assertAccess(ctx, task, userId); } catch { continue; }
      await cascadeDelete(ctx, taskId);
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

  const atts = await ctx.db
    .query("attachments")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();
  for (const a of atts) {
    try {
      await ctx.storage.delete(a.storageId);
    } catch {
      // storage already gone
    }
    await ctx.db.delete(a._id);
  }

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
