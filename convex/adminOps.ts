import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// List all profiles (CLI use only)
export const listProfiles = query({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("profiles").collect();
    return profiles.map((p) => ({ userId: p.userId, username: p.username }));
  },
});

// List all workspaces (CLI use only)
export const listWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    const ws = await ctx.db.query("workspaces").collect();
    return ws.map((w) => ({ _id: w._id, name: w.name, ownerId: w.ownerId }));
  },
});

// Add users to a workspace by partial username match, migrate their tasks, delete named workspace
export const setupUsers = mutation({
  args: {
    targetWorkspaceName: v.string(),   // e.g. "Surexport"
    usernames: v.array(v.string()),    // partial matches, e.g. ["vicente","javi","laura"]
    deleteWorkspaceName: v.optional(v.string()), // e.g. "Personal" if it exists as a real workspace
  },
  handler: async (ctx, { targetWorkspaceName, usernames, deleteWorkspaceName }) => {
    const log: string[] = [];

    // Find target workspace
    const allWorkspaces = await ctx.db.query("workspaces").collect();
    const target = allWorkspaces.find(
      (w) => w.name.toLowerCase() === targetWorkspaceName.toLowerCase(),
    );
    if (!target) throw new Error(`Workspace "${targetWorkspaceName}" not found`);
    const workspaceId = target._id;

    // Find matching users
    const profiles = await ctx.db.query("profiles").collect();
    const matched = profiles.filter((p) =>
      usernames.some((u) => p.username.toLowerCase().includes(u.toLowerCase())),
    );
    log.push(`Found users: ${matched.map((p) => p.username).join(", ")}`);

    // Add each user to the workspace (if not already member)
    for (const profile of matched) {
      const existing = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspaceId", workspaceId).eq("userId", profile.userId),
        )
        .unique();
      if (!existing) {
        await ctx.db.insert("workspaceMembers", {
          workspaceId,
          userId: profile.userId,
        });
        log.push(`Added ${profile.username} to ${targetWorkspaceName}`);
      } else {
        log.push(`${profile.username} already in ${targetWorkspaceName}`);
      }

      // Migrate their tasks (workspaceId=null) to target workspace
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_creator", (q) => q.eq("creatorId", profile.userId))
        .collect();
      let migrated = 0;
      for (const task of tasks) {
        if (!task.workspaceId) {
          await ctx.db.patch(task._id, { workspaceId });
          migrated++;
        }
      }
      log.push(`Migrated ${migrated} tasks for ${profile.username}`);
    }

    // Optionally delete a workspace by name
    if (deleteWorkspaceName) {
      const toDelete = allWorkspaces.find(
        (w) => w.name.toLowerCase() === deleteWorkspaceName.toLowerCase(),
      );
      if (toDelete) {
        // First migrate its tasks to target
        const tasks = await ctx.db.query("tasks").collect();
        let moved = 0;
        for (const task of tasks) {
          if (task.workspaceId === toDelete._id) {
            await ctx.db.patch(task._id, { workspaceId });
            moved++;
          }
        }
        // Also migrate teams
        const teams = await ctx.db.query("teams").collect();
        for (const team of teams) {
          if (team.workspaceId === toDelete._id) {
            await ctx.db.patch(team._id, { workspaceId });
          }
        }
        // Delete workspace members
        const members = await ctx.db
          .query("workspaceMembers")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", toDelete._id))
          .collect();
        for (const m of members) await ctx.db.delete(m._id);
        // Delete workspace
        await ctx.db.delete(toDelete._id);
        log.push(`Deleted workspace "${deleteWorkspaceName}", moved ${moved} tasks to ${targetWorkspaceName}`);
      } else {
        log.push(`Workspace "${deleteWorkspaceName}" not found — nothing to delete`);
      }
    }

    return log;
  },
});
