// Capa de datos sobre Supabase con la misma forma que convex/react, para que
// los componentes no noten el cambio de backend:
//
//   useQuery(api.x.y, args)      -> undefined mientras carga, luego el dato
//   useMutation(api.x.y)(args)   -> Promise con el resultado
//   <AuthLoading>/<Authenticated>/<Unauthenticated>, useConvexAuth
//   useConvexConnectionState     -> { isWebSocketConnected, inflightMutations }
//
// Reactividad: un único canal de Realtime escucha cualquier cambio en el
// esquema `todo` y vuelve a pedir las consultas montadas. Además, tras cada
// mutación propia se refresca al momento, sin esperar al evento.
//
// Offline: las mutaciones marcadas `queueable` que fallan por red se guardan
// en una cola PERSISTENTE (localStorage, por usuario) y se reenvían al volver
// la conexión. Son idempotentes del lado del servidor (crear con id del
// cliente, marcar hecha con estado deseado…), así que reintentar no duplica.

import { createElement, Fragment, useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { ATTACHMENTS_BUCKET, supabase } from "./supabase";
import type { MutationRef, QueryRef } from "./api";
import { stableStringify } from "../lib/queryCache";

/* =============================================================== auth */

type AuthState = { isLoading: boolean; session: Session | null };
let auth: AuthState = { isLoading: true, session: null };
const authListeners = new Set<() => void>();

function setAuthState(next: AuthState) {
  const prevUser = auth.session?.user.id ?? null;
  auth = next;
  const nextUser = next.session?.user.id ?? null;
  if (prevUser !== nextUser) {
    // Otro usuario (o ninguno): nada de lo cargado para el anterior se
    // puede seguir enseñando.
    resetQueries();
    if (nextUser) {
      startRealtime();
      // fuera del callback de auth (supabase avisa de no llamar a la API dentro)
      setTimeout(() => void drainOutbox(), 0);
    } else {
      stopRealtime();
    }
  }
  authListeners.forEach((l) => l());
}

void supabase.auth.getSession().then(({ data }) => setAuthState({ isLoading: false, session: data.session }));
supabase.auth.onAuthStateChange((_event, session) => setAuthState({ isLoading: false, session }));

function subscribeAuth(cb: () => void) {
  authListeners.add(cb);
  return () => authListeners.delete(cb);
}

export function useConvexAuth() {
  const s = useSyncExternalStore(subscribeAuth, () => auth);
  return { isLoading: s.isLoading, isAuthenticated: !!s.session };
}

export function currentUserId(): string | null {
  return auth.session?.user.id ?? null;
}

export function AuthLoading({ children }: { children: ReactNode }) {
  const { isLoading } = useConvexAuth();
  return isLoading ? createElement(Fragment, null, children) : null;
}
export function Authenticated({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  return !isLoading && isAuthenticated ? createElement(Fragment, null, children) : null;
}
export function Unauthenticated({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  return !isLoading && !isAuthenticated ? createElement(Fragment, null, children) : null;
}

/** Login con las mismas credenciales de la Intranet: número SAP + contraseña. */
async function signInWithSapId(sapId: string, password: string) {
  const { data, error } = await supabase.functions.invoke("login-with-sap-id", {
    body: { sapId: sapId.trim(), password },
  });
  if (error) throw new Error("Usuario o contraseña incorrectos");
  if (data?.error) throw new Error(String(data.error));
  if (!data?.session) throw new Error("Usuario o contraseña incorrectos");
  const { error: e2 } = await supabase.auth.setSession(data.session);
  if (e2) throw new Error(e2.message);
}

export function useAuthActions() {
  return useMemo(
    () => ({
      signIn: signInWithSapId,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [],
  );
}

/* =============================================================== conexión */

let networkDown = false;
let inflight = 0;
const connListeners = new Set<() => void>();
let connSnapshot = { isWebSocketConnected: true, inflightMutations: 0 };

function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
function notifyConn() {
  const next = {
    isWebSocketConnected: isOnline() && !networkDown,
    inflightMutations: inflight + outboxRead().length,
  };
  if (
    next.isWebSocketConnected !== connSnapshot.isWebSocketConnected ||
    next.inflightMutations !== connSnapshot.inflightMutations
  ) {
    connSnapshot = next;
    connListeners.forEach((l) => l());
  }
}
function setNetworkDown(v: boolean) {
  if (networkDown !== v) {
    networkDown = v;
    notifyConn();
    if (!v) void drainOutbox();
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    notifyConn();
    void drainOutbox();
    scheduleRefetch(0);
  });
  window.addEventListener("offline", notifyConn);
  window.addEventListener("focus", () => scheduleRefetch(0));
}

export function useConvexConnectionState() {
  return useSyncExternalStore(
    (cb) => {
      connListeners.add(cb);
      return () => connListeners.delete(cb);
    },
    () => connSnapshot,
  );
}

type RpcError = { message: string; code?: string } | null;

/** Fallo de red (no del servidor): postgrest-js lo devuelve sin código. */
function isNetworkError(error: RpcError) {
  if (!error) return false;
  return !error.code && /fetch|network|load failed|timeout|abort/i.test(error.message ?? "");
}

async function rpc(fn: string, args: unknown): Promise<{ data: unknown; error: RpcError }> {
  try {
    const { data, error } = await supabase.rpc(fn, { args: args ?? {} });
    return { data, error: error as RpcError };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

/* =============================================================== consultas */

type Entry = {
  key: string;
  fn: string;
  args: unknown;
  data: unknown;
  loaded: boolean;
  inflight: boolean;
  dirty: boolean;
  refs: number;
  listeners: Set<() => void>;
};
const entries = new Map<string, Entry>();
let generation = 0;

function notifyEntry(e: Entry) {
  e.listeners.forEach((l) => l());
}

async function runEntry(e: Entry) {
  if (!auth.session) return;
  if (e.inflight) {
    e.dirty = true;
    return;
  }
  e.inflight = true;
  const gen = generation;
  const { data, error } = await rpc(e.fn, e.args);
  e.inflight = false;
  if (gen !== generation) return; // llegó tarde: ya es de otro usuario
  if (error) {
    if (isNetworkError(error)) setNetworkDown(true);
    else console.error(`[datos] ${e.fn}:`, error.message);
  } else {
    setNetworkDown(false);
    e.data = data;
    e.loaded = true;
    notifyEntry(e);
  }
  if (e.dirty) {
    e.dirty = false;
    void runEntry(e);
  }
}

function resetQueries() {
  generation++;
  for (const e of entries.values()) {
    e.data = undefined;
    e.loaded = false;
    e.inflight = false;
    e.dirty = false;
    notifyEntry(e);
    if (e.refs > 0) void runEntry(e);
  }
}

let refetchTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefetch(delay = 150) {
  if (refetchTimer) clearTimeout(refetchTimer);
  refetchTimer = setTimeout(() => {
    refetchTimer = null;
    for (const e of entries.values()) if (e.refs > 0) void runEntry(e);
  }, delay);
}

export function useQuery<A, R>(ref: QueryRef<A, R>, args?: A | "skip"): R | undefined {
  const skip = args === "skip";
  const a = skip ? null : (args ?? {});
  const key = skip ? null : ref.fn + "|" + stableStringify(a);

  const entry = useMemo(() => {
    if (!key) return null;
    let e = entries.get(key);
    if (!e) {
      e = { key, fn: ref.fn, args: a, data: undefined, loaded: false, inflight: false, dirty: false, refs: 0, listeners: new Set() };
      entries.set(key, e);
    }
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const subscribe = useCallback(
    (cb: () => void) => {
      if (!entry) return () => {};
      entry.listeners.add(cb);
      entry.refs++;
      // Siempre se pide al montar: si había un dato viejo se enseña mientras.
      void runEntry(entry);
      return () => {
        entry.listeners.delete(cb);
        entry.refs--;
      };
    },
    [entry],
  );

  return useSyncExternalStore(subscribe, () => (entry && entry.loaded ? (entry.data as R) : undefined));
}

/* =============================================================== tiempo real */

let channel: ReturnType<typeof supabase.channel> | null = null;
function startRealtime() {
  if (channel) return;
  channel = supabase
    .channel("todo-cambios")
    .on("postgres_changes", { event: "*", schema: "todo" }, () => scheduleRefetch())
    .subscribe((status) => {
      if (status === "SUBSCRIBED") scheduleRefetch(0);
    });
}
function stopRealtime() {
  if (channel) void supabase.removeChannel(channel);
  channel = null;
}

/* =============================================================== mutaciones */

class OfflineError extends Error {}

/** Si el resultado trae rutas de adjuntos borrados, se quitan del storage. */
async function cleanupStorage(result: unknown) {
  const paths = (result as { storagePaths?: string[] } | null)?.storagePaths;
  if (paths && paths.length) {
    const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove(paths);
    if (error) console.warn("[adjuntos] no se pudieron borrar del storage:", error.message);
  }
}

export async function runMutation<A, R>(ref: MutationRef<A, R>, rawArgs: A): Promise<R> {
  let args: unknown = rawArgs ?? {};
  if (ref.clientId && !(args as { id?: string }).id) {
    args = { ...(args as object), id: crypto.randomUUID() };
  }
  inflight++;
  notifyConn();
  try {
    if (!isOnline()) throw new OfflineError();
    const { data, error } = await rpc(ref.fn, args);
    if (error) {
      if (isNetworkError(error)) {
        setNetworkDown(true);
        throw new OfflineError();
      }
      throw new Error(error.message);
    }
    setNetworkDown(false);
    await cleanupStorage(data);
    scheduleRefetch(0);
    return data as R;
  } catch (err) {
    if (err instanceof OfflineError) {
      if (ref.queueable) {
        outboxPush(ref.fn, args);
        // Para crear, devolvemos el id que tendrá cuando se sincronice.
        return ((args as { id?: string }).id ?? null) as R;
      }
      throw new Error("Sin conexión. Vuelve a intentarlo cuando tengas red.");
    }
    throw err;
  } finally {
    inflight--;
    notifyConn();
  }
}

export function useMutation<A, R>(ref: MutationRef<A, R>) {
  return useCallback((args: A) => runMutation(ref, args), [ref]);
}

/* =============================================================== cola offline */

type OutboxItem = { fn: string; args: unknown; at: number };
const outboxKey = () => `sxt:outbox:${auth.session?.user.id ?? "anon"}`;

function outboxRead(): OutboxItem[] {
  if (!auth.session) return [];
  try {
    return JSON.parse(localStorage.getItem(outboxKey()) ?? "[]") as OutboxItem[];
  } catch {
    return [];
  }
}
function outboxWrite(items: OutboxItem[]) {
  try {
    if (items.length) localStorage.setItem(outboxKey(), JSON.stringify(items));
    else localStorage.removeItem(outboxKey());
  } catch {
    /* sin almacenamiento: se pierde la cola, pero no rompemos la app */
  }
  notifyConn();
}
function outboxPush(fn: string, args: unknown) {
  outboxWrite([...outboxRead(), { fn, args, at: Date.now() }]);
}

let draining = false;
async function drainOutbox() {
  if (draining || !auth.session || !isOnline()) return;
  draining = true;
  try {
    let items = outboxRead();
    while (items.length) {
      const item = items[0];
      const { data, error } = await rpc(item.fn, item.args);
      if (error && isNetworkError(error)) {
        setNetworkDown(true);
        break; // seguimos sin red: se reintenta luego
      }
      if (error) {
        // Error del servidor (p. ej. ya no tienes acceso): reintentar no lo
        // arreglará. Se descarta para no bloquear el resto de la cola.
        console.error(`[cola offline] ${item.fn} descartada:`, error.message);
      } else {
        setNetworkDown(false);
        await cleanupStorage(data);
      }
      items = items.slice(1);
      outboxWrite(items);
    }
  } finally {
    draining = false;
    scheduleRefetch(0);
  }
}
setInterval(() => {
  if (outboxRead().length) void drainOutbox();
}, 30_000);

/* =============================================================== adjuntos */

/** Sube el fichero a `todo-adjuntos/<taskId>/...` y lo registra en la tarea. */
export async function uploadAttachment(taskId: string, file: File) {
  const safe = file.name.replace(/[^\w.\-() ]+/g, "_");
  const path = `${taskId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw new Error("No se pudo subir el archivo: " + error.message);
  const { api } = await import("./api");
  try {
    return await runMutation(api.attachments.addAttachment, {
      taskId,
      storagePath: path,
      name: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
    });
  } catch (e) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path]);
    throw e;
  }
}

/** URL temporal (1 h) para ver o descargar un adjunto privado. */
export async function attachmentUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(storagePath, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
