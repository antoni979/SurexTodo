import { useState } from "react";
import { CloseIcon, SunIcon, CalendarIcon, ListIcon } from "./icons";
import type { View } from "./MainApp";

type DefaultViewKind = "myday" | "planned" | "tasks" | "calendar";

const OPTIONS: {
  value: DefaultViewKind;
  label: string;
  icon: (p: { size?: number }) => React.ReactNode;
}[] = [
  { value: "myday", label: "Mi día", icon: SunIcon },
  { value: "planned", label: "Planeado", icon: CalendarIcon },
  { value: "tasks", label: "Tareas", icon: ListIcon },
  { value: "calendar", label: "Calendario", icon: CalendarIcon },
];

export default function SettingsModal({
  onClose,
  onSelectDefaultView,
}: {
  onClose: () => void;
  onSelectDefaultView?: (v: View) => void;
}) {
  const [defaultView, setDefaultView] = useState<DefaultViewKind>(
    () => (localStorage.getItem("defaultView") as DefaultViewKind) || "myday",
  );

  function choose(v: DefaultViewKind) {
    setDefaultView(v);
    localStorage.setItem("defaultView", v);
  }

  return (
    <div
      className="settings-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="settings-modal">
        <div className="settings-head">
          <h2>Configuración</h2>
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="settings-section">
          <label className="settings-label">Pantalla de inicio</label>
          <p className="settings-hint">
            Elige qué pantalla se abre al entrar en la aplicación.
          </p>
          <div className="settings-options">
            {OPTIONS.map((o) => {
              const Icon = o.icon;
              const active = defaultView === o.value;
              return (
                <button
                  key={o.value}
                  className={"settings-option" + (active ? " active" : "")}
                  onClick={() => choose(o.value)}
                >
                  <Icon size={18} />
                  <span>{o.label}</span>
                  {active && <span className="settings-check">✓</span>}
                </button>
              );
            })}
          </div>
          {onSelectDefaultView && (
            <button
              className="btn-ghost btn-sm settings-goto"
              onClick={() => {
                onSelectDefaultView(
                  defaultView === "planned"
                    ? { kind: "planned" }
                    : defaultView === "tasks"
                    ? { kind: "tasks" }
                    : defaultView === "calendar"
                    ? { kind: "calendar" }
                    : { kind: "myday" },
                );
                onClose();
              }}
            >
              Ir a esa pantalla ahora
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
