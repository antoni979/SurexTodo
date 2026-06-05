import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { PRIORITIES, PRIORITY_META, type Priority } from "../util";
import { TrashIcon } from "./icons";

export default function BulkActionBar({
  selectedIds,
  onClear,
  workspaceId,
}: {
  selectedIds: Set<string>;
  onClear: () => void;
  workspaceId?: Id<"workspaces"> | null;
}) {
  const bulkUpdate = useMutation(api.tasks.bulkUpdate);
  const bulkDelete = useMutation(api.tasks.bulkDelete);
  const lists = useQuery(api.lists.listMyLists, workspaceId ? { workspaceId } : {}) ?? [];

  const [tagInput, setTagInput] = useState("");

  const ids = Array.from(selectedIds) as Id<"tasks">[];
  const count = ids.length;

  async function applyPriority(p: Priority) {
    await bulkUpdate({ taskIds: ids, priority: p });
  }
  async function applyDate(d: string) {
    await bulkUpdate({ taskIds: ids, dueDate: d || null });
  }
  async function applyTag() {
    const tag = tagInput.trim();
    if (!tag) return;
    await bulkUpdate({ taskIds: ids, addTags: [tag] });
    setTagInput("");
  }
  async function applyList(listId: string) {
    await bulkUpdate({
      taskIds: ids,
      listId: listId ? (listId as Id<"lists">) : null,
    });
  }
  async function handleDelete() {
    if (!confirm(`¿Eliminar ${count} tarea${count > 1 ? "s" : ""}? Esta acción no se puede deshacer.`)) return;
    await bulkDelete({ taskIds: ids });
    onClear();
  }

  return (
    <div className="bulk-bar">
      <span className="bulk-count">{count} seleccionada{count > 1 ? "s" : ""}</span>

      {/* Priority */}
      <div className="bulk-section">
        <span className="bulk-label">Prioridad</span>
        {PRIORITIES.map((p) => (
          <button
            key={p}
            className="bulk-prio-btn"
            style={{ color: PRIORITY_META[p].color, borderColor: PRIORITY_META[p].color }}
            onClick={() => void applyPriority(p)}
            title={PRIORITY_META[p].label}
          >
            {PRIORITY_META[p].short}
          </button>
        ))}
      </div>

      {/* Due date */}
      <div className="bulk-section">
        <span className="bulk-label">Fecha</span>
        <input
          type="date"
          className="bulk-date"
          onChange={(e) => void applyDate(e.target.value)}
          title="Cambiar fecha a todas las seleccionadas"
        />
      </div>

      {/* Tag */}
      <div className="bulk-section">
        <span className="bulk-label">Etiqueta</span>
        <input
          type="text"
          className="bulk-tag-input"
          value={tagInput}
          placeholder="Nueva etiqueta…"
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void applyTag();
          }}
        />
        <button className="btn-ghost btn-sm" onClick={() => void applyTag()}>
          Añadir
        </button>
      </div>

      {/* List */}
      {lists.length > 0 && (
        <div className="bulk-section">
          <span className="bulk-label">Lista</span>
          <select
            className="bulk-select"
            defaultValue=""
            onChange={(e) => void applyList(e.target.value)}
          >
            <option value="">Mover a…</option>
            <option value="">Sin lista</option>
            {lists.map((l) => (
              <option key={l._id} value={l._id}>{l.name}</option>
            ))}
          </select>
        </div>
      )}

      <button className="btn-danger btn-sm bulk-delete" onClick={() => void handleDelete()}>
        <TrashIcon size={14} /> Eliminar
      </button>

      <button className="bulk-cancel" onClick={onClear} title="Cancelar selección">
        ✕ Cancelar
      </button>
    </div>
  );
}
