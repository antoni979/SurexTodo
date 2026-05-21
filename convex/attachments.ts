import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { assertAccess } from "./tasks";

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("No has iniciado sesión");
  return userId;
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const addAttachment = mutation({
  args: {
    taskId: v.id("tasks"),
    storageId: v.id("_storage"),
    name: v.string(),
    size: v.number(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Tarea no encontrada");
    await assertAccess(ctx, task, userId);
    return await ctx.db.insert("attachments", {
      taskId: args.taskId,
      storageId: args.storageId,
      name: args.name,
      size: args.size,
      mimeType: args.mimeType,
      uploaderId: userId,
    });
  },
});

export const listAttachments = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const task = await ctx.db.get(taskId);
    if (!task) return [];
    try {
      await assertAccess(ctx, task, userId);
    } catch {
      return [];
    }
    const rows = await ctx.db
      .query("attachments")
      .withIndex("by_task", (q) => q.eq("taskId", taskId))
      .collect();
    rows.sort((a, b) => b._creationTime - a._creationTime);
    return Promise.all(
      rows.map(async (r) => ({
        _id: r._id,
        name: r.name,
        size: r.size,
        mimeType: r.mimeType,
        uploaderId: r.uploaderId,
        url: await ctx.storage.getUrl(r.storageId),
        createdAt: r._creationTime,
      })),
    );
  },
});

export const deleteAttachment = mutation({
  args: { attachmentId: v.id("attachments") },
  handler: async (ctx, { attachmentId }) => {
    const userId = await requireUser(ctx);
    const att = await ctx.db.get(attachmentId);
    if (!att) return;
    const task = await ctx.db.get(att.taskId);
    if (task) await assertAccess(ctx, task, userId);
    await ctx.storage.delete(att.storageId);
    await ctx.db.delete(attachmentId);
  },
});
