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

export const listAddableUsers = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    if (!(await isMember(ctx, workspaceId, userId))) return [];
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
    if (!(await isMember(ctx, workspaceId, me)))
      throw new Error("No perteneces a este entorno");
    if (await isMember(ctx, workspaceId, userId))
      throw new Error("Ese usuario ya está en el entorno");
    await ctx.db.insert("workspaceMembers", { workspaceId, userId });
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
