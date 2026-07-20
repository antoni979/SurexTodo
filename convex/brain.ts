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

// Extrae los títulos dentro de [[Título]] o [[Título|Alias]] de un texto.
function extractWikilinkTitles(body: string): string[] {
  const out = new Set<string>();
  const re = /\[\[([^\]|]+)(\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const title = m[1].trim();
    if (title) out.add(title);
  }
  return Array.from(out);
}

// Recalcula por completo los brainLinks salientes de una nota: borra los
// antiguos y reinserta los nuevos, resolviendo cada título contra las notas
// existentes del mismo dueño.
async function recomputeLinks(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  noteId: Id<"brainNotes">,
  body: string,
) {
  const old = await ctx.db
    .query("brainLinks")
    .withIndex("by_source", (q) => q.eq("sourceNoteId", noteId))
    .collect();
  for (const l of old) await ctx.db.delete(l._id);

  const titles = extractWikilinkTitles(body);
  for (const title of titles) {
    const target = await ctx.db
      .query("brainNotes")
      .withIndex("by_owner_title", (q) =>
        q.eq("ownerId", ownerId).eq("title", title),
      )
      .unique();
    await ctx.db.insert("brainLinks", {
      ownerId,
      sourceNoteId: noteId,
      targetTitle: title,
      targetNoteId: target?._id,
    });
  }
}

/* ---------- queries ---------- */

export const listMyNotes = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("brainNotes")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();
    const q = search?.trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.body.toLowerCase().includes(q),
        )
      : rows;
    return filtered
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((n) => ({
        _id: n._id,
        title: n.title,
        snippet: n.body.slice(0, 140),
        tags: n.tags ?? [],
        updatedAt: n.updatedAt,
      }));
  },
});

export const getNote = query({
  args: { noteId: v.id("brainNotes") },
  handler: async (ctx, { noteId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const note = await ctx.db.get(noteId);
    if (!note || note.ownerId !== userId) return null;
    return note;
  },
});

// Nota (si existe) por título exacto — para resolver clics en wikilinks.
export const getNoteByTitle = query({
  args: { title: v.string() },
  handler: async (ctx, { title }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const note = await ctx.db
      .query("brainNotes")
      .withIndex("by_owner_title", (q) =>
        q.eq("ownerId", userId).eq("title", title),
      )
      .unique();
    return note;
  },
});

export const getBacklinks = query({
  args: { noteId: v.id("brainNotes") },
  handler: async (ctx, { noteId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const note = await ctx.db.get(noteId);
    if (!note || note.ownerId !== userId) return [];
    const links = await ctx.db
      .query("brainLinks")
      .withIndex("by_target_note", (q) => q.eq("targetNoteId", noteId))
      .collect();
    const sources = await Promise.all(
      links.map(async (l) => {
        const src = await ctx.db.get(l.sourceNoteId);
        return src ? { _id: src._id, title: src.title } : null;
      }),
    );
    return sources.filter((s): s is { _id: Id<"brainNotes">; title: string } => s !== null);
  },
});

// Grafo completo del usuario: nodos = notas, aristas = enlaces resueltos
// (los enlaces rotos no generan arista, no hay nodo destino que dibujar).
export const getGraph = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { nodes: [], edges: [] };
    const notes = await ctx.db
      .query("brainNotes")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();
    const links = await ctx.db
      .query("brainLinks")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();
    const nodes = notes.map((n) => ({ id: n._id as string, title: n.title }));
    const edges = links
      .filter((l) => l.targetNoteId)
      .map((l) => ({
        source: l.sourceNoteId as string,
        target: l.targetNoteId as string,
      }));
    return { nodes, edges };
  },
});

/* ---------- mutations ---------- */

export const createNote = mutation({
  args: {
    title: v.string(),
    body: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { title, body, tags }) => {
    const userId = await requireUser(ctx);
    const clean = title.trim();
    if (!clean) throw new Error("La nota necesita un título");

    const existing = await ctx.db
      .query("brainNotes")
      .withIndex("by_owner_title", (q) =>
        q.eq("ownerId", userId).eq("title", clean),
      )
      .unique();
    if (existing) throw new Error(`Ya existe una nota titulada "${clean}"`);

    const noteId = await ctx.db.insert("brainNotes", {
      ownerId: userId,
      title: clean,
      body: body ?? "",
      tags: tags?.filter((t) => t.trim().length > 0),
      updatedAt: Date.now(),
    });
    await recomputeLinks(ctx, userId, noteId, body ?? "");

    // Si otras notas tenían un enlace roto apuntando a este título, lo
    // resolvemos ahora contra la nota recién creada.
    const dangling = await ctx.db
      .query("brainLinks")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();
    for (const l of dangling) {
      if (!l.targetNoteId && l.targetTitle === clean) {
        await ctx.db.patch(l._id, { targetNoteId: noteId });
      }
    }

    return noteId;
  },
});

export const updateNote = mutation({
  args: {
    noteId: v.id("brainNotes"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { noteId, title, body, tags }) => {
    const userId = await requireUser(ctx);
    const note = await ctx.db.get(noteId);
    if (!note || note.ownerId !== userId) throw new Error("Nota no encontrada");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (title !== undefined) {
      const clean = title.trim();
      if (!clean) throw new Error("La nota necesita un título");
      if (clean !== note.title) {
        const dup = await ctx.db
          .query("brainNotes")
          .withIndex("by_owner_title", (q) =>
            q.eq("ownerId", userId).eq("title", clean),
          )
          .unique();
        if (dup) throw new Error(`Ya existe una nota titulada "${clean}"`);
      }
      patch.title = clean;
    }
    if (body !== undefined) patch.body = body;
    if (tags !== undefined) patch.tags = tags.filter((t) => t.trim().length > 0);

    await ctx.db.patch(noteId, patch);

    if (body !== undefined) {
      await recomputeLinks(ctx, userId, noteId, body);
    }

    // Si el título cambió, cualquier brainLink de otra nota que apuntara al
    // título viejo queda roto; y si coincide con el nuevo, se re-resuelve al
    // recalcular la nota origen la próxima vez que se guarde. Para no dejar
    // backlinks huérfanos silenciosamente, actualizamos aquí los que ya
    // resolvían a esta nota (siguen apuntando al mismo _id, solo cambia el
    // título mostrado) — no requiere acción porque backlinks se resuelven
    // por targetNoteId, no por texto.

    return null;
  },
});

export const deleteNote = mutation({
  args: { noteId: v.id("brainNotes") },
  handler: async (ctx, { noteId }) => {
    const userId = await requireUser(ctx);
    const note = await ctx.db.get(noteId);
    if (!note || note.ownerId !== userId) throw new Error("Nota no encontrada");

    // Enlaces salientes de esta nota.
    const outgoing = await ctx.db
      .query("brainLinks")
      .withIndex("by_source", (q) => q.eq("sourceNoteId", noteId))
      .collect();
    for (const l of outgoing) await ctx.db.delete(l._id);

    // Enlaces entrantes: pasan a "rotos" (se conserva el texto del título).
    const incoming = await ctx.db
      .query("brainLinks")
      .withIndex("by_target_note", (q) => q.eq("targetNoteId", noteId))
      .collect();
    for (const l of incoming) {
      await ctx.db.patch(l._id, { targetNoteId: undefined });
    }

    await ctx.db.delete(noteId);
    return null;
  },
});
