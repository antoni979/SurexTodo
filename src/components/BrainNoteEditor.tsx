import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CloseIcon, TrashIcon } from "./icons";
import BrainMarkdown from "./BrainMarkdown";

type NoteRef = { _id: Id<"brainNotes">; title: string };

export default function BrainNoteEditor({
  noteId,
  initialTitle,
  allNotes,
  onClose,
  onOpenNote,
  onNavigateToTitle,
  onDeleted,
}: {
  noteId: Id<"brainNotes"> | "new";
  initialTitle?: string;
  allNotes: NoteRef[];
  onClose: () => void;
  onOpenNote: (id: Id<"brainNotes">) => void;
  onNavigateToTitle: (title: string) => void;
  onDeleted: () => void;
}) {
  const isNew = noteId === "new";
  const note = useQuery(
    api.brain.getNote,
    isNew ? "skip" : { noteId: noteId as Id<"brainNotes"> },
  );
  const backlinks = useQuery(
    api.brain.getBacklinks,
    isNew ? "skip" : { noteId: noteId as Id<"brainNotes"> },
  );
  const createNote = useMutation(api.brain.createNote);
  const updateNote = useMutation(api.brain.updateNote);
  const deleteNote = useMutation(api.brain.deleteNote);

  const [title, setTitle] = useState(initialTitle ?? "");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [error, setError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<Id<"brainNotes"> | null>(
    isNew ? null : (noteId as Id<"brainNotes">),
  );
  const [wikiQuery, setWikiQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setCurrentId(isNew ? null : (noteId as Id<"brainNotes">));
    setMode("edit");
  }, [noteId, isNew]);

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setBody(note.body);
      setTags(note.tags ?? []);
    } else if (isNew) {
      setTitle(initialTitle ?? "");
      setBody("");
      setTags([]);
    }
  }, [note, isNew, initialTitle]);

  const existingTitles = new Set(allNotes.map((n) => n.title));

  async function persist(patch: { title?: string; body?: string; tags?: string[] }) {
    setError(null);
    try {
      if (currentId) {
        await updateNote({ noteId: currentId, ...patch });
      } else {
        const t = (patch.title ?? title).trim();
        if (!t) return;
        const newId = await createNote({
          title: t,
          body: patch.body ?? body,
          tags: patch.tags ?? tags,
        });
        setCurrentId(newId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  function handleTitleBlur() {
    const t = title.trim();
    if (!t) {
      setTitle(note?.title ?? "");
      return;
    }
    if (!note || t !== note.title) void persist({ title: t });
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBody(val);
    const pos = e.target.selectionStart;
    const uptoCursor = val.slice(0, pos);
    const m = uptoCursor.match(/\[\[([^\]]*)$/);
    setWikiQuery(m ? m[1] : null);
  }

  function handleBodyBlur() {
    // Pequeño margen para permitir el clic en una sugerencia antes de cerrar.
    setTimeout(() => setWikiQuery(null), 150);
    if (!note || body !== note.body) void persist({ body });
  }

  function insertWikilink(pickedTitle: string) {
    const ta = textareaRef.current;
    const pos = ta?.selectionStart ?? body.length;
    const uptoCursor = body.slice(0, pos);
    const m = uptoCursor.match(/\[\[([^\]]*)$/);
    if (!m) {
      setWikiQuery(null);
      return;
    }
    const start = pos - m[0].length;
    const before = body.slice(0, start);
    const after = body.slice(pos);
    const inserted = `[[${pickedTitle}]]`;
    const next = before + inserted + after;
    setBody(next);
    setWikiQuery(null);
    requestAnimationFrame(() => {
      ta?.focus();
      const newPos = before.length + inserted.length;
      ta?.setSelectionRange(newPos, newPos);
    });
    void persist({ body: next });
  }

  function addTag(val: string) {
    const t = val.trim();
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    setTags(next);
    setTagInput("");
    void persist({ tags: next });
  }

  function removeTag(t: string) {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    void persist({ tags: next });
  }

  async function handleDelete() {
    if (!currentId) {
      onClose();
      return;
    }
    if (!confirm(`¿Eliminar la nota "${title}"? Los enlaces de otras notas hacia ella quedarán rotos.`))
      return;
    await deleteNote({ noteId: currentId });
    onDeleted();
  }

  const suggestions =
    wikiQuery !== null
      ? allNotes
          .filter((n) =>
            n.title.toLowerCase().includes(wikiQuery.trim().toLowerCase()),
          )
          .slice(0, 8)
      : [];

  if (!isNew && note === undefined) {
    return <div className="brain-loading">Cargando…</div>;
  }
  if (!isNew && note === null) {
    return <div className="brain-loading">Nota no encontrada.</div>;
  }

  return (
    <div className="brain-editor">
      <div className="brain-editor-head">
        <input
          className="brain-title-input"
          value={title}
          placeholder="Título de la nota"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <div className="brain-editor-actions">
          <button
            type="button"
            className={"toggle-done-btn" + (mode === "preview" ? " active" : "")}
            onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
          >
            {mode === "edit" ? "👁 Vista previa" : "✎ Editar"}
          </button>
          <button className="icon-btn" title="Eliminar nota" onClick={handleDelete}>
            <TrashIcon size={18} />
          </button>
          <button className="icon-btn" title="Cerrar" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>
      </div>

      {error && <div className="composer-error">{error}</div>}

      <div className="brain-tags">
        {tags.map((t) => (
          <span key={t} className="tag-chip">
            {t}
            <button type="button" className="tag-chip-remove" onClick={() => removeTag(t)}>
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          className="tag-input"
          value={tagInput}
          placeholder="🏷 etiqueta…"
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
        />
      </div>

      <div className="brain-body-wrap">
        {mode === "edit" ? (
          <>
            <textarea
              ref={textareaRef}
              className="brain-body-textarea"
              value={body}
              placeholder="Escribe aquí… usa [[Título]] para enlazar otra nota."
              onChange={handleBodyChange}
              onBlur={handleBodyBlur}
            />
            {wikiQuery !== null && (
              <div className="brain-wiki-suggestions">
                {suggestions.map((n) => (
                  <button
                    key={n._id}
                    type="button"
                    className="tag-suggestion"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertWikilink(n.title);
                    }}
                  >
                    {n.title}
                  </button>
                ))}
                {wikiQuery.trim() &&
                  !allNotes.some(
                    (n) => n.title.toLowerCase() === wikiQuery.trim().toLowerCase(),
                  ) && (
                    <button
                      type="button"
                      className="tag-suggestion tag-suggestion-new"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertWikilink(wikiQuery.trim());
                      }}
                    >
                      + Crear "{wikiQuery.trim()}"
                    </button>
                  )}
              </div>
            )}
          </>
        ) : (
          <BrainMarkdown
            body={body}
            existingTitles={existingTitles}
            onNavigate={onNavigateToTitle}
            onCreateMissing={onNavigateToTitle}
          />
        )}
      </div>

      {currentId && backlinks && backlinks.length > 0 && (
        <div className="brain-backlinks">
          <strong>Referenciado por:</strong>
          <div className="brain-backlinks-list">
            {backlinks.map((b: { _id: Id<"brainNotes">; title: string }) => (
              <button
                key={b._id}
                type="button"
                className="wikilink"
                onClick={() => onOpenNote(b._id)}
              >
                {b.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
