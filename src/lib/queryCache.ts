/**
 * Caché local del último resultado conocido de cada query.
 *
 * El problema que resuelve: al abrir la app en frío había 4 idas y vueltas de
 * red EN SERIE (refresco de token → profiles.me → workspaces → tareas), cada
 * una con su pantalla de "Cargando…". En móvil con la radio dormida eso son
 * varios segundos mirando el logo antes de poder escribir nada. Con esta
 * caché la app pinta el último estado conocido al instante y Convex va
 * refrescando por detrás.
 *
 * AISLAMIENTO ENTRE USUARIOS (importante):
 * Todo se guarda bajo el userId del dueño de los datos. Al cerrar sesión se
 * borra entero, y si arranca un userId distinto al que dejó la caché, se tira
 * todo antes de leer nada. Nunca se puede pintar en pantalla la caché de otra
 * persona aunque compartan el dispositivo.
 *
 * Se usa localStorage a propósito (no IndexedDB): es síncrono, así que el
 * primer render ya sale con datos. IndexedDB es asíncrono y provocaría
 * justo el parpadeo de pantalla vacía que queremos evitar.
 */

const PREFIX = "sxt:qc:v1:";
const OWNER_KEY = "sxt:qc:owner";

/** Por encima de esto no cacheamos la entrada: no merece la pena y arriesga la cuota. */
const MAX_ENTRY_BYTES = 512 * 1024;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // modo privado, almacenamiento bloqueado…
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Cuota llena o almacenamiento bloqueado. La caché es best-effort: si no
    // cabe, la app sigue funcionando igual, solo que sin arranque instantáneo.
    try {
      clearQueryCache();
      localStorage.setItem(key, value);
    } catch {
      /* nos rendimos en silencio */
    }
  }
}

/** Borra toda la caché de queries (no toca el resto de preferencias). */
export function clearQueryCache() {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
    localStorage.removeItem(OWNER_KEY);
  } catch {
    /* nada que hacer */
  }
}

/** Quién dejó los datos que hay ahora mismo en la caché. */
export function getCacheOwner(): string | null {
  return safeGet(OWNER_KEY);
}

/**
 * Fija el dueño de la caché. Si el usuario ha cambiado respecto a lo que
 * había guardado, tira TODO antes de dejar escribir nada nuevo.
 */
export function setCacheOwner(userId: string) {
  const current = getCacheOwner();
  if (current === userId) return;
  clearQueryCache();
  safeSet(OWNER_KEY, userId);
}

/* ---------- último usuario conocido ---------- */

const LAST_USER_KEY = "sxt:lastUser";

export type LastUser = { userId: string; username: string };

/**
 * Quién usó la app la última vez en este dispositivo. Sirve para pintar su
 * barra lateral y sus tareas cacheadas mientras se valida el token, en vez de
 * un splash. Se borra al cerrar sesión igual que la caché.
 */
export function readLastUser(): LastUser | null {
  const raw = safeGet(LAST_USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LastUser;
    if (!parsed?.userId || !parsed?.username) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLastUser(user: LastUser) {
  safeSet(LAST_USER_KEY, JSON.stringify(user));
}

/**
 * Olvida por completo al usuario anterior: datos cacheados y su identidad.
 * Se llama al cerrar sesión y en cuanto sabemos que no hay sesión, de modo
 * que quien inicie sesión después nunca puede ver nada del anterior.
 */
export function forgetUser() {
  clearQueryCache();
  try {
    localStorage.removeItem(LAST_USER_KEY);
  } catch {
    /* nada que hacer */
  }
}

/** JSON con claves ordenadas, para que los mismos args den siempre la misma clave. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return "{" + entries.map(([k, v]) => JSON.stringify(k) + ":" + stableStringify(v)).join(",") + "}";
}

export function cacheKey(functionName: string, args: unknown): string {
  return PREFIX + functionName + ":" + stableStringify(args);
}

export function readCache<T>(key: string): T | undefined {
  const raw = safeGet(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined; // formato viejo o corrupto: como si no hubiera nada
  }
}

export function writeCache(key: string, value: unknown) {
  let raw: string;
  try {
    raw = JSON.stringify(value);
  } catch {
    return; // no serializable
  }
  if (raw.length > MAX_ENTRY_BYTES) return;
  safeSet(key, raw);
}
