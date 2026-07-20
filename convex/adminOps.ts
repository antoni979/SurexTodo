import { mutation, query, action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { createAccount } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { insertBrainNoteWithDedup, recomputeLinks } from "./brain";

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

// One-time setup: migrate remaining orphan tasks/tags (no workspaceId) to
// Surexport, create the "Principal" workspace (owned by Antoni, no other
// members), and move any pre-existing team named "STILARO" into it under a
// neutral name so the real company name never appears in the data. Safe to
// re-run — it's idempotent (won't recreate the workspace or double count).
export const setupPrincipalAndMigrate = mutation({
  args: {},
  handler: async (ctx) => {
    const allWorkspaces = await ctx.db.query("workspaces").collect();
    const surexport = allWorkspaces.find((w) => w.name === "Surexport");
    if (!surexport) throw new Error('Workspace "Surexport" not found');

    let tasksMigrated = 0;
    const allTasks = await ctx.db.query("tasks").collect();
    for (const t of allTasks) {
      if (!t.workspaceId) {
        await ctx.db.patch(t._id, { workspaceId: surexport._id });
        tasksMigrated++;
      }
    }

    let tagsMigrated = 0;
    const allTags = await ctx.db.query("userTags").collect();
    for (const tag of allTags) {
      if (!tag.workspaceId) {
        await ctx.db.patch(tag._id, { workspaceId: surexport._id });
        tagsMigrated++;
      }
    }

    const profiles = await ctx.db.query("profiles").collect();
    const antoni = profiles.find((p) => p.username === "Antoni");
    if (!antoni) throw new Error('Profile "Antoni" not found');

    let principal = allWorkspaces.find((w) => w.name === "Principal");
    let createdPrincipal = false;
    if (!principal) {
      const id = await ctx.db.insert("workspaces", {
        name: "Principal",
        ownerId: antoni.userId,
      });
      await ctx.db.insert("workspaceMembers", {
        workspaceId: id,
        userId: antoni.userId,
      });
      principal = { _id: id, name: "Principal", ownerId: antoni.userId } as any;
      createdPrincipal = true;
    }

    const teams = await ctx.db.query("teams").collect();
    const stilaro = teams.find((t) => t.name === "STILARO");
    let renamedTeam = false;
    if (stilaro) {
      await ctx.db.patch(stilaro._id, {
        workspaceId: principal!._id,
        name: "General",
      });
      renamedTeam = true;
    }

    return {
      tasksMigrated,
      tagsMigrated,
      principalWorkspaceId: principal!._id,
      createdPrincipal,
      renamedStilaroTeam: renamedTeam,
    };
  },
});

// Deletes a workspace by name, migrating its tasks/teams to another named
// workspace first (or leaving them orphaned if no target is given). CLI-only.
export const deleteWorkspace = mutation({
  args: { name: v.string(), migrateTasksTeamsTo: v.optional(v.string()) },
  handler: async (ctx, { name, migrateTasksTeamsTo }) => {
    const all = await ctx.db.query("workspaces").collect();
    const target = all.find((w) => w.name.toLowerCase() === name.toLowerCase());
    if (!target) throw new Error(`Workspace "${name}" not found`);

    let destId: any = undefined;
    if (migrateTasksTeamsTo) {
      const dest = all.find(
        (w) => w.name.toLowerCase() === migrateTasksTeamsTo.toLowerCase(),
      );
      if (!dest) throw new Error(`Workspace "${migrateTasksTeamsTo}" not found`);
      destId = dest._id;
    }

    const tasks = await ctx.db.query("tasks").collect();
    let tasksMoved = 0;
    for (const t of tasks) {
      if (t.workspaceId === target._id) {
        await ctx.db.patch(t._id, { workspaceId: destId });
        tasksMoved++;
      }
    }

    const teams = await ctx.db.query("teams").collect();
    let teamsMoved = 0;
    for (const t of teams) {
      if (t.workspaceId === target._id) {
        await ctx.db.patch(t._id, { workspaceId: destId });
        teamsMoved++;
      }
    }

    const tags = await ctx.db.query("userTags").collect();
    let tagsMoved = 0;
    for (const t of tags) {
      if (t.workspaceId === target._id) {
        await ctx.db.patch(t._id, { workspaceId: destId });
        tagsMoved++;
      }
    }

    const lists = await ctx.db.query("lists").collect();
    let listsMoved = 0;
    for (const l of lists) {
      if (l.workspaceId === target._id) {
        await ctx.db.patch(l._id, { workspaceId: destId });
        listsMoved++;
      }
    }

    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", target._id))
      .collect();
    for (const m of members) await ctx.db.delete(m._id);

    await ctx.db.delete(target._id);

    return { tasksMoved, teamsMoved, tagsMoved, listsMoved, deletedMembers: members.length };
  },
});

// Creates a brand-new user + password account (via Convex Auth) and adds
// them straight into the given workspace, with no membership anywhere else.
// CLI-only — never exposed to the client.
export const createWorkspaceUser = action({
  args: {
    email: v.string(),
    username: v.string(),
    password: v.string(),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, { email, username, password, workspaceId }) => {
    const { user } = await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: password },
      profile: { email },
    });
    await ctx.runMutation(internal.adminOps.finishUserSetup, {
      userId: user._id,
      username,
      workspaceId,
    });
    return { userId: user._id };
  },
});

export const finishUserSetup = internalMutation({
  args: {
    userId: v.id("users"),
    username: v.string(),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, { userId, username, workspaceId }) => {
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { username });
    } else {
      await ctx.db.insert("profiles", { userId, username });
    }
    const wsMember = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", workspaceId).eq("userId", userId),
      )
      .unique();
    if (!wsMember) {
      await ctx.db.insert("workspaceMembers", { workspaceId, userId });
    }
  },
});

// Importación masiva al Segundo Cerebro de UN usuario, identificado por
// username EXACTO (no fuzzy). Piensa dos veces antes de tocar esto: si el
// username no existe o hay ambigüedad, falla fuerte — nunca hay owner por
// defecto. CLI-only, pensado para migrar un vault de Obsidian.
export const importBrainNotesForUser = mutation({
  args: {
    username: v.string(),
    notes: v.array(
      v.object({
        title: v.string(),
        body: v.string(),
        tags: v.optional(v.array(v.string())),
        properties: v.optional(v.record(v.string(), v.string())),
      }),
    ),
  },
  handler: async (ctx, { username, notes }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!profile) {
      throw new Error(
        `Username "${username}" no encontrado (exacto, sin coincidencia difusa). Abortado sin tocar nada.`,
      );
    }
    const ownerId = profile.userId;

    const log: { title: string; finalTitle: string; renamed: boolean }[] = [];
    for (const n of notes) {
      const { finalTitle, renamed } = await insertBrainNoteWithDedup(ctx, ownerId, n);
      log.push({ title: n.title, finalTitle, renamed });
    }
    return {
      ownerUsername: profile.username,
      ownerId,
      imported: log.length,
      renamedCount: log.filter((l) => l.renamed).length,
      log,
    };
  },
});

// Vuelve a extraer los [[wikilinks]] de todas las notas de UN usuario (mismo
// username exacto, mismo aborto si no coincide). Útil tras arreglar un bug
// del parser de enlaces sin tener que reimportar todo el vault.
export const recomputeAllBrainLinksForUser = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!profile) {
      throw new Error(`Username "${username}" no encontrado. Abortado sin tocar nada.`);
    }
    const ownerId = profile.userId;
    const notes = await ctx.db
      .query("brainNotes")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const note of notes) {
      await recomputeLinks(ctx, ownerId, note._id, note.body);
    }
    return { ownerUsername: profile.username, notesProcessed: notes.length };
  },
});
