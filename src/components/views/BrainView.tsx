import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SearchIcon, PlusIcon } from "../icons";
import BrainNoteEditor from "../BrainNoteEditor";
import BrainGraphView from "../BrainGraphView";

type Mode = "list" | "editor" | "graph";
type NoteSummary = {
  _id: Id<"brainNotes">;
  title: string;
  snippet: string;
  tags: string[];
  updatedAt: number;
};

export default function BrainView() {
  const [mode, setMode] = useState<Mode>("list");
  const [selectedId, setSelectedId] = useState<Id<"brainNotes"> | "new" | null>(null);
  const [pendingTitle, setPendingTitle] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");

  const notes: NoteSummary[] =
    useQuery(api.brain.listMyNotes, { search: search || undefined }) ?? [];
  const allTitlesQuery: NoteSummary[] = useQuery(api.brain.listMyNotes, {}) ?? [];

  function openNote(id: Id<"brainNotes">) {
    setSelectedId(id);
    setPendingTitle(undefined);
    setMode("editor");
  }

  function newNote(prefillTitle?: string) {
    setSelectedId("new");
    setPendingTitle(prefillTitle);
    setMode("editor");
  }

  function navigateToTitle(title: string) {
    const found = allTitlesQuery.find((n) => n.title === title);
    if (found) openNote(found._id);
    else newNote(title);
  }

  function backToList() {
    setMode("list");
    setSelectedId(null);
    setPendingTitle(undefined);
  }

  return (
    <div className="screen brain-screen">
      <header className="screen-head" style={{ color: "#7c3aed" }}>
        <h1>🧠 Segundo Cerebro</h1>
        <p className="screen-sub">Notas enlazadas, tuyas y solo tuyas</p>
        <div className="screen-toolbar">
          {mode !== "graph" && (
            <div className="search-input">
              <SearchIcon size={15} />
              <input
                type="search"
                value={search}
                placeholder="Buscar en tus notas…"
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
          <button
            className="toggle-done-btn"
            onClick={() => newNote()}
          >
            <PlusIcon size={14} /> Nueva nota
          </button>
          <button
            className={"toggle-done-btn" + (mode === "graph" ? " active" : "")}
            onClick={() => setMode(mode === "graph" ? "list" : "graph")}
          >
            🕸 {mode === "graph" ? "Volver a la lista" : "Ver grafo"}
          </button>
        </div>
      </header>

      <div className="screen-scroll">
        {mode === "list" && (
          <div className="brain-note-grid">
            {notes.length === 0 && (
              <p className="sidebar-empty">
                Aún no tienes notas. Crea la primera con "Nueva nota".
              </p>
            )}
            {notes.map((n) => (
              <button
                key={n._id}
                type="button"
                className="brain-note-card"
                onClick={() => openNote(n._id)}
              >
                <div className="brain-note-card-title">{n.title}</div>
                <div className="brain-note-card-snippet">{n.snippet}</div>
                {n.tags.length > 0 && (
                  <div className="brain-note-card-tags">
                    {n.tags.map((t) => (
                      <span key={t} className="tag-chip">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {mode === "editor" && selectedId && (
          <BrainNoteEditor
            key={selectedId === "new" ? `new-${pendingTitle ?? ""}` : selectedId}
            noteId={selectedId}
            initialTitle={pendingTitle}
            allNotes={allTitlesQuery.map((n) => ({ _id: n._id, title: n.title }))}
            onClose={backToList}
            onOpenNote={openNote}
            onNavigateToTitle={navigateToTitle}
            onDeleted={backToList}
          />
        )}

        {mode === "graph" && <BrainGraphView onOpenNote={openNote} />}
      </div>
    </div>
  );
}
