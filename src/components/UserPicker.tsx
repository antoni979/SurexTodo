import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";

type User = { userId: Id<"users">; username: string };

export default function UserPicker({
  users,
  onPick,
}: {
  users: User[];
  onPick: (userId: Id<"users">) => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const filtered = users.filter((u) =>
    u.username.toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function pick(userId: Id<"users">) {
    setBusy(true);
    try {
      await onPick(userId);
      setQuery("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="user-picker">
      <input
        className="picker-input"
        type="text"
        value={query}
        disabled={busy}
        placeholder="Buscar usuario por nombre…"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && (
        <div className="picker-menu">
          {filtered.length === 0 ? (
            <div className="picker-empty">Sin resultados</div>
          ) : (
            filtered.map((u) => (
              <button
                key={u.userId}
                type="button"
                className="picker-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void pick(u.userId);
                }}
              >
                <span className="avatar sm">
                  {u.username.charAt(0).toUpperCase()}
                </span>
                <span className="picker-name">{u.username}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
