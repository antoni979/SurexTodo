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

export const listMyTeams = query({
  args: { workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, { workspaceId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const teams = [];
    const filterWS = workspaceId ?? null;
    for (const m of memberships) {
      const team = await ctx.db.get(m.teamId);
      if (!team) continue;
      if ((team.workspaceId ?? null) !== filterWS) continue;
      teams.push(team);
    }
    teams.sort((a, b) => a.name.localeCompare(b.name));
    return teams;
  },
});

export const createTeam = mutation({
  args: { name: v.string(), workspaceId: v.optional(v.id("workspaces")) },
  handler: async (ctx, { name, workspaceId }) => {
    const userId = await requireUser(ctx);
    const clean = name.trim();
    if (!clean) throw new Error("El equipo necesita un nombre");
    const teamId = await ctx.db.insert("teams", {
      name: clean,
      ownerId: userId,
      workspaceId,
    });
    await ctx.db.insert("teamMembers", { teamId, userId });
    return teamId;
  },
});

export const getTeam = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    if (!(await isMember(ctx, teamId, userId))) return null;

    const team = await ctx.db.get(teamId);
    if (!team) return null;

    const memberRows = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();

    const members = [];
    for (const row of memberRows) {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", row.userId))
        .unique();
      members.push({
        userId: row.userId,
        username: profile?.username ?? "(sin nombre)",
      });
    }
    members.sort((a, b) => a.username.localeCompare(b.username));

    return {
      _id: team._id,
      name: team.name,
      ownerId: team.ownerId,
      workspaceId: team.workspaceId,
      isOwner: team.ownerId === userId,
      members,
    };
  },
});

// Users (with a username) that are not yet in the given team, restricted to
// people who already belong to the team's own workspace (never leaks names
// from other companies/workspaces). Only the team owner can call this.
export const listAddableUsers = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const team = await ctx.db.get(teamId);
    if (!team || team.ownerId !== userId) return [];

    const memberRows = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const memberSet = new Set(memberRows.map((r) => r.userId as string));

    let candidateIds: Set<string> | null = null;
    if (team.workspaceId) {
      const wsMembers = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", team.workspaceId!))
        .collect();
      candidateIds = new Set(wsMembers.map((m) => m.userId as string));
    }

    const profiles = await ctx.db.query("profiles").collect();
    return profiles
      .filter((p) => !memberSet.has(p.userId as string))
      .filter((p) => candidateIds === null || candidateIds.has(p.userId as string))
      .map((p) => ({ userId: p.userId, username: p.username }))
      .sort((a, b) => a.username.localeCompare(b.username));
  },
});

export const addMember = mutation({
  args: { teamId: v.id("teams"), userId: v.id("users") },
  handler: async (ctx, { teamId, userId }) => {
    const me = await requireUser(ctx);
    const team = await ctx.db.get(teamId);
    if (!team) throw new Error("Equipo no encontrado");
    if (team.ownerId !== me) {
      throw new Error("Solo el propietario puede añadir miembros");
    }
    if (team.workspaceId) {
      const wsMember = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspaceId", team.workspaceId!).eq("userId", userId),
        )
        .unique();
      if (!wsMember) {
        throw new Error("Ese usuario no pertenece a este entorno");
      }
    }
    if (await isMember(ctx, teamId, userId)) {
      throw new Error("Ese usuario ya está en el equipo");
    }
    await ctx.db.insert("teamMembers", { teamId, userId });
  },
});

export const leaveTeam = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    const userId = await requireUser(ctx);
    const team = await ctx.db.get(teamId);
    if (!team) throw new Error("Equipo no encontrado");
    if (team.ownerId === userId) {
      throw new Error("El propietario no puede abandonar su propio equipo");
    }
    const row = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId),
      )
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});
