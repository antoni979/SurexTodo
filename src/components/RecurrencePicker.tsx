import { useState, useEffect } from "react";
import { type Recurrence, type RecurrenceType, WEEKDAYS } from "../util";

const OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "No repetir" },
  { value: "daily", label: "Todos los días" },
  { value: "weekdays", label: "Días laborales (L-V)" },
  { value: "weekly", label: "Cada semana" },
  { value: "monthly", label: "Cada mes" },
  { value: "custom", label: "Días concretos…" },
];

const INTERVAL_TYPES: RecurrenceType[] = ["daily", "weekly", "monthly"];

const UNIT_LABEL: Record<string, [string, string]> = {
  daily: ["día", "días"],
  weekly: ["semana", "semanas"],
  monthly: ["mes", "meses"],
  custom: ["semana", "semanas"],
};

export default function RecurrencePicker({
  value,
  onChange,
}: {
  value: Recurrence | undefined;
  onChange: (r: Recurrence | undefined) => void;
}) {
  const current = value?.type ?? "none";
  // Local interval so the number input responds instantly without waiting for Convex
  const [localInterval, setLocalInterval] = useState<number>(value?.interval ?? 1);

  // Sync local interval if parent value changes (e.g. initial load)
  useEffect(() => {
    setLocalInterval(value?.interval ?? 1);
  }, [value?.interval]);

  const showInterval = value !== undefined && INTERVAL_TYPES.includes(value.type);
  const [sing, plur] = UNIT_LABEL[current] ?? ["vez", "veces"];
  const unitLabel = localInterval === 1 ? sing : plur;

  function changeType(t: string) {
    if (t === "none") {
      onChange(undefined);
    } else if (t === "custom") {
      const iv = localInterval;
      onChange({ type: "custom", days: value?.days ?? [], interval: iv });
    } else {
      const iv = localInterval;
      onChange({ type: t as RecurrenceType, interval: iv });
    }
  }

  function commitInterval(n: number) {
    const safe = Math.max(1, Math.min(99, isNaN(n) ? 1 : n));
    setLocalInterval(safe);
    if (!value) return;
    onChange({ ...value, interval: safe });
  }

  function toggleDay(n: number) {
    const days = value?.days ?? [];
    const next = days.includes(n)
      ? days.filter((d) => d !== n)
      : [...days, n];
    onChange({ type: "custom", days: next, interval: localInterval });
  }

  return (
    <div className="recur-picker">
      <select
        value={current}
        onChange={(e) => changeType(e.target.value)}
        title="Repetir tarea"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {showInterval && (
        <div className="recur-interval">
          <span className="recur-interval-label">Cada</span>
          <input
            type="number"
            min={1}
            max={99}
            value={localInterval}
            className="recur-interval-input"
            // Update local state on every keystroke for responsive feel
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n)) setLocalInterval(n);
              else setLocalInterval(0); // allow clearing to retype
            }}
            // Commit to Convex only when user leaves the field or presses Enter
            onBlur={(e) => commitInterval(parseInt(e.target.value, 10))}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitInterval(localInterval);
            }}
          />
          <span className="recur-interval-unit">{unitLabel}</span>
        </div>
      )}

      {current === "custom" && (
        <div className="day-toggles">
          {WEEKDAYS.map((w) => {
            const on = (value?.days ?? []).includes(w.n);
            return (
              <button
                key={w.n}
                type="button"
                className={"day-toggle" + (on ? " on" : "")}
                onClick={() => toggleDay(w.n)}
                title={w.label}
              >
                {w.label}
              </button>
            );
          })}
          <div className="recur-interval" style={{ marginTop: 4 }}>
            <span className="recur-interval-label">Cada</span>
            <input
              type="number"
              min={1}
              max={99}
              value={localInterval}
              className="recur-interval-input"
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n)) setLocalInterval(n);
              }}
              onBlur={(e) => commitInterval(parseInt(e.target.value, 10))}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitInterval(localInterval);
              }}
            />
            <span className="recur-interval-unit">{unitLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}
