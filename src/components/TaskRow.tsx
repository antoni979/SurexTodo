import { useMutation } from "../data/react";
import { api } from "../data/api";
import { type EnrichedTask, type Priority, PRIORITY_META, formatDue } from "../util";
import { useSwipe } from "../hooks/useSwipe";
import { SunIcon, CheckIcon, RepeatIcon, SubtasksIcon, FolderIcon } from "./icons";

/**
 * Fila compacta de UNA línea: círculo de completar, título y, a la derecha,
 * solo lo que aporta de un vistazo (repetición, subtareas, a quién está
 * asignada si es de equipo, y la fecha). El resto vive en el detalle.
 *
 * La prioridad se ve en el color del círculo, y solo para Alta y Urgente:
 * si todas las tareas llevan color, ninguno llama la atención.
 *
 * En móvil: deslizar a la derecha = Mi día, a la izquierda = completar.
 */
export default function TaskRow({
  task,
  today,
  selected,
  onSelect,
  selectMode = false,
  isSelected = false,
  onToggleSelect,
  showMyDayMark = true,
}: {
  task: EnrichedTask;
  today: string;
  selected: boolean;
  /** Se mantiene por compatibilidad: el equipo ahora solo sale en el detalle. */
  showTeam?: boolean;
  onSelect: () => void;
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  /** En la propia vista Mi día no tiene sentido marcar cada fila con el sol. */
  showMyDayMark?: boolean;
}) {
  const toggleComplete = useMutation(api.tasks.toggleComplete);
  const setMyDay = useMutation(api.tasks.setMyDay);

  const due = task.dueDate ? formatDue(task.dueDate, today) : null;
  const strongPrio = task.priority === "urgente" || task.priority === "alta";
  const prioColor = PRIORITY_META[task.priority as Priority]?.color;

  const complete = () =>
    void toggleComplete({ taskId: task._id, today, completed: !task.completed });
  const myDay = () => void setMyDay({ taskId: task._id, today, inMyDay: !task.inMyDay });

  const swipe = useSwipe({
    onRight: task.isProject ? undefined : myDay,
    onLeft: task.isProject ? undefined : complete,
    disabled: selectMode,
  });

  return (
    <div className="task-swipe">
      {swipe.offset !== 0 && (
        <div
          className={
            "task-swipe-bg " +
            (swipe.offset > 0 ? "to-myday" : "to-done") +
            (swipe.armed ? " armed" : "")
          }
        >
          {swipe.offset > 0 ? (
            <span>
              <SunIcon size={18} /> {task.inMyDay ? "Quitar de Mi día" : "Mi día"}
            </span>
          ) : (
            <span className="right">
              {task.completed ? "Pendiente" : "Hecha"} <CheckIcon size={18} />
            </span>
          )}
        </div>
      )}
      <div
        className={[
          "task-row",
          task.completed ? "done" : "",
          selected ? "selected" : "",
          isSelected ? "bulk-selected" : "",
          swipe.dragging ? "dragging" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined}
        {...swipe.handlers}
        onClick={() => {
          if (swipe.consumeClick()) return;
          onSelect();
        }}
      >
        {selectMode ? (
          <input
            type="checkbox"
            className="bulk-checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect?.();
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            className={"check" + (task.completed ? " checked" : "")}
            style={strongPrio && !task.completed ? { borderColor: prioColor } : undefined}
            title={
              (task.completed ? "Marcar como pendiente" : "Completar") +
              (strongPrio ? ` · prioridad ${PRIORITY_META[task.priority as Priority].label}` : "")
            }
            onClick={(e) => {
              e.stopPropagation();
              complete();
            }}
          >
            {task.completed && <CheckIcon size={12} />}
          </button>
        )}

        <span className="task-title">
          {task.isProject && <FolderIcon size={14} className="task-title-icon" />}
          {task.title}
        </span>

        <span className="task-side">
          {task.recurrence && !task.isProject && (
            <span className="task-ico" title="Se repite">
              <RepeatIcon size={13} />
            </span>
          )}
          {task.subtaskTotal > 0 && !task.isProject && (
            <span className="task-ico" title="Subtareas">
              <SubtasksIcon size={13} />
              {task.subtaskDone}/{task.subtaskTotal}
            </span>
          )}
          {showMyDayMark && task.inMyDay && !task.completed && (
            <span className="task-ico myday" title="En Mi día">
              <SunIcon size={13} />
            </span>
          )}
          {task.teamId && task.assigneeName && (
            <span className="task-avatar" title={`Asignada a ${task.assigneeName}`}>
              {task.assigneeName.charAt(0).toUpperCase()}
            </span>
          )}
          {due && (
            <span
              className={
                "task-due" + (due.overdue && !task.completed ? " overdue" : "") + (due.diff === 0 ? " today" : "")
              }
            >
              {task.isProject ? "Revisión · " : ""}
              {due.label}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
