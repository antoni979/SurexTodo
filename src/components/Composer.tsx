import { useRef, useState } from "react";
import { useConvexConnectionState } from "../data/react";
import { useCachedQuery } from "../hooks/useCachedQuery";
import { api } from "../data/api";
import type { Id } from "../data/types";
import {
  PRIORITIES,
  PRIORITY_META,
  type Priority,
  type Recurrence,
  localToday,
  tomorrow,
  shortDate,
  recurrenceLabel,
} from "../util";
import { CalendarIcon, FlagIcon, ListIcon, RepeatIcon, UsersIcon } from "./icons";
import RecurrencePicker from "./RecurrencePicker";

export type ComposerData = {
  title: string;
  priority: Priority;
  dueDate?: string;
  assigneeId?: Id<"users">;
  recurrence?: Recurrence;
  tags?: string[];
  listId?: Id<"lists">;
};

type Member = { userId: Id<"users">; username: string };
type ListOption = { _id: Id<"lists">; name: string };

export default function Composer({
  members,
  defaultDueDate,
  placeholder = "Añadir una tarea",
  onCreate,
  workspaceId,
  lists,
}: {
  members?: Member[];
  defaultDueDate?: string;
  placeholder?: string;
  onCreate: (data: ComposerData) => Promise<void>;
  workspaceId?: Id<"workspaces"> | null;
  /** Si se pasa, se muestra un selector para asignar la tarea a una lista al crearla. */
  lists?: ListOption[];
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("media");
  const [dueDate, setDueDate] = useState(defaultDueDate ?? "");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [listId, setListId] = useState<string>("");
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(
    undefined,
  );
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagFocused, setTagFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const { isWebSocketConnected } = useConvexConnectionState();
  // Ref al input real: leemos el título del DOM al enviar, por si una extensión
  // del navegador modifica el campo sin disparar el onChange de React.
  const titleRef = useRef<HTMLInputElement>(null);
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const today = localToday();
  const tmr = tomorrow(today);

  const allTags =
    useCachedQuery(api.tasks.listAllTags, workspaceId ? { workspaceId } : {}) ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const domTitle = titleRef.current?.value ?? "";
    // Si el título está vacío pero el usuario escribió en el campo de
    // etiqueta (confusión habitual con el otro input visible), usamos ese
    // texto como título — es claramente su intención.
    const finalTitle = (domTitle || title || tagInput).trim();
    if (!finalTitle || busy) return;
    setBusy(true);
    setError(null);
    setQueued(false);

    const inflight = onCreate({
      title: finalTitle,
      priority,
      dueDate: dueDate || undefined,
      assigneeId: assigneeId ? (assigneeId as Id<"users">) : undefined,
      recurrence,
      tags: tags.length > 0 ? tags : undefined,
      listId: listId ? (listId as Id<"lists">) : undefined,
    });

    function resetForm() {
      setTitle("");
      if (titleRef.current) titleRef.current.value = "";
      setPriority("media");
      setDueDate(defaultDueDate ?? "");
      setAssigneeId("");
      setListId("");
      setRecurrence(undefined);
      setTags([]);
      setTagInput("");
      setShowRecurrence(false);
      setShowTags(false);
      titleRef.current?.focus();
    }

    // Sin conexión no tiene sentido esperar: la cola offline guarda la
    // tarea en disco y la reenvía sola al reconectar. Antes esperábamos 8s y
    // luego decíamos "sin respuesta del servidor", así que parecía que la
    // tarea se había perdido cuando en realidad estaba en cola.
    if (!isWebSocketConnected) {
      void inflight.catch(() => {
        /* se reintenta al reconectar */
      });
      resetForm();
      setQueued(true);
      setBusy(false);
      return;
    }

    const TIMED_OUT = Symbol("timeout");
    try {
      const outcome = await Promise.race([
        inflight.then(() => "ok" as const),
        new Promise<typeof TIMED_OUT>((resolve) =>
          setTimeout(() => resolve(TIMED_OUT), 6000),
        ),
      ]);
      resetForm();
      if (outcome === TIMED_OUT) {
        // Tarda más de la cuenta, pero sigue encolada: liberamos el
        // formulario y avisamos, en vez de dar por fallido algo que va a
        // llegar. Si acaba fallando de verdad, se muestra el error.
        setQueued(true);
        void inflight.catch((err) =>
          setError(err instanceof Error ? err.message : "No se pudo crear"),
        );
      }
    } catch (err) {
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

  // Los atajos no deben quitarle el foco al título: en el móvil eso cierra el
  // teclado y habría que volver a tocar el campo para cada tarea.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();
  const strongPrio = priority === "urgente" || priority === "alta";
  const customDate = dueDate && dueDate !== today && dueDate !== tmr;

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-main">
        <span
          className="composer-dot"
          style={strongPrio ? { borderColor: PRIORITY_META[priority].color } : undefined}
        />
        <input
          ref={titleRef}
          className="composer-input"
          type="text"
          autoFocus
          enterKeyHint="done"
          // No controlado a propósito: si fuese value={title}, React revertiría
          // el texto que una extensión inyecte en el DOM. Leemos por ref.
          defaultValue=""
          onChange={(e) => setTitle(e.target.value)}
          placeholder={placeholder}
        />
      </div>

      {/* Atajos de un toque. Los desplegables nativos van superpuestos e
          invisibles sobre cada chip: en el móvil abren el selector del sistema. */}
      <div className="composer-quick">
        <button
          type="button"
          onMouseDown={keepFocus}
          className={"qchip" + (dueDate === today ? " on" : "")}
          onClick={() => setDueDate(dueDate === today ? "" : today)}
        >
          Hoy
        </button>
        <button
          type="button"
          onMouseDown={keepFocus}
          className={"qchip" + (dueDate === tmr ? " on" : "")}
          onClick={() => setDueDate(dueDate === tmr ? "" : tmr)}
        >
          Mañana
        </button>
        <label className={"qchip" + (customDate ? " on" : "")}>
          <CalendarIcon size={14} />
          {customDate ? shortDate(dueDate) : "Fecha"}
          <input
            type="date"
            className="qchip-native"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            aria-label="Fecha de vencimiento"
          />
        </label>
        <label className={"qchip" + (priority !== "media" ? " on" : "")}>
          <FlagIcon size={14} />
          {priority === "media" ? "Prioridad" : PRIORITY_META[priority].short}
          <select
            className="qchip-native"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            aria-label="Prioridad"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_META[p].label}
              </option>
            ))}
          </select>
        </label>
        {lists && lists.length > 0 && (
          <label className={"qchip" + (listId ? " on" : "")}>
            <ListIcon size={14} />
            {listId ? lists?.find((l) => l._id === listId)?.name : "Lista"}
            <select
              className="qchip-native"
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              aria-label="Lista"
            >
              <option value="">Sin lista</option>
              {lists.map((l) => (
                <option key={l._id} value={l._id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {members && (
          <label className={"qchip" + (assigneeId ? " on" : "")}>
            <UsersIcon size={14} />
            {assigneeId ? members?.find((m) => m.userId === assigneeId)?.username : "Asignar"}
            <select
              className="qchip-native"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              aria-label="Asignar a"
            >
              <option value="">Sin asignar</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.username}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onMouseDown={keepFocus}
          className={"qchip" + (recurrence ? " on" : "")}
          onClick={() => setShowRecurrence((v) => !v)}
          aria-label="Repetir"
        >
          <RepeatIcon size={14} />
          {recurrence ? recurrenceLabel(recurrence) : ""}
        </button>
        <button
          type="button"
          onMouseDown={keepFocus}
          className={"qchip" + (tags.length ? " on" : "")}
          onClick={() => setShowTags((v) => !v)}
          aria-label="Etiquetas"
        >
          #{tags.length ? " " + tags.length : ""}
        </button>
      </div>

      {showRecurrence && (
        <div className="composer-extra">
          <RecurrencePicker value={recurrence} onChange={setRecurrence} />
        </div>
      )}

      {showTags && (
        <div className="composer-tags">
          {tags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
              <button type="button" className="tag-chip-remove" onClick={() => removeTag(tag)}>
                ×
              </button>
            </span>
          ))}
          <div className="tag-autocomplete" style={{ position: "relative" }}>
            <input
              type="text"
              className="tag-input"
              value={tagInput}
              placeholder="Etiqueta y pulsa Intro"
              autoComplete="off"
              autoFocus
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
      )}

      <div className="composer-foot">
        {error ? (
          <span className="composer-error">{error}</span>
        ) : queued ? (
          <span className="composer-queued">Guardada. Se enviará al recuperar la conexión.</span>
        ) : (
          <span className="composer-hint">Intro añade y sigue con la siguiente</span>
        )}
        <button type="submit" className="btn-primary btn-sm" disabled={busy}>
          Añadir
        </button>
      </div>
    </form>
  );
}
