import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { isWorkspaceMember } from "./workspaces";

export const LIST_COLORS = [
  "#ef4444", // rojo
  "#f97316", // naranja
  "#eab308", // amarillo
  "#22c55e", // verde
  "#06b6d4", // cian
  "#3b82f6", // azul (defecto)
  "#8b5cf6", // morado
  "#ec4899", // rosa
];

export const DEFAULT_COLOR = "#3b82f6";

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("No has iniciado sesión");
  return userId;
}

/* ---------- queries ---------- */

export const listMyLists = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    if (workspaceId && !(await isWorkspaceMember(ctx, workspaceId, userId)))
      return [];
    const filterWS = workspaceId ?? null;

    const rows = await ctx.db
      .query("lists")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();

    return rows
      .filter((l) => (l.workspaceId ?? null) === filterWS)
      .sort((a, b) => a._creationTime - b._creationTime)
      .map((l) => ({
        _id: l._id,
        name: l.name,
        color: l.color ?? DEFAULT_COLOR,
        workspaceId: l.workspaceId ?? null,
      }));
  },
});

/* ---------- mutations ---------- */

export const createList = mutation({
  args: {
    name: v.string(),
    color: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, { name, color, workspaceId }) => {
    const userId = await requireUser(ctx);
    if (workspaceId && !(await isWorkspaceMember(ctx, workspaceId, userId)))
      throw new Error("No perteneces a ese entorno");
    const clean = name.trim();
    if (!clean) throw new Error("La lista necesita un nombre");
    return await ctx.db.insert("lists", {
      name: clean,
      color: color ?? DEFAULT_COLOR,
      ownerId: userId,
      workspaceId,
    });
  },
});

export const renameList = mutation({
  args: { listId: v.id("lists"), name: v.string() },
  handler: async (ctx, { listId, name }) => {
    const userId = await requireUser(ctx);
    const list = await ctx.db.get(listId);
    if (!list) throw new Error("Lista no encontrada");
    if (list.ownerId !== userId) throw new Error("Sin acceso");
    const clean = name.trim();
    if (!clean) throw new Error("La lista necesita un nombre");
    await ctx.db.patch(listId, { name: clean });
  },
});

export const setListColor = mutation({
  args: { listId: v.id("lists"), color: v.string() },
  handler: async (ctx, { listId, color }) => {
    const userId = await requireUser(ctx);
    const list = await ctx.db.get(listId);
    if (!list) throw new Error("Lista no encontrada");
    if (list.ownerId !== userId) throw new Error("Sin acceso");
    await ctx.db.patch(listId, { color });
  },
});

export const deleteList = mutation({
  args: { listId: v.id("lists") },
  handler: async (ctx, { listId }) => {
    const userId = await requireUser(ctx);
    const list = await ctx.db.get(listId);
    if (!list) throw new Error("Lista no encontrada");
    if (list.ownerId !== userId) throw new Error("Sin acceso");

    // Desvincular todas las tareas de esta lista (no se eliminan)
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_list", (q) => q.eq("listId", listId))
      .collect();
    for (const t of tasks) {
      await ctx.db.patch(t._id, { listId: undefined });
    }

    await ctx.db.delete(listId);
  },
});
