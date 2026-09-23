import { useEffect, useMemo, useRef } from "react";
import { useQuery, useConvexAuth } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { cacheKey, readCache, writeCache } from "../lib/queryCache";

/**
 * Igual que useQuery, pero mientras Convex responde devuelve el último
 * resultado conocido en vez de `undefined`.
 *
 * Así la pantalla sale poblada al instante al abrir la app en frío y se
 * refresca sola cuando llegan los datos buenos, en vez de encadenar cuatro
 * pantallas de "Cargando…".
 *
 * OJO con el guard de `isAuthenticated`: ConvexProvider NO retiene las
 * queries mientras se resuelve el token, así que durante ese rato salen a la
 * red sin autenticar y TODAS estas queries responden `[]` (lo comprobé: hacen
 * `if (!userId) return []`). Sin el guard, ese `[]` pisaría la caché buena y
 * veríamos las listas vacías justo al abrir. Mientras no haya sesión
 * confirmada, lo que llega del servidor no se pinta ni se cachea.
 *
 * Sigue devolviendo `undefined` si esa query no se ha cargado nunca en este
 * dispositivo, así que el `=== undefined` que ya usan las vistas para
 * detectar "cargando" funciona igual la primera vez.
 */
export function useCachedQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: Query["_args"] | "skip",
): Query["_returnType"] | undefined {
  const { isAuthenticated } = useConvexAuth();
  const live = useQuery(query, args as never) as Query["_returnType"] | undefined;

  const name = getFunctionName(query);
  const argsKey = args === "skip" ? "skip" : JSON.stringify(args);

  const key = useMemo(
    () => (args === "skip" ? null : cacheKey(name, args)),
    // Los args son un objeto nuevo en cada render, así que dependemos de su
    // contenido serializado, no de la identidad del objeto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, argsKey],
  );

  const cached = useMemo(
    () => (key ? readCache<Query["_returnType"]>(key) : undefined),
    [key],
  );

  // Solo nos fiamos del resultado si la sesión ya está confirmada.
  const trusted = isAuthenticated ? live : undefined;

  // Último valor bueno de ESTA misma query. Durante un refresco de token
  // `isAuthenticated` baja un instante; sin esto volveríamos al valor que
  // había en disco al montar el componente, que puede ser de hace días.
  const lastGood = useRef<{ key: string | null; value: unknown }>({
    key: null,
    value: undefined,
  });
  if (lastGood.current.key !== key) {
    lastGood.current = { key, value: undefined };
  }
  if (trusted !== undefined) {
    lastGood.current = { key, value: trusted };
  }

  useEffect(() => {
    if (key && trusted !== undefined) writeCache(key, trusted);
  }, [key, trusted]);

  if (trusted !== undefined) return trusted;
  if (lastGood.current.value !== undefined) {
    return lastGood.current.value as Query["_returnType"];
  }
  return cached;
}
