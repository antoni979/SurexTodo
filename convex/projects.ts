import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { projectStatusValidator } from "./schema";
import { assertAccess } from "./tasks";

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

async function assertProjectAccess(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"tasks">,
  userId: Id<"users">,
) {
  const p = await ctx.db.get(projectId);
  if (!p) throw new Error("Proyecto no encontrado");
  if (!p.isProject) throw new Error("Esa tarea no es un proyecto");
  await assertAccess(ctx, p, userId);
  return p;
}

function projectProgress(children: Doc<"tasks">[]) {
  if (children.length === 0) return 0;
  const done = children.filter((c) => c.completed).length;
  return Math.round((done / children.length) * 100);
}

/* ---------- queries ---------- */

// List all projects the user can see: personal projects + team projects
// from teams they belong to.
export const listMyProjects = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const filterWS = workspaceId ?? null;

    // Personal projects (created by me, no team, matching workspace)
    const mine = await ctx.db
      .query("tasks")
      .withIndex("by_creator", (q) => q.eq("creatorId", userId))
      .collect();
    const personalProjects = mine.filter(
      (t) => t.isProject && !t.teamId && (t.workspaceId ?? null) === filterWS,
    );

    // Team projects (teams I'm in, matching workspace)
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const teamProjects: Doc<"tasks">[] = [];
    for (const m of memberships) {
      const team = await ctx.db.get(m.teamId);
      if (!team) continue;
      if ((team.workspaceId ?? null) !== filterWS) continue;
      const ts = await ctx.db
        .query("tasks")
        .withIndex("by_team", (q) => q.eq("teamId", m.teamId))
        .collect();
      for (const t of ts) if (t.isProject) teamProjects.push(t);
    }

    const all = [...personalProjects, ...teamProjects];
    // Deduplicate (shouldn't happen, but just in case)
    const seen = new Set<string>();
    const unique = all.filter((t) => {
      if (seen.has(t._id)) return false;
      seen.add(t._id);
      return true;
    });

    return Promise.all(
      unique.map(async (p) => {
        let teamName: string | null = null;
        if (p.teamId) {
          const team = await ctx.db.get(p.teamId);
          teamName = team?.name ?? null;
        }
        const children = await ctx.db
          .query("tasks")
          .withIndex("by_parent", (q) => q.eq("parentTaskId", p._id))
          .collect();
        return {
          _id: p._id,
          _creationTime: p._creationTime,
          title: p.title,
          teamId: p.teamId ?? null,
          teamName,
          projectStatus: p.projectStatus ?? "not_started",
          startDate: p.startDate ?? null,
          endDate: p.endDate ?? null,
          leadName: await nameOf(ctx, p.leadId),
          taskCount: children.length,
          progress: projectProgress(children),
          tags: p.tags ?? [],
        };
      }),
    );
  },
});

// Full project detail: project doc, tasks (with subtasks), milestones,
// links, available members (when team project).
export const getProject = query({
  args: { projectId: v.id("tasks") },
  handler: async (ctx, { projectId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const p = await ctx.db.get(projectId);
    if (!p || !p.isProject) return null;
    try {
      await assertAccess(ctx, p, userId);
    } catch {
      return null;
    }

    let teamName: string | null = null;
    let members: { userId: Id<"users">; username: string }[] = [];
    if (p.teamId) {
      const team = await ctx.db.get(p.teamId);
      teamName = team?.name ?? null;
      const memberRows = await ctx.db
        .query("teamMembers")
        .withIndex("by_team", (q) => q.eq("teamId", p.teamId!))
        .collect();
      for (const row of memberRows) {
        const prof = await ctx.db
          .query("profiles")
          .withIndex("by_user", (q) => q.eq("userId", row.userId))
          .unique();
        members.push({
          userId: row.userId,
          username: prof?.username ?? "(sin nombre)",
        });
      }
      members.sort((a, b) => a.username.localeCompare(b.username));
    }

    // Project tasks (level 1) + their subtasks (level 2)
    const children = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", projectId))
      .collect();
    const tasks = await Promise.all(
      children.map(async (c) => {
        const subs = await ctx.db
          .query("tasks")
          .withIndex("by_parent", (q) => q.eq("parentTaskId", c._id))
          .collect();
        subs.sort((a, b) => a._creationTime - b._creationTime);
        return {
          _id: c._id,
          _creationTime: c._creationTime,
          title: c.title,
          priority: c.priority,
          completed: c.completed,
          dueDate: c.dueDate ?? null,
          note: c.note ?? null,
          assigneeId: c.assigneeId ?? null,
          assigneeName: await nameOf(ctx, c.assigneeId),
          kanbanStatus: c.kanbanStatus ?? (c.completed ? "done" : "todo"),
          kanbanOrder: c.kanbanOrder ?? 0,
          subtasks: subs.map((s) => ({
            _id: s._id,
            title: s.title,
            completed: s.completed,
            dueDate: s.dueDate ?? null,
          })),
        };
      }),
    );

    const milestones = await ctx.db
      .query("milestones")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    milestones.sort((a, b) => a.order - b.order);

    const links = await ctx.db
      .query("projectLinks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();

    return {
      _id: p._id,
      title: p.title,
      description: p.description ?? "",
      startDate: p.startDate ?? null,
      endDate: p.endDate ?? null,
      projectStatus: p.projectStatus ?? "not_started",
      leadId: p.leadId ?? null,
      leadName: await nameOf(ctx, p.leadId),
      tags: p.tags ?? [],
      teamId: p.teamId ?? null,
      teamName,
      creatorId: p.creatorId,
      creatorName: await nameOf(ctx, p.creatorId),
      members,
      tasks,
      milestones: milestones.map((m) => ({
        _id: m._id,
        name: m.name,
        date: m.date ?? null,
        completed: m.completed,
        order: m.order,
      })),
      links: links.map((l) => ({
        _id: l._id,
        label: l.label,
        url: l.url,
      })),
      progress: projectProgress(children),
    };
  },
});

/* ---------- mutations: convert ---------- */

export const convertToProject = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const userId = await requireUser(ctx);
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Tarea no encontrada");
    await assertAccess(ctx, task, userId);
    if (task.isProject) return taskId;
    if (task.parentTaskId) {
      throw new Error("Una subtarea no puede convertirse en proyecto");
    }
    await ctx.db.patch(taskId, {
      isProject: true,
      projectStatus: "not_started",
      recurrence: undefined,
    });
    return taskId;
  },
});

export const convertFromProject = mutation({
  args: { projectId: v.id("tasks") },
  handler: async (ctx, { projectId }) => {
    const userId = await requireUser(ctx);
    const project = await assertProjectAccess(ctx, projectId, userId);
    const children = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", projectId))
      .collect();
    if (children.length > 0) {
      throw new Error(
        "Vacía el proyecto (sin tareas) antes de volverlo a tarea",
      );
    }
    const ms = await ctx.db
      .query("milestones")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const m of ms) await ctx.db.delete(m._id);
    const links = await ctx.db
      .query("projectLinks")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    for (const l of links) await ctx.db.delete(l._id);

    await ctx.db.patch(projectId, {
      isProject: false,
      projectStatus: undefined,
      startDate: undefined,
      endDate: undefined,
      description: undefined,
      leadId: undefined,
      tags: undefined,
    });
    void project; // silence unused
  },
});

/* ---------- mutations: project meta ---------- */

export const updateProject = mutation({
  args: {
    projectId: v.id("tasks"),
    description: v.optional(v.union(v.string(), v.null())),
    startDate: v.optional(v.union(v.string(), v.null())),
    endDate: v.optional(v.union(v.string(), v.null())),
    projectStatus: v.optional(projectStatusValidator),
    leadId: v.optional(v.union(v.id("users"), v.null())),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const project = await assertProjectAccess(ctx, args.projectId, userId);

    const patch: {
      description?: string;
      startDate?: string;
      endDate?: string;
      projectStatus?:
        | "not_started"
        | "in_progress"
        | "paused"
        | "completed"
        | "cancelled";
      leadId?: Id<"users">;
      tags?: string[];
    } = {};

    if (args.description !== undefined) {
      patch.description = args.description ?? undefined;
    }
    if (args.startDate !== undefined) {
      patch.startDate = args.startDate ?? undefined;
    }
    if (args.endDate !== undefined) {
      patch.endDate = args.endDate ?? undefined;
    }
    if (args.projectStatus !== undefined) {
      patch.projectStatus = args.projectStatus;
    }
    if (args.leadId !== undefined) {
      const leadId = args.leadId;
      if (leadId && project.teamId) {
        if (!(await isTeamMember(ctx, project.teamId, leadId))) {
          throw new Error("El responsable debe pertenecer al equipo");
        }
      }
      patch.leadId = leadId ?? undefined;
    }
    if (args.tags !== undefined) {
      patch.tags = args.tags.map((t) => t.trim()).filter((t) => t.length > 0);
    }
    await ctx.db.patch(args.projectId, patch);
  },
});

/* ---------- mutations: milestones ---------- */

export const addMilestone = mutation({
  args: {
    projectId: v.id("tasks"),
    name: v.string(),
    date: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, name, date }) => {
    const userId = await requireUser(ctx);
    await assertProjectAccess(ctx, projectId, userId);
    const clean = name.trim();
    if (!clean) throw new Error("El hito necesita un nombre");
    const existing = await ctx.db
      .query("milestones")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const maxOrder = existing.reduce(
      (m, x) => (x.order > m ? x.order : m),
      -1,
    );
    return await ctx.db.insert("milestones", {
      projectId,
      name: clean,
      date: date || undefined,
      completed: false,
      order: maxOrder + 1,
    });
  },
});

export const updateMilestone = mutation({
  args: {
    milestoneId: v.id("milestones"),
    name: v.optional(v.string()),
    date: v.optional(v.union(v.string(), v.null())),
    completed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const m = await ctx.db.get(args.milestoneId);
    if (!m) throw new Error("Hito no encontrado");
    await assertProjectAccess(ctx, m.projectId, userId);
    const patch: { name?: string; date?: string; completed?: boolean } = {};
    if (args.name !== undefined) {
      const t = args.name.trim();
      if (t) patch.name = t;
    }
    if (args.date !== undefined) patch.date = args.date ?? undefined;
    if (args.completed !== undefined) patch.completed = args.completed;
    await ctx.db.patch(args.milestoneId, patch);
  },
});

export const deleteMilestone = mutation({
  args: { milestoneId: v.id("milestones") },
  handler: async (ctx, { milestoneId }) => {
    const userId = await requireUser(ctx);
    const m = await ctx.db.get(milestoneId);
    if (!m) return;
    await assertProjectAccess(ctx, m.projectId, userId);
    await ctx.db.delete(milestoneId);
  },
});

/* ---------- mutations: project links ---------- */

export const addLink = mutation({
  args: {
    projectId: v.id("tasks"),
    label: v.string(),
    url: v.string(),
  },
  handler: async (ctx, { projectId, label, url }) => {
    const userId = await requireUser(ctx);
    await assertProjectAccess(ctx, projectId, userId);
    const lbl = label.trim();
    const u = url.trim();
    if (!u) throw new Error("El enlace necesita una URL");
    return await ctx.db.insert("projectLinks", {
      projectId,
      label: lbl || u,
      url: u,
    });
  },
});

export const deleteLink = mutation({
  args: { linkId: v.id("projectLinks") },
  handler: async (ctx, { linkId }) => {
    const userId = await requireUser(ctx);
    const l = await ctx.db.get(linkId);
    if (!l) return;
    await assertProjectAccess(ctx, l.projectId, userId);
    await ctx.db.delete(linkId);
  },
});
