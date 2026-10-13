# SurexTodo

Gestor de tareas personales y de equipo para Surexport, al estilo de
Microsoft To Do. Web instalable (PWA) que funciona también sin conexión.

- **Código:** https://github.com/antoni979/SurexTodo
- **Backend:** esquema `todo` dentro del proyecto Supabase de la Intranet
  (`ujfyperwnppmrnvnnrhy`). Hasta el 13/10/2026 vivía en Convex.

---

## Acceso

- Se entra con el **mismo usuario de la Intranet**: nº SAP + contraseña.
  No hay registro propio ni contraseñas aparte.
- Tener cuenta en la Intranet **no** da acceso al todo: hay que estar dado de
  alta en `todo.users` y ser miembro de un entorno (`todo.workspace_members`).
  Las altas y bajas se hacen por SQL.
- Un usuario archivado (`todo.users.archived = true`) no puede entrar, pero
  sus tareas se conservan como histórico con su nombre.

## Funcionalidades

- **Tareas** con prioridad (Baja / Media / Alta / Súper urgente), fecha,
  nota, etiquetas, subtareas, adjuntos y **periodicidad** (cada día,
  laborables, semanal, mensual o días concretos, con intervalo "cada N").
  Al completar una periódica se crea sola la siguiente.
- **Vistas:** Mi día, Planeado (Vencidas / Hoy / Mañana / Próximamente),
  Tareas, Calendario, Listas propias, Equipos (kanban o lista) y Proyectos
  (kanban, hitos, enlaces, compartir).
- **Orden** por fecha (la prioridad solo desempata el mismo día), con
  selector ascendente/descendente.
- **Equipos:** las tareas se comparten entre sus miembros y se asignan a una
  persona. Una tarea de equipo con fecha solo sale en el Planeado de quien la
  tiene asignada.
- **Tiempo real:** un cambio hecho en un dispositivo aparece en los demás en
  un par de segundos.
- **Sin conexión:** la app arranca al instante con el último estado conocido
  y los cambios hechos sin red se guardan en una cola en disco que se envía
  sola al volver la conexión (sobrevive a cerrar la app).

## Arquitectura

```
  Navegador (PWA, Vercel)                Supabase de la Intranet
 ┌───────────────────────┐            ┌──────────────────────────────┐
 │ React + Vite          │   RPC      │ esquema todo   (tablas + API) │
 │ src/data/  ───────────┼──────────> │ esquema todo_private (helpers)│
 │  · caché local        │  Realtime  │ bucket todo-adjuntos (privado)│
 │  · cola offline       │ <───────── │ Auth de la Intranet (nº SAP)  │
 └───────────────────────┘            └──────────────────────────────┘
```

### Backend (`supabase/migrations/`)
- **No toca nada de `public`** de la Intranet. Todo vive en `todo` (expuesto
  por la API) y `todo_private` (helpers, no expuesto).
- **Escrituras solo por funciones** `todo.*` (SECURITY DEFINER) que comprueban
  permisos. Cada una recibe un único `args jsonb` con claves en camelCase y
  devuelve jsonb con la misma forma que usa el frontend.
- **Tablas con RLS de solo lectura**: sirven para el tiempo real y como
  defensa; nadie puede escribir en ellas directamente.
- **Sin claves foráneas hacia `auth.users`**, a propósito: RRHH tiene que
  poder dar de baja empleados en la Intranet sin que el todo lo bloquee.
- Reglas de acceso a una tarea: si es de equipo, ser del equipo; si no, ser
  quien la creó; si no, estar invitado al proyecto.
- Las migraciones se aplicaron a mano por la Management API (no figuran en el
  historial de migraciones de la Intranet, para no mezclarse con él).

### Frontend (`src/data/`)
- `supabase.ts` — cliente. La URL y la clave anónima son públicas por diseño;
  la seguridad la ponen las funciones y la RLS.
- `api.ts` — catálogo de funciones (`api.tasks.listMyDay`, …) con sus tipos.
- `react.ts` — `useQuery` / `useMutation` (misma forma que tenía Convex),
  sesión, tiempo real, cola offline y adjuntos.
- `hooks/useCachedQuery.ts` + `lib/queryCache.ts` — caché local para
  arrancar al instante, aislada por usuario (se borra al cerrar sesión).

## Desarrollo en local

```bash
npm install
npm run dev
```

No hay backend local: el dev server habla con el Supabase real, así que lo
que se haga en local afecta a los datos de verdad.

Para publicar basta con `git push` a `main` (Vercel construye con `vite build`).
Los cambios de base de datos se añaden como nueva migración en
`supabase/migrations/` y se aplican con la Management API.
