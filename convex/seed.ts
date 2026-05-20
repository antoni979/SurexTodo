import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Admin-only helper (callable via `npx convex run`) to set a user's
// username/profile by email. Not exposed to the client.
export const setProfile = internalMutation({
  args: { email: v.string(), username: v.string() },
  handler: async (ctx, { email, username }) => {
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), email))
      .unique();
    if (!user) throw new Error(`No existe ningún usuario con el email ${email}`);

    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { username });
    } else {
      await ctx.db.insert("profiles", { userId: user._id, username });
    }
    return { email, username };
  },
});
