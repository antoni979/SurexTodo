import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { type EnrichedTask, type Priority, PRIORITY_META, dayDiff } from "../../util";
import TaskRow from "../TaskRow";
import TaskDetail from "../TaskDetail";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function ymd(d: Date): string {
  return (
    d.getFullYear() +
    "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0")
  );
}

function parseYM(ym: string): [number, number] {
  const [y, m] = ym.split("-").map(Number);
  return [y, m];
}

export default function CalendarView({
  today,
  onOpenProject,
  workspaceId,
}: {
  today: string;
  onOpenProject?: (id: Id<"tasks">) => void;
  workspaceId?: Id<"workspaces"> | null;
}) {
  const [currentYM, setCurrentYM] = useState(() => today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(today);
  const [modalTask, setModalTask] = useState<EnrichedTask | null>(null);

  const tasks = useQuery(api.tasks.listPlanned, {
    today,
    ...(workspaceId ? { workspaceId } : {}),
  }) ?? [];

  // Group tasks by dueDate
  const byDate = useMemo(() => {
    const map = new Map<string, EnrichedTask[]>();
    for (const t of tasks) {
      const d = t.dueDate;
      if (!d) continue;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(t);
    }
    return map;
  }, [tasks]);

  // Build calendar grid (Mon-first, always 5-6 rows)
  const days = useMemo(() => {
    const [y, m] = parseYM(currentYM);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);

    const startOffset = (first.getDay() + 6) % 7;

    const cells: { date: string; inMonth: boolean }[] = [];
    const prev = new Date(first);
    prev.setDate(first.getDate() - startOffset);
    const total = Math.ceil((startOffset + last.getDate()) / 7) * 7;
    for (let i = 0; i < total; i++) {
      const d = new Date(prev);
      d.setDate(prev.getDate() + i);
      cells.push({ date: ymd(d), inMonth: d.getMonth() === m - 1 });
    }
    return cells;
  }, [currentYM]);

  function prevMonth() {
    const [y, m] = parseYM(currentYM);
    const d = new Date(y, m - 2, 1);
    setCurrentYM(ymd(d).slice(0, 7));
  }
  function nextMonth() {
    const [y, m] = parseYM(currentYM);
    const d = new Date(y, m, 1);
    setCurrentYM(ymd(d).slice(0, 7));
  }

  const [y, m] = parseYM(currentYM);
  const monthLabel = `${MONTHS[m - 1]} ${y}`;

  const dayTasks = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  return (
    <div className="screen calendar-screen">
      {/* ── header ── */}
      <header className="screen-head calendar-head" style={{ color: "#3a6ea5" }}>
        <div className="calendar-nav">
          <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
          <h1>{monthLabel}</h1>
          <button className="cal-nav-btn" onClick={nextMonth}>›</button>
          <button
            className="cal-today-btn"
            onClick={() => { setCurrentYM(today.slice(0, 7)); setSelectedDate(today); }}
          >
            Hoy
          </button>
        </div>
      </header>

      <div className="screen-scroll calendar-scroll">
        {/* ── grid ── */}
        <div className="cal-grid">
          {WEEKDAYS.map((d) => (
            <div key={d} className="cal-header-cell">{d}</div>
          ))}

          {days.map(({ date, inMonth }) => {
            const dayTaskList = byDate.get(date) ?? [];
            const pending = dayTaskList.filter((t) => !t.completed);
            const done = dayTaskList.filter((t) => t.completed);
            const isToday = date === today;
            const isSelected = date === selectedDate;
            const overdue = inMonth && dayDiff(date, today) < 0 && pending.length > 0;

            return (
              <button
                key={date}
                className={[
                  "cal-cell",
                  !inMonth ? "cal-cell-out" : "",
                  isToday ? "cal-cell-today" : "",
                  isSelected ? "cal-cell-selected" : "",
                  overdue ? "cal-cell-overdue" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => { setSelectedDate(date); }}
              >
                <span className="cal-day-num">{Number(date.slice(8))}</span>
                {dayTaskList.length > 0 && (
                  <div className="cal-dots">
                    {pending.slice(0, 4).map((t) => (
                      <span
                        key={t._id}
                        className="cal-dot"
                        style={{
                          background:
                            PRIORITY_META[t.priority as Priority]?.color ?? "#9ca3af",
                        }}
                      />
                    ))}
                    {done.length > 0 && pending.length < 4 && (
                      <span className="cal-dot cal-dot-done" />
                    )}
                    {dayTaskList.length > 5 && (
                      <span className="cal-dot-more">+{dayTaskList.length - 5}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* ── day panel ── */}
        {selectedDate && (
          <div className="cal-day-panel">
            <div className="cal-day-panel-head">
              <span className="cal-day-title">
                {new Date(selectedDate + "T12:00:00").toLocaleDateString("es-ES", {
                  weekday: "long", day: "numeric", month: "long",
                })}
              </span>
              {dayTasks.length === 0 && (
                <span className="cal-day-empty">Sin tareas</span>
              )}
            </div>
            {dayTasks.map((t) => (
              <TaskRow
                key={t._id}
                task={t}
                today={today}
                selected={false}
                showTeam={true}
                onSelect={() => {
                  if (t.isProject && onOpenProject) {
                    onOpenProject(t._id);
                  } else {
                    setModalTask(t);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Task detail modal ── */}
      {modalTask && (
        <div
          className="cal-modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setModalTask(null); }}
        >
          <div className="cal-modal">
            <TaskDetail
              key={modalTask._id}
              task={modalTask}
              today={today}
              onClose={() => setModalTask(null)}
              onOpenProject={onOpenProject}
            />
          </div>
        </div>
      )}
    </div>
  );
}
