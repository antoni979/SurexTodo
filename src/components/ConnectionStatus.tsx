import { useEffect, useState } from "react";
import { useConvexConnectionState } from "convex/react";

/** Aguantamos un poco antes de avisar: las reconexiones normales duran menos
 *  que esto y no queremos un cartel parpadeando cada dos por tres. */
const OFFLINE_GRACE_MS = 2500;

/**
 * Avisa de que se trabaja sin conexión y de cuántos cambios están esperando
 * a enviarse. El cliente de Convex reenvía solo las mutaciones pendientes al
 * reconectar; esto es únicamente para que se vea y puedas fiarte.
 */
export default function ConnectionStatus() {
  const { isWebSocketConnected, inflightMutations } = useConvexConnectionState();
  const [offlineConfirmed, setOfflineConfirmed] = useState(false);

  useEffect(() => {
    if (isWebSocketConnected) {
      setOfflineConfirmed(false);
      return;
    }
    const t = setTimeout(() => setOfflineConfirmed(true), OFFLINE_GRACE_MS);
    return () => clearTimeout(t);
  }, [isWebSocketConnected]);

  // La cola de Convex vive en memoria: si se cierra la app con cambios sin
  // enviar, se pierden. Avisamos antes de cerrar. Ojo: en móvil el navegador
  // suele ignorar este aviso al matar la pestaña, así que es una red de
  // seguridad parcial (sirve sobre todo en escritorio), no una garantía.
  useEffect(() => {
    if (inflightMutations === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [inflightMutations]);

  if (!offlineConfirmed) return null;

  return (
    <div className="conn-status" role="status">
      <span className="conn-dot" />
      Sin conexión
      {inflightMutations > 0 && (
        <>
          {" · "}
          {inflightMutations}{" "}
          {inflightMutations === 1 ? "cambio pendiente" : "cambios pendientes"}
        </>
      )}
    </div>
  );
}
