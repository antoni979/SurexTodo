import { type Recurrence, type RecurrenceType, WEEKDAYS } from "../util";

const OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "No repetir" },
  { value: "daily", label: "Todos los días" },
  { value: "weekdays", label: "Días laborales (L-V)" },
  { value: "weekly", label: "Cada semana" },
  { value: "monthly", label: "Cada mes" },
  { value: "custom", label: "Días concretos…" },
];

// Types that support an interval multiplier
const INTERVAL_TYPES: RecurrenceType[] = ["daily", "weekly", "monthly"];

export default function RecurrencePicker({
  value,
  onChange,
}: {
  value: Recurrence | undefined;
  onChange: (r: Recurrence | undefined) => void;
}) {
  const current = value?.type ?? "none";
  const interval = value?.interval ?? 1;
  const showInterval = value && INTERVAL_TYPES.includes(value.type);

  function changeType(t: string) {
    if (t === "none") onChange(undefined);
    else if (t === "custom")
      onChange({ type: "custom", days: value?.days ?? [], interval: 1 });
    else onChange({ type: t as RecurrenceType, interval: value?.interval ?? 1 });
  }

  function changeInterval(n: number) {
    if (!value) return;
    onChange({ ...value, interval: Math.max(1, n) });
  }

  function toggleDay(n: number) {
    const days = value?.days ?? [];
    const next = days.includes(n)
      ? days.filter((d) => d !== n)
      : [...days, n];
    onChange({ type: "custom", days: next, interval: value?.interval ?? 1 });
  }

  const unitLabel =
    current === "daily" ? (interval === 1 ? "día" : "días") :
    current === "weekly" ? (interval === 1 ? "semana" : "semanas") :
    current === "monthly" ? (interval === 1 ? "mes" : "meses") : "";

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
            value={interval}
            className="recur-interval-input"
            onChange={(e) => changeInterval(Number(e.target.value))}
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
              value={interval}
              className="recur-interval-input"
              onChange={(e) => changeInterval(Number(e.target.value))}
            />
            <span className="recur-interval-unit">
              {interval === 1 ? "semana" : "semanas"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
