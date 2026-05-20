import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return {
      userId,
      username: profile?.username ?? null,
    };
  },
});

export const setUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("No has iniciado sesión");

    const clean = username.trim().replace(/\s+/g, " ");
    if (clean.length < 2) {
      throw new Error("El nombre debe tener al menos 2 caracteres");
    }
    if (clean.length > 30) {
      throw new Error("El nombre no puede superar los 30 caracteres");
    }
    if (!/^[\p{L}\p{N} ._'-]+$/u.test(clean)) {
      throw new Error("El nombre contiene caracteres no permitidos");
    }

    const taken = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", clean))
      .unique();
    if (taken && taken.userId !== userId) {
      throw new Error("Ese nombre de usuario ya está en uso");
    }

    const mine = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (mine) {
      await ctx.db.patch(mine._id, { username: clean });
    } else {
      await ctx.db.insert("profiles", { userId, username: clean });
    }
    return clean;
  },
});
