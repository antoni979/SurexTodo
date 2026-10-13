import { useEffect, useState } from "react";
import { useConvexConnectionState } from "../data/react";

/** Aguantamos un poco antes de avisar: las reconexiones normales duran menos
 *  que esto y no queremos un cartel parpadeando cada dos por tres. */
const OFFLINE_GRACE_MS = 2500;

/**
 * Avisa de que se trabaja sin conexión y de cuántos cambios están esperando
 * a enviarse. La cola offline (src/data/react.ts) los guarda en disco y los
 * reenvía sola al reconectar; esto es únicamente para que se vea y puedas
 * fiarte.
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
