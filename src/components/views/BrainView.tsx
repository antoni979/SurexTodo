import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SearchIcon, PlusIcon } from "../icons";
import BrainNoteEditor from "../BrainNoteEditor";
import BrainGraphView from "../BrainGraphView";
import BrainFolderTree from "../BrainFolderTree";

type Mode = "list" | "editor" | "graph";
type NoteSummary = {
  _id: Id<"brainNotes">;
  title: string;
  snippet: string;
  tags: string[];
  folder: string;
  updatedAt: number;
};

export default function BrainView() {
  const [mode, setMode] = useState<Mode>("list");
  const [selectedId, setSelectedId] = useState<Id<"brainNotes"> | "new" | null>(null);
  const [pendingTitle, setPendingTitle] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  const notes: NoteSummary[] =
    useQuery(api.brain.listMyNotes, { search: search || undefined }) ?? [];
  const allTitlesQuery: NoteSummary[] = useQuery(api.brain.listMyNotes, {}) ?? [];
  const allFolders = Array.from(
    new Set(allTitlesQuery.map((n) => n.folder).filter(Boolean)),
  ).sort();

  const visibleNotes = notes.filter((n) => {
    if (selectedFolder === null) return true;
    if (selectedFolder === "") return !n.folder;
    return n.folder === selectedFolder || n.folder.startsWith(selectedFolder + "/");
  });

  // Orden y estructura: agrupamos por carpeta y, dentro de cada grupo,
  // ordenamos por título con orden numérico natural ("00 ·" < "02 ·",
  // "Semana 2" < "Semana 10"). Antes se pintaba en orden de última edición,
  // que se sentía como una pila desordenada. Las notas sin carpeta van al final.
  const groupedNotes = useMemo(() => {
    const nat = (a: string, b: string) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    const sorted = [...visibleNotes].sort(
      (a, b) => nat(a.folder || "￿", b.folder || "￿") || nat(a.title, b.title),
    );
    const groups: { folder: string; notes: NoteSummary[] }[] = [];
    for (const n of sorted) {
      const key = n.folder || "";
      const last = groups[groups.length - 1];
      if (last && last.folder === key) last.notes.push(n);
      else groups.push({ folder: key, notes: [n] });
    }
    return groups;
  }, [visibleNotes]);

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
          <div className="brain-list-layout">
            <BrainFolderTree
              notes={allTitlesQuery}
              selectedFolder={selectedFolder}
              onSelectFolder={setSelectedFolder}
            />
            <div className="brain-note-groups">
              {visibleNotes.length === 0 && (
                <p className="sidebar-empty">
                  {notes.length === 0
                    ? 'Aún no tienes notas. Crea la primera con "Nueva nota".'
                    : "No hay notas en esta carpeta."}
                </p>
              )}
              {groupedNotes.map((g) => (
                <section className="brain-folder-group" key={g.folder || "__root__"}>
                  <div className="brain-folder-group-head">
                    <span>{g.folder ? `📂 ${g.folder}` : "— Sin carpeta"}</span>
                    <span className="brain-folder-group-count">{g.notes.length}</span>
                  </div>
                  <div className="brain-note-grid">
                    {g.notes.map((n) => (
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
                </section>
              ))}
            </div>
          </div>
        )}

        {mode === "editor" && selectedId && (
          <BrainNoteEditor
            key={selectedId === "new" ? `new-${pendingTitle ?? ""}` : selectedId}
            noteId={selectedId}
            initialTitle={pendingTitle}
            initialFolder={selectedFolder && selectedFolder !== "" ? selectedFolder : undefined}
            allNotes={allTitlesQuery.map((n) => ({ _id: n._id, title: n.title }))}
            allFolders={allFolders}
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
