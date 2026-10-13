import { useAuthActions } from "../data/react";
import { forgetUser } from "../lib/queryCache";

// Tener cuenta en la Intranet no da acceso al todo: hay que estar dado de
// alta en él. Esta pantalla sustituye a la antigua de "elige tu nombre de
// usuario", que ya no hace falta (los nombres vienen de la migración).
export default function NoAccess() {
  const { signOut } = useAuthActions();
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/icon.svg" alt="" width={48} height={48} />
          <h1>SurexTodo</h1>
        </div>
        <p className="auth-sub">
          Tu usuario de la Intranet todavía no tiene acceso a SurexTodo. Pídeselo a Antoni.
        </p>
        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            forgetUser();
            void signOut();
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
