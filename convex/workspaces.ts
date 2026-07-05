import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("No has iniciado sesión");
  return userId;
}

async function isMember(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
) {
  const row = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId),
    )
    .unique();
  return row !== null;
}

export const listMyWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const workspaces = [];
    for (const m of memberships) {
      const ws = await ctx.db.get(m.workspaceId);
      if (ws) workspaces.push(ws);
    }
    workspaces.sort((a, b) => a.name.localeCompare(b.name));
    return workspaces;
  },
});

export const createWorkspace = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await requireUser(ctx);
    const clean = name.trim();
    if (!clean) throw new Error("El entorno necesita un nombre");
    const workspaceId = await ctx.db.insert("workspaces", {
      name: clean,
      ownerId: userId,
    });
    await ctx.db.insert("workspaceMembers", { workspaceId, userId });
    return workspaceId;
  },
});

// Only the workspace owner can see who's addable — otherwise this would
// leak every registered username (including people from other companies)
// to any member of the workspace.
export const listAddableUsers = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const ws = await ctx.db.get(workspaceId);
    if (!ws || ws.ownerId !== userId) return [];
    const memberRows = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const memberSet = new Set(memberRows.map((r) => r.userId as string));
    const profiles = await ctx.db.query("profiles").collect();
    return profiles
      .filter((p) => !memberSet.has(p.userId as string))
      .map((p) => ({ userId: p.userId, username: p.username }))
      .sort((a, b) => a.username.localeCompare(b.username));
  },
});

export const addMember = mutation({
  args: { workspaceId: v.id("workspaces"), userId: v.id("users") },
  handler: async (ctx, { workspaceId, userId }) => {
    const me = await requireUser(ctx);
    const ws = await ctx.db.get(workspaceId);
    if (!ws) throw new Error("Entorno no encontrado");
    if (ws.ownerId !== me)
      throw new Error("Solo el propietario puede añadir miembros");
    if (await isMember(ctx, workspaceId, userId))
      throw new Error("Ese usuario ya está en el entorno");
    await ctx.db.insert("workspaceMembers", { workspaceId, userId });
  },
});

// Migrates all tasks and teams that have no workspaceId to the named workspace.
// Runs without auth check — only call from CLI/dashboard.
export const migrateAllToWorkspace = mutation({
  args: { workspaceName: v.string() },
  handler: async (ctx, { workspaceName }) => {
    const allWorkspaces = await ctx.db.query("workspaces").collect();
    const ws = allWorkspaces.find(
      (w) => w.name.toLowerCase() === workspaceName.toLowerCase(),
    );
    if (!ws) throw new Error(`Entorno "${workspaceName}" no encontrado`);
    const workspaceId = ws._id;

    // Migrate teams
    const allTeams = await ctx.db.query("teams").collect();
    let teamsUpdated = 0;
    for (const team of allTeams) {
      if (!team.workspaceId) {
        await ctx.db.patch(team._id, { workspaceId });
        teamsUpdated++;
      }
    }

    // Migrate tasks (top-level only — subtasks inherit via their parent)
    const allTasks = await ctx.db.query("tasks").collect();
    let tasksUpdated = 0;
    for (const task of allTasks) {
      if (!task.workspaceId) {
        await ctx.db.patch(task._id, { workspaceId });
        tasksUpdated++;
      }
    }

    return { teamsUpdated, tasksUpdated };
  },
});

export const renameWorkspace = mutation({
  args: { workspaceId: v.id("workspaces"), name: v.string() },
  handler: async (ctx, { workspaceId, name }) => {
    const userId = await requireUser(ctx);
    const ws = await ctx.db.get(workspaceId);
    if (!ws) throw new Error("Entorno no encontrado");
    if (ws.ownerId !== userId) throw new Error("Solo el propietario puede renombrarlo");
    const clean = name.trim();
    if (!clean) throw new Error("El entorno necesita un nombre");
    await ctx.db.patch(workspaceId, { name: clean });
  },
});
