import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { createAccount, modifyAccountCredentials } from "@convex-dev/auth/server";
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

// Radiografía de uso, solo recuentos agregados (nunca títulos ni contenido
// de nadie). Sirve para decidir con datos si la forma de organizar tareas
// que tenemos montada se está usando de verdad o sobra la mitad. CLI-only.
export const usageStats = query({
  args: {},
  handler: async (ctx) => {
    const [tasks, lists, teams, workspaces, myDay, milestones, links, profiles] =
      await Promise.all([
        ctx.db.query("tasks").collect(),
        ctx.db.query("lists").collect(),
        ctx.db.query("teams").collect(),
        ctx.db.query("workspaces").collect(),
        ctx.db.query("myDay").collect(),
        ctx.db.query("milestones").collect(),
        ctx.db.query("projectLinks").collect(),
        ctx.db.query("profiles").collect(),
      ]);

    const nameOf = new Map(profiles.map((p) => [p.userId, p.username]));
    const wsName = new Map(workspaces.map((w) => [w._id, w.name]));

    const projects = tasks.filter((t) => t.isProject);
    const projectIds = new Set(projects.map((t) => t._id));
    const children = tasks.filter((t) => t.parentTaskId);
    const projectChildren = children.filter((t) => projectIds.has(t.parentTaskId!));
    const subtasks = children.filter((t) => !projectIds.has(t.parentTaskId!));
    const topLevel = tasks.filter((t) => !t.parentTaskId && !t.isProject);

    const taskIdsInMyDay = new Set(myDay.map((m) => m.taskId));
    const now = Date.now();
    const DAY = 86400000;

    // Tareas sueltas: sin lista, sin equipo, sin etiquetas y sin fecha.
    // Si son mayoría, la app funciona de hecho como una bandeja plana.
    const huerfanas = topLevel.filter(
      (t) =>
        !t.listId &&
        !t.teamId &&
        !(t.tags && t.tags.length > 0) &&
        !t.dueDate,
    );

    const pendientes = topLevel.filter((t) => !t.completed);

    const porUsuario = [...nameOf.entries()].map(([userId, username]) => {
      const mias = tasks.filter((t) => t.creatorId === userId);
      return {
        username,
        total: mias.length,
        pendientes: mias.filter((t) => !t.completed && !t.isProject).length,
        proyectos: mias.filter((t) => t.isProject).length,
      };
    });

    return {
      entornos: workspaces.map((w) => ({
        nombre: w.name,
        tareas: tasks.filter((t) => t.workspaceId === w._id).length,
      })),
      tareas: {
        total: tasks.length,
        raiz: topLevel.length,
        pendientesRaiz: pendientes.length,
        subtareas: subtasks.length,
        dentroDeProyecto: projectChildren.length,
      },
      clasificacion: {
        conLista: topLevel.filter((t) => t.listId).length,
        conEquipo: topLevel.filter((t) => t.teamId).length,
        conEtiquetas: topLevel.filter((t) => t.tags && t.tags.length > 0).length,
        conFecha: topLevel.filter((t) => t.dueDate).length,
        conRecurrencia: topLevel.filter((t) => t.recurrence).length,
        conNota: topLevel.filter((t) => t.note && t.note.trim()).length,
        enMiDiaAlgunaVez: topLevel.filter((t) => taskIdsInMyDay.has(t._id)).length,
        sinClasificarDeNinguna: huerfanas.length,
      },
      proyectos: {
        total: projects.length,
        porEstado: projects.reduce<Record<string, number>>((acc, p) => {
          const k = p.projectStatus ?? "sin_estado";
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {}),
        conHitos: new Set(milestones.map((m) => m.projectId)).size,
        conEnlaces: new Set(links.map((l) => l.projectId)).size,
        sinNingunaTarea: projects.filter(
          (p) => !projectChildren.some((c) => c.parentTaskId === p._id),
        ).length,
        tareasPorProyecto: projects.map((p) => ({
          entorno: p.workspaceId ? wsName.get(p.workspaceId) ?? "?" : "personal",
          estado: p.projectStatus ?? "sin_estado",
          tareas: projectChildren.filter((c) => c.parentTaskId === p._id).length,
          hitos: milestones.filter((m) => m.projectId === p._id).length,
        })),
      },
      listas: {
        total: lists.length,
        vacias: lists.filter((l) => !tasks.some((t) => t.listId === l._id)).length,
        tareasPorLista: lists.map((l) => ({
          entorno: l.workspaceId ? wsName.get(l.workspaceId) ?? "?" : "personal",
          tareas: tasks.filter((t) => t.listId === l._id).length,
        })),
      },
      equipos: teams.map((t) => ({
        entorno: t.workspaceId ? wsName.get(t.workspaceId) ?? "?" : "personal",
        tareas: tasks.filter((x) => x.teamId === t._id).length,
      })),
      antiguedadPendientes: {
        vencidas: pendientes.filter(
          (t) => t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10),
        ).length,
        creadasHaceMasDe30d: pendientes.filter(
          (t) => now - t._creationTime > 30 * DAY,
        ).length,
        creadasHaceMasDe90d: pendientes.filter(
          (t) => now - t._creationTime > 90 * DAY,
        ).length,
      },
      porUsuario,
    };
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

// Busca la cuenta "password" de un usuario por username EXACTO. Falla fuerte
// si no hay username o no hay cuenta de contraseña — nunca hay owner por
// defecto. Solo lo usa resetUserPassword (CLI-only) para resolver el
// providerAccountId (el email) sin exponer nada al cliente.
export const findPasswordAccountByUsername = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!profile) {
      throw new Error(`Username "${username}" no encontrado (exacto). Abortado sin tocar nada.`);
    }
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", profile.userId).eq("provider", "password"),
      )
      .unique();
    if (!account) {
      throw new Error(`"${username}" no tiene cuenta de tipo contraseña. Abortado.`);
    }
    return { username: profile.username, email: account.providerAccountId };
  },
});

// Resetea la contraseña de UN usuario, identificado por username EXACTO
// (mismo criterio estricto que el resto de este archivo). CLI-only, nunca
// expuesto al cliente — usa la API oficial de @convex-dev/auth para
// re-hashear el secreto en su cuenta "password".
export const resetUserPassword = action({
  args: { username: v.string(), newPassword: v.string() },
  handler: async (ctx, { username, newPassword }): Promise<{ username: string; email: string }> => {
    const { username: exactUsername, email } = await ctx.runQuery(
      internal.adminOps.findPasswordAccountByUsername,
      { username },
    );
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: email, secret: newPassword },
    });
    return { username: exactUsername, email };
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
        folder: v.optional(v.string()),
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

// Rellena el campo folder de notas YA existentes, emparejando por título
// exacto (case-sensitive). Pensado para notas importadas antes de que
// existiera folder. Mismo username exacto obligatorio de siempre.
export const backfillBrainFoldersForUser = mutation({
  args: {
    username: v.string(),
    items: v.array(v.object({ title: v.string(), folder: v.string() })),
  },
  handler: async (ctx, { username, items }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (!profile) {
      throw new Error(`Username "${username}" no encontrado. Abortado sin tocar nada.`);
    }
    const ownerId = profile.userId;

    let updated = 0;
    const notFound: string[] = [];
    for (const item of items) {
      const note = await ctx.db
        .query("brainNotes")
        .withIndex("by_owner_title", (q) =>
          q.eq("ownerId", ownerId).eq("title", item.title),
        )
        .unique();
      if (!note) {
        notFound.push(item.title);
        continue;
      }
      await ctx.db.patch(note._id, { folder: item.folder || undefined });
      updated++;
    }
    return { ownerUsername: profile.username, updated, notFound };
  },
});

// Borra un entorno ENTERO y todo lo que cuelga de él: tareas (del entorno o
// de sus equipos, que antes se guardaban sin workspaceId), subtareas a
// cualquier profundidad, Mi día, adjuntos con su fichero, hitos/enlaces/
// miembros de proyecto, equipos con sus miembros, listas, etiquetas y la
// membresía. Nombre EXACTO; por defecto solo simula (dryRun). Si alguna
// tarea alcanzada pertenece a OTRO entorno, aborta sin tocar nada.
// No borra cuentas de usuario: eso es una decisión aparte. CLI-only.
export const purgeWorkspace = mutation({
  args: {
    name: v.string(),
    dryRun: v.optional(v.boolean()),
    // Subtareas de una tarea del entorno que, por error, llevan otro
    // workspaceId. Solo se borran si se pide explícitamente; las RAÍCES de
    // otro entorno no se tocan nunca.
    incluirDescendientesDeOtroEntorno: v.optional(v.boolean()),
  },
  handler: async (ctx, { name, dryRun = true, incluirDescendientesDeOtroEntorno = false }) => {
    const all = await ctx.db.query("workspaces").collect();
    const matches = all.filter((w) => w.name === name);
    if (matches.length !== 1) {
      throw new Error(`"${name}": ${matches.length} entornos con ese nombre exacto. Abortado.`);
    }
    const ws = matches[0];
    if (all.length < 2) throw new Error("Es el único entorno que hay. Abortado.");

    const teams = (await ctx.db.query("teams").collect()).filter((t) => t.workspaceId === ws._id);
    const teamIds = new Set(teams.map((t) => t._id));
    const allTasks = await ctx.db.query("tasks").collect();

    // Raíces: del entorno, o de uno de sus equipos aunque no lleven entorno.
    const doomed = new Map(
      allTasks
        .filter((t) => t.workspaceId === ws._id || (t.teamId && teamIds.has(t.teamId)))
        .map((t) => [t._id, t]),
    );
    // Descendientes a cualquier profundidad.
    let frontier = [...doomed.keys()];
    while (frontier.length) {
      const next: typeof frontier = [];
      for (const id of frontier) {
        const kids = await ctx.db.query("tasks").withIndex("by_parent", (q) => q.eq("parentTaskId", id)).collect();
        for (const k of kids) if (!doomed.has(k._id)) { doomed.set(k._id, k); next.push(k._id); }
      }
      frontier = next;
    }

    const ajenas = [...doomed.values()].filter((t) => t.workspaceId && t.workspaceId !== ws._id);
    const ajenasRaiz = ajenas.filter((t) => !t.parentTaskId);
    if (ajenasRaiz.length) {
      throw new Error(`${ajenasRaiz.length} tareas RAÍZ de otro entorno alcanzadas. Abortado sin tocar nada.`);
    }
    if (ajenas.length && !incluirDescendientesDeOtroEntorno) {
      throw new Error(`${ajenas.length} tareas alcanzadas son de otro entorno. Abortado sin tocar nada.`);
    }

    const lists = (await ctx.db.query("lists").collect()).filter((l) => l.workspaceId === ws._id);
    const listIds = new Set(lists.map((l) => l._id));
    // Tareas de OTROS entornos que apunten a una lista que va a desaparecer.
    const listRefsFuera = allTasks.filter((t) => t.listId && listIds.has(t.listId) && !doomed.has(t._id));
    const tags = (await ctx.db.query("userTags").collect()).filter((t) => t.workspaceId === ws._id);
    const members = await ctx.db.query("workspaceMembers").withIndex("by_workspace", (q) => q.eq("workspaceId", ws._id)).collect();

    const c = { tareas: doomed.size, miDia: 0, adjuntos: 0, hitos: 0, enlaces: 0, miembrosProyecto: 0, miembrosEquipo: 0 };
    const ops: Array<() => Promise<unknown>> = [];

    for (const t of doomed.values()) {
      for (const m of await ctx.db.query("myDay").withIndex("by_task", (q) => q.eq("taskId", t._id)).collect()) { c.miDia++; ops.push(() => ctx.db.delete(m._id)); }
      for (const a of await ctx.db.query("attachments").withIndex("by_task", (q) => q.eq("taskId", t._id)).collect()) {
        c.adjuntos++; ops.push(() => ctx.storage.delete(a.storageId)); ops.push(() => ctx.db.delete(a._id));
      }
      for (const m of await ctx.db.query("milestones").withIndex("by_project", (q) => q.eq("projectId", t._id)).collect()) { c.hitos++; ops.push(() => ctx.db.delete(m._id)); }
      for (const l of await ctx.db.query("projectLinks").withIndex("by_project", (q) => q.eq("projectId", t._id)).collect()) { c.enlaces++; ops.push(() => ctx.db.delete(l._id)); }
      for (const m of await ctx.db.query("projectMembers").withIndex("by_project", (q) => q.eq("projectId", t._id)).collect()) { c.miembrosProyecto++; ops.push(() => ctx.db.delete(m._id)); }
      ops.push(() => ctx.db.delete(t._id));
    }
    for (const team of teams) {
      for (const m of await ctx.db.query("teamMembers").withIndex("by_team", (q) => q.eq("teamId", team._id)).collect()) { c.miembrosEquipo++; ops.push(() => ctx.db.delete(m._id)); }
      ops.push(() => ctx.db.delete(team._id));
    }
    for (const t of listRefsFuera) ops.push(() => ctx.db.patch(t._id, { listId: undefined }));
    for (const l of lists) ops.push(() => ctx.db.delete(l._id));
    for (const t of tags) ops.push(() => ctx.db.delete(t._id));
    for (const m of members) ops.push(() => ctx.db.delete(m._id));
    ops.push(() => ctx.db.delete(ws._id));

    // Quién se queda sin ningún entorno después de esto.
    const profiles = await ctx.db.query("profiles").collect();
    const sinEntorno: string[] = [];
    for (const m of members) {
      const otros = (await ctx.db.query("workspaceMembers").withIndex("by_user", (q) => q.eq("userId", m.userId)).collect())
        .filter((x) => x.workspaceId !== ws._id);
      if (!otros.length) sinEntorno.push(profiles.find((p) => p.userId === m.userId)?.username ?? m.userId);
    }

    const resumen = {
      entorno: ws.name,
      dryRun,
      ...c,
      equipos: teams.map((t) => t.name),
      listas: lists.map((l) => l.name),
      etiquetas: tags.length,
      miembrosEntorno: members.length,
      listasDesenganchadasEnOtrosEntornos: listRefsFuera.length,
      usuariosQueSeQuedanSinEntorno: sinEntorno,
      descendientesDeOtroEntornoIncluidos: ajenas.map((t) => t.title),
      operaciones: ops.length,
    };
    if (!dryRun) for (const op of ops) await op();
    return resumen;
  },
});

// Rellena el workspaceId que les faltaba a las tareas de equipo (y a sus
// subtareas), heredándolo del equipo o del padre. Por defecto simula.
export const backfillTaskWorkspaces = mutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun = true }) => {
    const teams = new Map((await ctx.db.query("teams").collect()).map((t) => [t._id, t]));
    const tasks = await ctx.db.query("tasks").collect();
    const ws = new Map(tasks.map((t) => [t._id, t.workspaceId]));
    const fixes = new Map<string, string>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of tasks) {
        if (ws.get(t._id)) continue;
        const fromTeam = t.teamId ? teams.get(t.teamId)?.workspaceId : undefined;
        const fromParent = t.parentTaskId ? ws.get(t.parentTaskId) : undefined;
        const w = fromParent ?? fromTeam;
        if (w) { ws.set(t._id, w); fixes.set(t._id, w); changed = true; }
      }
    }
    const wsNames = new Map((await ctx.db.query("workspaces").collect()).map((w) => [w._id as string, w.name]));
    const porEntorno: Record<string, number> = {};
    for (const w of fixes.values()) porEntorno[wsNames.get(w) ?? w] = (porEntorno[wsNames.get(w) ?? w] ?? 0) + 1;
    const siguenSinEntorno = tasks.filter((t) => !ws.get(t._id)).length;
    if (!dryRun) for (const [id, w] of fixes) await ctx.db.patch(id as Id<"tasks">, { workspaceId: w as Id<"workspaces"> });
    return { dryRun, arregladas: fixes.size, porEntorno, siguenSinEntorno };
  },
});

// Borra la CUENTA de un usuario (username exacto) con todo su rastro de
// sesión. Se niega si aún pertenece a algún entorno o si quedan datos de la
// app que dependan de él (tareas, equipos, listas, notas…): primero hay que
// limpiar eso de forma consciente. Por defecto simula. CLI-only.
export const deleteUserAccount = mutation({
  args: { username: v.string(), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { username, dryRun = true }) => {
    const profile = await ctx.db.query("profiles").withIndex("by_username", (q) => q.eq("username", username)).unique();
    if (!profile) throw new Error(`Username "${username}" no encontrado (exacto). Abortado.`);
    const userId = profile.userId;
    const user = await ctx.db.get(userId);

    const restos = {
      entornos: (await ctx.db.query("workspaceMembers").withIndex("by_user", (q) => q.eq("userId", userId)).collect()).length,
      equipos: (await ctx.db.query("teamMembers").withIndex("by_user", (q) => q.eq("userId", userId)).collect()).length,
      tareasCreadas: (await ctx.db.query("tasks").withIndex("by_creator", (q) => q.eq("creatorId", userId)).collect()).length,
      tareasAsignadas: (await ctx.db.query("tasks").withIndex("by_assignee", (q) => q.eq("assigneeId", userId)).collect()).length,
      proyectos: (await ctx.db.query("projectMembers").withIndex("by_user", (q) => q.eq("userId", userId)).collect()).length,
      listas: (await ctx.db.query("lists").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect()).length,
      notasCerebro: (await ctx.db.query("brainNotes").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect()).length,
      equiposQueEsDueno: (await ctx.db.query("teams").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect()).length,
      entornosQueEsDueno: (await ctx.db.query("workspaces").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect()).length,
    };
    const bloqueos = Object.entries(restos).filter(([, n]) => n > 0);
    if (bloqueos.length) {
      throw new Error(`"${username}" aún tiene datos: ${JSON.stringify(Object.fromEntries(bloqueos))}. Abortado.`);
    }

    const tags = await ctx.db.query("userTags").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    const myDay = (await ctx.db.query("myDay").collect()).filter((m) => m.userId === userId);
    const accounts = await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", userId)).collect();
    const sessions = await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", userId)).collect();
    const tokens = [];
    for (const s of sessions) {
      tokens.push(...(await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", s._id)).collect()));
    }
    const resumen = {
      username, email: user?.email, dryRun,
      etiquetas: tags.length, miDia: myDay.length, cuentasAuth: accounts.length,
      sesiones: sessions.length, refreshTokens: tokens.length,
    };
    if (!dryRun) {
      for (const d of [...tags, ...myDay, ...tokens, ...sessions, ...accounts]) await ctx.db.delete(d._id);
      await ctx.db.delete(profile._id);
      if (user) await ctx.db.delete(userId);
    }
    return resumen;
  },
});
