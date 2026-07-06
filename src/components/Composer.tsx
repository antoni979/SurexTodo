import { useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  PRIORITIES,
  PRIORITY_META,
  type Priority,
  type Recurrence,
  slog,
} from "../util";
import { PlusIcon } from "./icons";
import RecurrencePicker from "./RecurrencePicker";

export type ComposerData = {
  title: string;
  priority: Priority;
  dueDate?: string;
  assigneeId?: Id<"users">;
  recurrence?: Recurrence;
  tags?: string[];
};

type Member = { userId: Id<"users">; username: string };

export default function Composer({
  members,
  defaultDueDate,
  placeholder = "Añadir una tarea",
  onCreate,
  workspaceId,
}: {
  members?: Member[];
  defaultDueDate?: string;
  placeholder?: string;
  onCreate: (data: ComposerData) => Promise<void>;
  workspaceId?: Id<"workspaces"> | null;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("media");
  const [dueDate, setDueDate] = useState(defaultDueDate ?? "");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(
    undefined,
  );
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagFocused, setTagFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ref al input real: leemos el título del DOM al enviar, por si una extensión
  // del navegador (Grammarly, traductores, gestores de formularios…) modifica
  // el campo sin disparar el onChange de React y el estado queda vacío.
  const titleRef = useRef<HTMLInputElement>(null);

  const allTags =
    useQuery(api.tasks.listAllTags, workspaceId ? { workspaceId } : {}) ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Fuente de verdad = valor real del input en el DOM; el estado de React es
    // solo el respaldo (puede quedar desincronizado por extensiones).
    const domTitle = titleRef.current?.value ?? "";
    const finalTitle = (domTitle || title).trim();
    slog("submit disparado", { estado: title, dom: domTitle, busy });
    if (!finalTitle) {
      slog("corte: título vacío (ni estado ni DOM)");
      return;
    }
    if (busy) {
      slog("corte: ocupado (busy=true)");
      return;
    }
    setBusy(true);
    setError(null);
    const t0 = performance.now();
    slog("crear tarea →", {
      title: finalTitle,
      workspaceId: workspaceId ?? "(null/Personal)",
      dueDate: dueDate || "(sin fecha)",
    });
    try {
      // Watchdog: si la mutación no responde en 8s, mostramos error en vez de
      // quedarnos colgados en silencio (típico de WS bloqueado o sesión caída).
      const watchdog = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Sin respuesta del servidor (8s). Posible bloqueo de red, PWA cacheada o sesión caducada. Prueba en una ventana de incógnito.",
              ),
            ),
          8000,
        ),
      );
      await Promise.race([
        onCreate({
          title: finalTitle,
          priority,
          dueDate: dueDate || undefined,
          assigneeId: assigneeId ? (assigneeId as Id<"users">) : undefined,
          recurrence,
          tags: tags.length > 0 ? tags : undefined,
        }),
        watchdog,
      ]);
      slog(`tarea creada OK en ${Math.round(performance.now() - t0)}ms`);
      // Reset (estado + DOM, por si el input está gestionado por una extensión)
      setTitle("");
      if (titleRef.current) titleRef.current.value = "";
      setPriority("media");
      setDueDate(defaultDueDate ?? "");
      setAssigneeId("");
      setRecurrence(undefined);
      setTags([]);
      setTagInput("");
    } catch (err) {
      slog("FALLO al crear", err instanceof Error ? err.message : String(err));
      setError(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  function addTag(val: string) {
    const t = val.trim().replace(/,/g, "");
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  const tagSuggestions = tagFocused
    ? allTags.filter(
        (t) =>
          !tags.includes(t) &&
          (tagInput.trim() === "" ||
            t.toLowerCase().includes(tagInput.trim().toLowerCase())),
      )
    : [];

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-main">
        <span className="composer-plus">
          <PlusIcon size={18} />
        </span>
        <input
          ref={titleRef}
          className="composer-input"
          type="text"
          // No controlado a propósito: si fuese value={title}, React revertiría
          // el texto que una extensión inyecte en el DOM. Leemos por ref.
          defaultValue=""
          onChange={(e) => setTitle(e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="submit"
          className="btn-primary btn-sm"
          disabled={busy}
          onClick={() => slog("clic en Agregar")}
        >
          Agregar
        </button>
      </div>
      <div className="composer-options">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          title="Prioridad"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_META[p].label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          title="Fecha de vencimiento"
        />
        {members && (
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            title="Asignar a"
          >
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.username}
              </option>
            ))}
          </select>
        )}
        <RecurrencePicker value={recurrence} onChange={setRecurrence} />
      </div>

      {/* Tags row */}
      <div className="composer-tags">
        {tags.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
            <button
              type="button"
              className="tag-chip-remove"
              onClick={() => removeTag(tag)}
            >
              ×
            </button>
          </span>
        ))}
        <div className="tag-autocomplete" style={{ position: "relative" }}>
          <input
            type="text"
            className="tag-input"
            value={tagInput}
            placeholder="Etiqueta…"
            autoComplete="off"
            onChange={(e) => setTagInput(e.target.value)}
            onFocus={() => setTagFocused(true)}
            onBlur={() => setTimeout(() => setTagFocused(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(tagInput);
              } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
                setTags(tags.slice(0, -1));
              }
            }}
          />
          {tagSuggestions.length > 0 && (
            <div className="tag-suggestions">
              {tagSuggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  className="tag-suggestion"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(sug);
                  }}
                >
                  {sug}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <div className="composer-error">{error}</div>}
    </form>
  );
}
