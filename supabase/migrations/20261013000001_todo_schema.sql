-- SurexTodo dentro del proyecto Supabase de la Intranet.
--
-- Todo vive en el esquema `todo` (lo único expuesto por la API) y en
-- `todo_private` (helpers, NO expuesto). No se toca nada de `public`.
--
-- A propósito NO hay claves foráneas hacia auth.users: RRHH tiene que poder
-- borrar o modificar empleados en la Intranet sin que el todo lo bloquee.
--
-- Las tablas solo tienen políticas de LECTURA (para el tiempo real y como
-- defensa). Toda escritura pasa por funciones `todo.*` SECURITY DEFINER que
-- replican las comprobaciones que hacía Convex.

create schema if not exists todo;
create schema if not exists todo_private;

-- ---------------------------------------------------------------- tablas

create table todo.users (
  id uuid primary key,                 -- = auth.users.id de la Intranet
  username text not null unique,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table todo.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references todo.users(id),
  created_at timestamptz not null default now()
);

create table todo.workspace_members (
  workspace_id uuid not null references todo.workspaces(id) on delete cascade,
  user_id uuid not null references todo.users(id) on delete cascade,
  primary key (workspace_id, user_id)
);

create table todo.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references todo.users(id),
  workspace_id uuid references todo.workspaces(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table todo.team_members (
  team_id uuid not null references todo.teams(id) on delete cascade,
  user_id uuid not null references todo.users(id) on delete cascade,
  primary key (team_id, user_id)
);

create table todo.user_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references todo.users(id) on delete cascade,
  name text not null,
  workspace_id uuid references todo.workspaces(id) on delete cascade,
  unique (user_id, name)
);

create table todo.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text,
  owner_id uuid not null references todo.users(id),
  workspace_id uuid references todo.workspaces(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table todo.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  priority text not null check (priority in ('baja','media','alta','urgente')),
  completed boolean not null default false,
  due_date date,
  note text,
  creator_id uuid not null references todo.users(id),
  team_id uuid references todo.teams(id) on delete cascade,
  assignee_id uuid references todo.users(id),
  recurrence jsonb,
  workspace_id uuid references todo.workspaces(id) on delete cascade,
  list_id uuid references todo.lists(id) on delete set null,
  parent_task_id uuid references todo.tasks(id) on delete cascade,
  is_project boolean not null default false,
  description text,
  start_date date,
  end_date date,
  review_date date,
  project_status text check (project_status in ('not_started','in_progress','paused','completed','cancelled')),
  lead_id uuid references todo.users(id),
  tags text[],
  kanban_status text check (kanban_status in ('todo','in_progress','done')),
  kanban_order double precision,
  created_at timestamptz not null default now()
);
create index on todo.tasks (creator_id);
create index on todo.tasks (team_id);
create index on todo.tasks (assignee_id);
create index on todo.tasks (parent_task_id);
create index on todo.tasks (list_id);
create index on todo.tasks (workspace_id);

create table todo.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references todo.tasks(id) on delete cascade,
  name text not null,
  date date,
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table todo.project_members (
  project_id uuid not null references todo.tasks(id) on delete cascade,
  user_id uuid not null references todo.users(id) on delete cascade,
  primary key (project_id, user_id)
);

create table todo.project_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references todo.tasks(id) on delete cascade,
  label text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create table todo.attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references todo.tasks(id) on delete cascade,
  storage_path text not null,
  name text not null,
  size bigint not null,
  mime_type text not null,
  uploader_id uuid not null references todo.users(id),
  created_at timestamptz not null default now()
);

create table todo.my_day (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references todo.users(id) on delete cascade,
  task_id uuid not null references todo.tasks(id) on delete cascade,
  date date not null,
  unique (user_id, task_id, date)
);
create index on todo.my_day (task_id);

-- ---------------------------------------------------------------- helpers

-- Usuario actual. Falla si no hay sesión o si no es usuario activo del todo:
-- tener cuenta en la Intranet NO da acceso al todo.
create function todo_private.uid() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'No has iniciado sesión'; end if;
  if not exists (select 1 from todo.users u where u.id = v and not u.archived) then
    raise exception 'No tienes acceso a SurexTodo';
  end if;
  return v;
end $$;

create function todo_private.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from todo.users u where u.id = auth.uid() and not u.archived)
$$;

create function todo_private.is_ws_member(p_ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from todo.workspace_members m
                 where m.workspace_id = p_ws and m.user_id = auth.uid())
$$;

create function todo_private.is_team_member(p_team uuid, p_user uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from todo.team_members m
                 where m.team_id = p_team and m.user_id = coalesce(p_user, auth.uid()))
$$;

-- Mismo criterio que assertAccess de Convex: tarea de equipo -> ser del
-- equipo; si no -> ser el creador; si no -> estar invitado al proyecto (la
-- propia tarea si es proyecto, o su padre).
create function todo_private.can_access(p_team uuid, p_creator uuid, p_is_project boolean,
                                        p_id uuid, p_parent uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then false
    when p_team is not null then todo_private.is_team_member(p_team)
    when p_creator = auth.uid() then true
    else exists (select 1 from todo.project_members pm
                 where pm.user_id = auth.uid()
                   and pm.project_id = case when p_is_project then p_id else p_parent end)
  end
$$;

create function todo_private.can_access_task(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select todo_private.can_access(t.team_id, t.creator_id, t.is_project, t.id, t.parent_task_id)
                   from todo.tasks t where t.id = p_id), false)
$$;

create function todo_private.assert_access(p_id uuid) returns todo.tasks
language plpgsql stable security definer set search_path = '' as $$
declare t todo.tasks;
begin
  select * into t from todo.tasks where id = p_id;
  if not found then raise exception 'Tarea no encontrada'; end if;
  if not todo_private.can_access(t.team_id, t.creator_id, t.is_project, t.id, t.parent_task_id) then
    raise exception 'No tienes acceso a esta tarea';
  end if;
  return t;
end $$;

-- Ruta de un fichero de storage = '<taskId>/<lo que sea>'.
create function todo_private.can_access_storage_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return todo_private.can_access_task(split_part(p_name, '/', 1)::uuid);
exception when others then
  return false;
end $$;

create function todo_private.name_of(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when p_user is null then null
         else coalesce((select username from todo.users where id = p_user), '(sin nombre)') end
$$;

create function todo_private.ms(p timestamptz) returns double precision
language sql immutable as $$ select extract(epoch from p)::double precision * 1000 $$;

-- Documento de tarea con la misma forma que devolvía Convex (camelCase,
-- _id/_creationTime, y los campos vacíos AUSENTES, no a null).
create function todo_private.task_doc(t todo.tasks) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    '_id', t.id, '_creationTime', todo_private.ms(t.created_at),
    'title', t.title, 'priority', t.priority, 'completed', t.completed,
    'dueDate', t.due_date, 'note', t.note, 'creatorId', t.creator_id,
    'teamId', t.team_id, 'assigneeId', t.assignee_id, 'recurrence', t.recurrence,
    'workspaceId', t.workspace_id, 'listId', t.list_id, 'parentTaskId', t.parent_task_id,
    'isProject', case when t.is_project then true end,
    'description', t.description, 'startDate', t.start_date, 'endDate', t.end_date,
    'reviewDate', t.review_date, 'projectStatus', t.project_status, 'leadId', t.lead_id,
    'tags', t.tags, 'kanbanStatus', t.kanban_status, 'kanbanOrder', t.kanban_order))
$$;

-- Tarea enriquecida (equivale a enrich() de Convex). p_today = fecha para
-- calcular inMyDay; si es null, cuenta Mi día de cualquier fecha.
create function todo_private.enrich(t todo.tasks, p_today date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select todo_private.task_doc(t)
    || jsonb_build_object(
      'creatorName', todo_private.name_of(t.creator_id),
      'assigneeName', todo_private.name_of(t.assignee_id),
      'teamName', (select tm.name from todo.teams tm where tm.id = t.team_id),
      'projectName', (select p.title from todo.tasks p where p.id = t.parent_task_id and p.is_project),
      'inMyDay', exists (select 1 from todo.my_day m where m.task_id = t.id and m.user_id = auth.uid()
                         and (p_today is null or m.date = p_today)),
      'subtaskTotal', (select count(*) from todo.tasks c where c.parent_task_id = t.id),
      'subtaskDone', (select count(*) from todo.tasks c where c.parent_task_id = t.id and c.completed))
$$;

create function todo_private.is_top_level(t todo.tasks) returns boolean
language sql immutable as $$ select not t.is_project and t.parent_task_id is null $$;

-- Hijo de una tarea normal (subtarea) -> se excluye de las vistas.
create function todo_private.is_subtask_of_normal(t todo.tasks) returns boolean
language sql stable security definer set search_path = '' as $$
  select t.parent_task_id is not null
     and exists (select 1 from todo.tasks p where p.id = t.parent_task_id and not p.is_project)
$$;

create function todo_private.team_ws(p_team uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select workspace_id from todo.teams where id = p_team
$$;

create function todo_private.ensure_tag(p_user uuid, p_name text, p_ws uuid) returns void
language sql security definer set search_path = '' as $$
  insert into todo.user_tags (user_id, name, workspace_id) values (p_user, p_name, p_ws)
  on conflict (user_id, name) do nothing
$$;

-- Siguiente fecha de una tarea recurrente (mismo algoritmo que Convex).
create function todo_private.next_occurrence(p_base date, p_rec jsonb) returns date
language plpgsql immutable as $$
declare
  n int := greatest(1, coalesce((p_rec->>'interval')::int, 1));
  nxt date;
  days int[];
  i int;
begin
  case p_rec->>'type'
    when 'daily' then return p_base + n;
    when 'weekly' then return p_base + 7 * n;
    -- sumar meses en Postgres ya recorta al último día del mes (31/01 + 1 mes
    -- = 28-29/02), igual que el setUTCDate(0) que hacía Convex
    when 'monthly' then return (p_base + make_interval(months => n))::date;
    when 'weekdays' then
      nxt := p_base + 1;
      while extract(dow from nxt) in (0, 6) loop nxt := nxt + 1; end loop;
      return nxt;
    else -- custom
      select array_agg(x::int order by x::int) into days
        from jsonb_array_elements_text(coalesce(p_rec->'days', '[]'::jsonb)) x;
      if days is null or array_length(days, 1) is null then
        days := array[extract(dow from p_base)::int];
      end if;
      nxt := p_base + 1;
      for i in 1..14 loop
        if extract(dow from nxt)::int = any(days) then
          if n <= 1 then return nxt; end if;
          return nxt + 7 * (n - 1);
        end if;
        nxt := nxt + 1;
      end loop;
      return p_base + 7 * n;
  end case;
end $$;

-- Rutas de adjuntos de un subárbol de tareas, para que el cliente las borre
-- del storage (desde SQL no se pueden borrar objetos de storage).
create function todo_private.subtree_storage_paths(p_id uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  with recursive sub as (
    select id from todo.tasks where id = p_id
    union all
    select t.id from todo.tasks t join sub on t.parent_task_id = sub.id
  )
  select coalesce(array_agg(a.storage_path), '{}') from todo.attachments a where a.task_id in (select id from sub)
$$;

create function todo_private.ws_ok(p_ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_ws is null or todo_private.is_ws_member(p_ws)
$$;

-- ---------------------------------------------------------------- RLS (solo lectura)

alter table todo.users enable row level security;
alter table todo.workspaces enable row level security;
alter table todo.workspace_members enable row level security;
alter table todo.teams enable row level security;
alter table todo.team_members enable row level security;
alter table todo.user_tags enable row level security;
alter table todo.lists enable row level security;
alter table todo.tasks enable row level security;
alter table todo.milestones enable row level security;
alter table todo.project_members enable row level security;
alter table todo.project_links enable row level security;
alter table todo.attachments enable row level security;
alter table todo.my_day enable row level security;

create policy sel on todo.users for select to authenticated using (todo_private.is_active_user());
create policy sel on todo.workspaces for select to authenticated using (todo_private.is_ws_member(id));
create policy sel on todo.workspace_members for select to authenticated using (todo_private.is_ws_member(workspace_id));
create policy sel on todo.teams for select to authenticated using (todo_private.is_team_member(id));
create policy sel on todo.team_members for select to authenticated using (todo_private.is_team_member(team_id));
create policy sel on todo.user_tags for select to authenticated using (user_id = auth.uid());
create policy sel on todo.lists for select to authenticated using (owner_id = auth.uid());
create policy sel on todo.tasks for select to authenticated
  using (todo_private.can_access(team_id, creator_id, is_project, id, parent_task_id));
create policy sel on todo.milestones for select to authenticated using (todo_private.can_access_task(project_id));
create policy sel on todo.project_members for select to authenticated using (todo_private.can_access_task(project_id));
create policy sel on todo.project_links for select to authenticated using (todo_private.can_access_task(project_id));
create policy sel on todo.attachments for select to authenticated using (todo_private.can_access_task(task_id));
create policy sel on todo.my_day for select to authenticated using (user_id = auth.uid());
