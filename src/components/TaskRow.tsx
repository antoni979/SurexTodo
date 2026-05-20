import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  type EnrichedTask,
  type Priority,
  PRIORITY_META,
  formatDue,
  recurrenceLabel,
} from "../util";
import { SunIcon, CheckIcon, RepeatIcon } from "./icons";

export default function TaskRow({
  task,
  today,
  selected,
  showTeam,
  onSelect,
}: {
  task: EnrichedTask;
  today: string;
  selected: boolean;
  showTeam: boolean;
  onSelect: () => void;
}) {
  const toggleComplete = useMutation(api.tasks.toggleComplete);
  const setMyDay = useMutation(api.tasks.setMyDay);

  const prio = PRIORITY_META[task.priority as Priority];
  const due = task.dueDate ? formatDue(task.dueDate, today) : null;

  return (
    <div
      className={
        "task-row" +
        (task.completed ? " done" : "") +
        (selected ? " selected" : "")
      }
      onClick={onSelect}
    >
      <button
        className={"check" + (task.completed ? " checked" : "")}
        title={task.completed ? "Marcar como pendiente" : "Completar"}
        onClick={(e) => {
          e.stopPropagation();
          void toggleComplete({ taskId: task._id, today });
        }}
      >
        {task.completed && <CheckIcon size={13} />}
      </button>

      <div className="task-main">
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          <span className="chip" style={{ color: prio.color }}>
            <span className="dot" style={{ background: prio.color }} />
            {prio.label}
          </span>
          {due && (
            <span className={"chip" + (due.overdue ? " overdue" : "")}>
              {due.overdue ? "Venció: " : ""}
              {due.label}
            </span>
          )}
          {task.recurrence && (
            <span className="chip recur">
              <RepeatIcon size={11} />
              {recurrenceLabel(task.recurrence)}
            </span>
          )}
          {showTeam && task.teamName && (
            <span className="chip team">{task.teamName}</span>
          )}
          {task.assigneeName && (
            <span className="chip">Asignada a {task.assigneeName}</span>
          )}
        </div>
      </div>

      <button
        className={"sun-btn" + (task.inMyDay ? " on" : "")}
        title={task.inMyDay ? "Quitar de Mi día" : "Añadir a Mi día"}
        onClick={(e) => {
          e.stopPropagation();
          void setMyDay({
            taskId: task._id,
            today,
            inMyDay: !task.inMyDay,
          });
        }}
      >
        <SunIcon size={17} />
      </button>
    </div>
  );
}
