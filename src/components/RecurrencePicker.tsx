import { type Recurrence, type RecurrenceType, WEEKDAYS } from "../util";

const OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "No repetir" },
  { value: "daily", label: "Todos los días" },
  { value: "weekdays", label: "Días laborales (L-V)" },
  { value: "weekly", label: "Todas las semanas" },
  { value: "monthly", label: "Todos los meses" },
  { value: "custom", label: "Días concretos…" },
];

export default function RecurrencePicker({
  value,
  onChange,
}: {
  value: Recurrence | undefined;
  onChange: (r: Recurrence | undefined) => void;
}) {
  const current = value?.type ?? "none";

  function changeType(t: string) {
    if (t === "none") onChange(undefined);
    else if (t === "custom")
      onChange({ type: "custom", days: value?.days ?? [] });
    else onChange({ type: t as RecurrenceType });
  }

  function toggleDay(n: number) {
    const days = value?.days ?? [];
    const next = days.includes(n)
      ? days.filter((d) => d !== n)
      : [...days, n];
    onChange({ type: "custom", days: next });
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
        </div>
      )}
    </div>
  );
}
