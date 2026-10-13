-- API de SurexTodo: una función por cada query/mutation que había en Convex,
-- con las mismas comprobaciones y los mismos mensajes de error.
--
-- Convención: todas reciben un único `args jsonb` con las claves en camelCase
-- (igual que los args de Convex) y devuelven jsonb. Así se distingue "no
-- tocar" (clave ausente) de "borrar" (clave a null), como hacía Convex.
--
-- Las consultas devuelven '[]' / null si no hay acceso (igual que antes); las
-- mutaciones lanzan error.

-- ================================================================ consultas

create function todo.me(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := auth.uid(); u todo.users;
begin
  if v is null then return null; end if;
  select * into u from todo.users where id = v;
  if not found or u.archived then
    return jsonb_build_object('userId', v, 'username', null, 'noAccess', true);
  end if;
  return jsonb_build_object('userId', v, 'username', u.username);
end $$;

create function todo.list_my_workspaces(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not todo_private.is_active_user() then return '[]'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('_id', w.id, '_creationTime', todo_private.ms(w.created_at),
                                        'name', w.name, 'ownerId', w.owner_id) order by w.name)
    from todo.workspaces w
    join todo.workspace_members m on m.workspace_id = w.id and m.user_id = auth.uid()), '[]');
end $$;

create function todo.list_my_teams(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid := (args->>'workspaceId')::uuid;
begin
  if not todo_private.is_active_user() or not todo_private.ws_ok(ws) then return '[]'; end if;
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             '_id', t.id, '_creationTime', todo_private.ms(t.created_at), 'name', t.name,
             'ownerId', t.owner_id, 'workspaceId', t.workspace_id)) order by t.name)
    from todo.teams t
    join todo.team_members m on m.team_id = t.id and m.user_id = auth.uid()
    where t.workspace_id is not distinct from ws), '[]');
end $$;

create function todo.get_team(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare tid uuid := (args->>'teamId')::uuid; t todo.teams;
begin
  if not todo_private.is_active_user() or not todo_private.is_team_member(tid) then return null; end if;
  select * into t from todo.teams where id = tid;
  if not found then return null; end if;
  return jsonb_build_object(
    '_id', t.id, 'name', t.name, 'ownerId', t.owner_id, 'workspaceId', t.workspace_id,
    'isOwner', t.owner_id = auth.uid(),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('userId', m.user_id,
                                          'username', todo_private.name_of(m.user_id))
                       order by todo_private.name_of(m.user_id))
      from todo.team_members m where m.team_id = t.id), '[]'));
end $$;

-- Solo el dueño del equipo, y solo gente de su mismo entorno.
create function todo.list_addable_team_users(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare tid uuid := (args->>'teamId')::uuid; t todo.teams;
begin
  if not todo_private.is_active_user() then return '[]'; end if;
  select * into t from todo.teams where id = tid;
  if not found or t.owner_id <> auth.uid() then return '[]'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('userId', u.id, 'username', u.username) order by u.username)
    from todo.users u
    where not u.archived
      and not exists (select 1 from todo.team_members m where m.team_id = t.id and m.user_id = u.id)
      and (t.workspace_id is null or exists (select 1 from todo.workspace_members wm
                                             where wm.workspace_id = t.workspace_id and wm.user_id = u.id))), '[]');
end $$;

create function todo.list_my_lists(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid := (args->>'workspaceId')::uuid;
begin
  if not todo_private.is_active_user() or not todo_private.ws_ok(ws) then return '[]'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('_id', l.id, 'name', l.name,
                                        'color', coalesce(l.color, '#3b82f6'),
                                        'workspaceId', l.workspace_id) order by l.created_at)
    from todo.lists l where l.owner_id = auth.uid() and l.workspace_id is not distinct from ws), '[]');
end $$;

create function todo.list_all_tags(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid := (args->>'workspaceId')::uuid;
begin
  if not todo_private.is_active_user() or not todo_private.ws_ok(ws) then return '[]'; end if;
  return coalesce((
    select jsonb_agg(name order by name) from (
      select ut.name from todo.user_tags ut
       where ut.user_id = auth.uid() and ut.workspace_id is not distinct from ws
      union
      select unnest(t.tags) from todo.tasks t
       where t.creator_id = auth.uid() and t.workspace_id is not distinct from ws) s), '[]');
end $$;

create function todo.get_task(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t todo.tasks;
begin
  if not todo_private.is_active_user() then return null; end if;
  select * into t from todo.tasks where id = (args->>'taskId')::uuid;
  if not found or not todo_private.can_access(t.team_id, t.creator_id, t.is_project, t.id, t.parent_task_id) then
    return null;
  end if;
  return todo_private.enrich(t, null);  -- como Convex: Mi día de cualquier fecha
end $$;

create function todo.list_personal(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid := (args->>'workspaceId')::uuid; d date := (args->>'today')::date;
begin
  if not todo_private.is_active_user() or not todo_private.ws_ok(ws) then return '[]'; end if;
  return coalesce((
    select jsonb_agg(todo_private.enrich(t, d) order by t.created_at)
    from todo.tasks t
    where t.creator_id = auth.uid() and t.team_id is null and t.list_id is null
      and t.workspace_id is not distinct from ws and todo_private.is_top_level(t)), '[]');
end $$;

create function todo.list_by_list(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare lid uuid := (args->>'listId')::uuid; d date := (args->>'today')::date;
begin
  if not todo_private.is_active_user() then return '[]'; end if;
  if not exists (select 1 from todo.lists where id = lid and owner_id = auth.uid()) then return '[]'; end if;
  return coalesce((
    select jsonb_agg(todo_private.enrich(t, d) order by t.created_at)
    from todo.tasks t where t.list_id = lid and todo_private.is_top_level(t)), '[]');
end $$;

create function todo.list_team_tasks(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare tid uuid := (args->>'teamId')::uuid; d date := (args->>'today')::date;
begin
  if not todo_private.is_active_user() or not todo_private.is_team_member(tid) then return '[]'; end if;
  return coalesce((
    select jsonb_agg(todo_private.enrich(t, d) order by t.created_at)
    from todo.tasks t where t.team_id = tid and todo_private.is_top_level(t)), '[]');
end $$;

create function todo.list_my_day(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v uuid := auth.uid();
  ws uuid := (args->>'workspaceId')::uuid;
  d date := (args->>'today')::date;
  ids uuid[];
  res jsonb := '[]';
  t todo.tasks;
begin
  if not todo_private.is_active_user() or not todo_private.ws_ok(ws) then return '[]'; end if;
  -- Igual que Convex: el conjunto de Mi día se calcula con TODAS las filas
  -- de hoy, también las que luego se filtran.
  ids := array(select m.task_id from todo.my_day m where m.user_id = v and m.date = d);

  -- 1) Lo que añadí a Mi día hoy
  for t in select tk.* from todo.my_day m join todo.tasks tk on tk.id = m.task_id
           where m.user_id = v and m.date = d order by tk.created_at loop
    continue when t.is_project or todo_private.is_subtask_of_normal(t);
    if t.team_id is not null then
      continue when todo_private.team_ws(t.team_id) is distinct from ws;
    else
      continue when t.workspace_id is distinct from ws;
    end if;
    res := res || jsonb_build_array(todo_private.enrich(t, d));
  end loop;

  -- 2) Mis tareas personales que vencen hoy o están vencidas
  for t in select * from todo.tasks
           where creator_id = v and not (id = any(ids)) and due_date is not null and due_date <= d
             and not completed and not is_project and team_id is null
             and workspace_id is not distinct from ws order by created_at loop
    continue when todo_private.is_subtask_of_normal(t);
    res := res || jsonb_build_array(todo_private.enrich(t, d));
  end loop;

  -- 3) Tareas de equipo asignadas a mí que vencen hoy o están vencidas
  for t in select * from todo.tasks
           where assignee_id = v and not (id = any(ids)) and due_date is not null and due_date <= d
             and not completed and team_id is not null order by created_at loop
    continue when todo_private.team_ws(t.team_id) is distinct from ws;
    res := res || jsonb_build_array(todo_private.enrich(t, d));
  end loop;

  -- 4) Proyectos míos con revisión hoy o atrasada
  for t in select * from todo.tasks
           where creator_id = v and is_project and review_date is not null and review_date <= d
             and workspace_id is not distinct from ws order by created_at loop
    res := res || jsonb_build_array(todo_private.enrich(t, d) || jsonb_build_object('dueDate', t.review_date));
  end loop;

  return res;
end $$;

create function todo.list_planned(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := auth.uid(); ws uuid := (args->>'workspaceId')::uuid; d date := (args->>'today')::date;
begin
  if not todo_private.is_active_user() or not todo_private.ws_ok(ws) then return '[]'; end if;
  return coalesce((select jsonb_agg(x) from (
      select todo_private.enrich(t, d) as x from todo.tasks t
       where t.creator_id = v and t.team_id is null and t.due_date is not null
         and t.workspace_id is not distinct from ws and todo_private.is_top_level(t)
      union all
      select todo_private.enrich(t, d) from todo.tasks t
       where t.assignee_id = v and t.team_id is not null and t.due_date is not null
         and todo_private.team_ws(t.team_id) is not distinct from ws and todo_private.is_top_level(t)
      union all
      select todo_private.enrich(t, d) || jsonb_build_object('dueDate', t.review_date) from todo.tasks t
       where t.creator_id = v and t.is_project and t.review_date is not null
         and t.workspace_id is not distinct from ws
    ) s), '[]');
end $$;

create function todo.list_subtasks(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare pid uuid := (args->>'parentId')::uuid;
begin
  if not todo_private.is_active_user() then return '[]'; end if;
  if not exists (select 1 from todo.tasks where id = pid) then return '[]'; end if;
  perform todo_private.assert_access(pid);
  return coalesce((
    select jsonb_agg(jsonb_build_object('_id', s.id, '_creationTime', todo_private.ms(s.created_at),
                                        'title', s.title, 'completed', s.completed, 'dueDate', s.due_date)
                     order by s.created_at)
    from todo.tasks s where s.parent_task_id = pid), '[]');
end $$;

create function todo.list_my_projects(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := auth.uid(); ws uuid := (args->>'workspaceId')::uuid;
begin
  if not todo_private.is_active_user() or not todo_private.ws_ok(ws) then return '[]'; end if;
  return coalesce((
    with ps as (
      select p.* from todo.tasks p
       where p.is_project and p.team_id is null and p.creator_id = v and p.workspace_id is not distinct from ws
      union
      select p.* from todo.tasks p
        join todo.team_members m on m.team_id = p.team_id and m.user_id = v
        join todo.teams tm on tm.id = p.team_id
       where p.is_project and tm.workspace_id is not distinct from ws
      union
      select p.* from todo.tasks p
        join todo.project_members pm on pm.project_id = p.id and pm.user_id = v
       where p.is_project and p.workspace_id is not distinct from ws
    )
    select jsonb_agg(jsonb_build_object(
      '_id', p.id, '_creationTime', todo_private.ms(p.created_at), 'title', p.title,
      'teamId', p.team_id, 'teamName', (select name from todo.teams where id = p.team_id),
      'projectStatus', coalesce(p.project_status, 'not_started'),
      'startDate', p.start_date, 'endDate', p.end_date, 'leadName', todo_private.name_of(p.lead_id),
      'taskCount', (select count(*) from todo.tasks c where c.parent_task_id = p.id),
      'progress', coalesce((select round(100.0 * count(*) filter (where c.completed) / nullif(count(*), 0))
                            from todo.tasks c where c.parent_task_id = p.id), 0),
      'tags', coalesce(to_jsonb(p.tags), '[]')) order by p.created_at)
    from ps p), '[]');
end $$;

create function todo.get_project(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p todo.tasks;
begin
  if not todo_private.is_active_user() then return null; end if;
  select * into p from todo.tasks where id = (args->>'projectId')::uuid;
  if not found or not p.is_project
     or not todo_private.can_access(p.team_id, p.creator_id, p.is_project, p.id, p.parent_task_id) then
    return null;
  end if;
  return jsonb_build_object(
    '_id', p.id, 'title', p.title, 'description', coalesce(p.description, ''),
    'startDate', p.start_date, 'endDate', p.end_date, 'reviewDate', p.review_date,
    'projectStatus', coalesce(p.project_status, 'not_started'),
    'leadId', p.lead_id, 'leadName', todo_private.name_of(p.lead_id),
    'tags', coalesce(to_jsonb(p.tags), '[]'),
    'teamId', p.team_id, 'teamName', (select name from todo.teams where id = p.team_id),
    'creatorId', p.creator_id, 'creatorName', todo_private.name_of(p.creator_id),
    'isOwner', p.creator_id = auth.uid(),
    'members', case when p.team_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('userId', m.user_id, 'username', todo_private.name_of(m.user_id))
                       order by todo_private.name_of(m.user_id))
      from todo.team_members m where m.team_id = p.team_id), '[]') end,
    'sharedMembers', coalesce((
      select jsonb_agg(jsonb_build_object('userId', m.user_id, 'username', todo_private.name_of(m.user_id))
                       order by todo_private.name_of(m.user_id))
      from todo.project_members m where m.project_id = p.id), '[]'),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        '_id', c.id, '_creationTime', todo_private.ms(c.created_at), 'title', c.title,
        'priority', c.priority, 'completed', c.completed, 'dueDate', c.due_date, 'note', c.note,
        'assigneeId', c.assignee_id, 'assigneeName', todo_private.name_of(c.assignee_id),
        'kanbanStatus', coalesce(c.kanban_status, case when c.completed then 'done' else 'todo' end),
        'kanbanOrder', coalesce(c.kanban_order, 0),
        'subtasks', coalesce((
          select jsonb_agg(jsonb_build_object('_id', s.id, 'title', s.title, 'completed', s.completed,
                                              'dueDate', s.due_date) order by s.created_at)
          from todo.tasks s where s.parent_task_id = c.id), '[]')) order by c.created_at)
      from todo.tasks c where c.parent_task_id = p.id), '[]'),
    'milestones', coalesce((
      select jsonb_agg(jsonb_build_object('_id', m.id, 'name', m.name, 'date', m.date,
                                          'completed', m.completed, 'order', m.sort_order) order by m.sort_order)
      from todo.milestones m where m.project_id = p.id), '[]'),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('_id', l.id, 'label', l.label, 'url', l.url) order by l.created_at)
      from todo.project_links l where l.project_id = p.id), '[]'),
    'progress', coalesce((select round(100.0 * count(*) filter (where c.completed) / nullif(count(*), 0))
                          from todo.tasks c where c.parent_task_id = p.id), 0));
end $$;

create function todo.list_attachments(args jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare tid uuid := (args->>'taskId')::uuid;
begin
  if not todo_private.is_active_user() or not todo_private.can_access_task(tid) then return '[]'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('_id', a.id, 'name', a.name, 'size', a.size, 'mimeType', a.mime_type,
                                        'uploaderId', a.uploader_id, 'storagePath', a.storage_path,
                                        'createdAt', todo_private.ms(a.created_at)) order by a.created_at desc)
    from todo.attachments a where a.task_id = tid), '[]');
end $$;

-- ================================================================ tareas

create function todo.create_task(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v uuid := todo_private.uid();
  new_id uuid := coalesce((args->>'id')::uuid, gen_random_uuid());
  ws uuid := (args->>'workspaceId')::uuid;
  team uuid := (args->>'teamId')::uuid;
  assignee uuid := (args->>'assigneeId')::uuid;
  parent_id uuid := (args->>'parentTaskId')::uuid;
  par todo.tasks;
  ttl text := btrim(coalesce(args->>'title', ''));
  clean_tags text[];
  tg text;
begin
  -- Reintento de la cola offline: si ya se creó, no se duplica.
  if exists (select 1 from todo.tasks where id = new_id) then
    if (select creator_id from todo.tasks where id = new_id) = v then return to_jsonb(new_id); end if;
    raise exception 'Identificador de tarea en uso';
  end if;
  if ws is not null and not todo_private.is_ws_member(ws) then raise exception 'No perteneces a ese entorno'; end if;
  if ttl = '' then raise exception 'La tarea necesita un título'; end if;

  if parent_id is not null then
    par := todo_private.assert_access(parent_id);
    team := par.team_id;
    ws := coalesce(par.workspace_id, ws);
  end if;
  -- El entorno se hereda siempre del equipo (antes las tareas de equipo se
  -- guardaban sin entorno).
  if team is not null then
    ws := coalesce(todo_private.team_ws(team), ws);
    if not todo_private.is_team_member(team) then raise exception 'No perteneces a este equipo'; end if;
    if assignee is not null and not todo_private.is_team_member(team, assignee) then
      raise exception 'La persona asignada no está en el equipo';
    end if;
  else
    assignee := null;
  end if;

  select array_agg(btrim(x)) into clean_tags
    from jsonb_array_elements_text(coalesce(args->'tags', '[]'::jsonb)) x where btrim(x) <> '';

  insert into todo.tasks (id, title, priority, completed, due_date, creator_id, team_id, assignee_id,
                          recurrence, parent_task_id, kanban_status, workspace_id, tags, list_id)
  values (new_id, ttl, coalesce(args->>'priority', 'media'), false, (args->>'dueDate')::date, v, team,
          assignee, args->'recurrence', parent_id, case when parent_id is not null then 'todo' end,
          ws, clean_tags, (args->>'listId')::uuid);

  foreach tg in array coalesce(clean_tags, '{}') loop perform todo_private.ensure_tag(v, tg, ws); end loop;

  if coalesce((args->>'addToMyDay')::boolean, false) and args->>'today' is not null then
    insert into todo.my_day (user_id, task_id, date) values (v, new_id, (args->>'today')::date)
    on conflict do nothing;
  end if;
  return to_jsonb(new_id);
end $$;

create function todo.create_subtask(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); par todo.tasks; ttl text := btrim(coalesce(args->>'title', '')); nid uuid;
begin
  par := todo_private.assert_access((args->>'parentId')::uuid);
  if ttl = '' then raise exception 'La subtarea necesita un título'; end if;
  insert into todo.tasks (title, priority, completed, due_date, creator_id, team_id, parent_task_id, workspace_id)
  values (ttl, 'media', false, nullif(args->>'dueDate', '')::date, v, par.team_id, par.id, par.workspace_id)
  returning id into nid;
  return to_jsonb(nid);
end $$;

create function todo.update_task(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); t todo.tasks; tg text; new_assignee uuid;
begin
  t := todo_private.assert_access((args->>'taskId')::uuid);

  if args ? 'title' and btrim(coalesce(args->>'title', '')) <> '' then t.title := btrim(args->>'title'); end if;
  if args ? 'priority' then t.priority := args->>'priority'; end if;
  if args ? 'dueDate' then t.due_date := (args->>'dueDate')::date; end if;
  if args ? 'note' then t.note := args->>'note'; end if;
  if args ? 'recurrence' then t.recurrence := case when jsonb_typeof(args->'recurrence') = 'null' then null else args->'recurrence' end; end if;
  if args ? 'tags' then
    t.tags := case when jsonb_typeof(args->'tags') = 'null' then null
                   else array(select jsonb_array_elements_text(args->'tags')) end;
    foreach tg in array coalesce(t.tags, '{}') loop perform todo_private.ensure_tag(v, tg, t.workspace_id); end loop;
  end if;
  if args ? 'listId' then t.list_id := (args->>'listId')::uuid; end if;
  if args ? 'assigneeId' then
    if t.team_id is null then raise exception 'Solo las tareas de equipo se pueden asignar'; end if;
    new_assignee := (args->>'assigneeId')::uuid;
    if new_assignee is not null and not todo_private.is_team_member(t.team_id, new_assignee) then
      raise exception 'La persona asignada no está en el equipo';
    end if;
    t.assignee_id := new_assignee;
  end if;

  update todo.tasks set title = t.title, priority = t.priority, due_date = t.due_date, note = t.note,
         recurrence = t.recurrence, tags = t.tags, list_id = t.list_id, assignee_id = t.assignee_id
   where id = t.id;
  return null;
end $$;

-- `completed` opcional = estado deseado. Lo manda el cliente para que
-- reintentar desde la cola offline no vuelva a desmarcar la tarea.
create function todo.toggle_complete(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v uuid := todo_private.uid();
  t todo.tasks;
  completing boolean;
  today_s date := coalesce((args->>'today')::date, (now() at time zone 'Europe/Madrid')::date);
  base date;
begin
  t := todo_private.assert_access((args->>'taskId')::uuid);
  if args ? 'completed' and (args->>'completed')::boolean = t.completed then return null; end if;
  completing := not t.completed;

  if completing and t.recurrence is not null then
    -- Tarea recurrente: esta queda como hecha y se crea la siguiente.
    base := case when t.due_date is not null and t.due_date >= today_s then t.due_date else today_s end;
    insert into todo.tasks (title, priority, completed, due_date, note, creator_id, team_id, assignee_id,
                            recurrence, workspace_id, tags, list_id)
    values (t.title, t.priority, false, todo_private.next_occurrence(base, t.recurrence), t.note, t.creator_id,
            t.team_id, t.assignee_id, t.recurrence, t.workspace_id, t.tags, t.list_id);
    update todo.tasks set completed = true, recurrence = null where id = t.id;
  else
    update todo.tasks
       set completed = completing,
           kanban_status = case when t.parent_task_id is not null
                                then case when completing then 'done' else 'todo' end
                                else kanban_status end
     where id = t.id;
  end if;
  return null;
end $$;

create function todo.bulk_update(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); tid uuid; t todo.tasks; tg text;
begin
  for tid in select (jsonb_array_elements_text(args->'taskIds'))::uuid loop
    select * into t from todo.tasks where id = tid;
    continue when not found or not todo_private.can_access(t.team_id, t.creator_id, t.is_project, t.id, t.parent_task_id);
    if args ? 'priority' then t.priority := args->>'priority'; end if;
    if args ? 'dueDate' then t.due_date := (args->>'dueDate')::date; end if;
    if jsonb_array_length(coalesce(args->'addTags', '[]')) > 0 then
      t.tags := array(select distinct x from unnest(coalesce(t.tags, '{}') ||
                       array(select jsonb_array_elements_text(args->'addTags'))) x);
      for tg in select jsonb_array_elements_text(args->'addTags') loop
        perform todo_private.ensure_tag(v, tg, t.workspace_id);
      end loop;
    end if;
    if args ? 'listId' then t.list_id := (args->>'listId')::uuid; end if;
    update todo.tasks set priority = t.priority, due_date = t.due_date, tags = t.tags, list_id = t.list_id
     where id = t.id;
  end loop;
  return null;
end $$;

-- Borrar en cascada lo hacen las FK; devolvemos las rutas de adjuntos para
-- que el cliente las quite del storage.
create function todo.delete_task(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); t todo.tasks; paths text[];
begin
  t := todo_private.assert_access((args->>'taskId')::uuid);
  paths := todo_private.subtree_storage_paths(t.id);
  delete from todo.tasks where id = t.id;
  return jsonb_build_object('storagePaths', to_jsonb(paths));
end $$;

create function todo.bulk_delete(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); tid uuid; paths text[] := '{}';
begin
  for tid in select (jsonb_array_elements_text(args->'taskIds'))::uuid loop
    continue when not todo_private.can_access_task(tid);
    paths := paths || todo_private.subtree_storage_paths(tid);
    delete from todo.tasks where id = tid;
  end loop;
  return jsonb_build_object('storagePaths', to_jsonb(paths));
end $$;

create function todo.set_my_day(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); t todo.tasks; d date := (args->>'today')::date;
begin
  t := todo_private.assert_access((args->>'taskId')::uuid);
  if (args->>'inMyDay')::boolean then
    insert into todo.my_day (user_id, task_id, date) values (v, t.id, d) on conflict do nothing;
  else
    delete from todo.my_day where user_id = v and task_id = t.id and date = d;
  end if;
  return null;
end $$;

create function todo.move_task_in_kanban(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); t todo.tasks; st text := args->>'status';
begin
  t := todo_private.assert_access((args->>'taskId')::uuid);
  if t.parent_task_id is null and t.team_id is null then
    raise exception 'Esta tarea no pertenece a ningún tablero kanban';
  end if;
  update todo.tasks
     set kanban_status = st,
         completed = case when st = 'done' then true when completed then false else completed end
   where id = t.id;
  return null;
end $$;

create function todo.delete_user_tag(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid();
begin
  delete from todo.user_tags where user_id = v and name = args->>'name';
  return null;
end $$;

-- ================================================================ listas

create function todo.create_list(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); ws uuid := (args->>'workspaceId')::uuid;
        nm text := btrim(coalesce(args->>'name', '')); nid uuid;
begin
  if ws is not null and not todo_private.is_ws_member(ws) then raise exception 'No perteneces a ese entorno'; end if;
  if nm = '' then raise exception 'La lista necesita un nombre'; end if;
  insert into todo.lists (name, color, owner_id, workspace_id)
  values (nm, coalesce(args->>'color', '#3b82f6'), v, ws) returning id into nid;
  return to_jsonb(nid);
end $$;

create function todo_private.own_list(p_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare o uuid;
begin
  select owner_id into o from todo.lists where id = p_id;
  if not found then raise exception 'Lista no encontrada'; end if;
  if o <> auth.uid() then raise exception 'Sin acceso'; end if;
end $$;

create function todo.rename_list(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); nm text := btrim(coalesce(args->>'name', ''));
begin
  perform todo_private.own_list((args->>'listId')::uuid);
  if nm = '' then raise exception 'La lista necesita un nombre'; end if;
  update todo.lists set name = nm where id = (args->>'listId')::uuid;
  return null;
end $$;

create function todo.set_list_color(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid();
begin
  perform todo_private.own_list((args->>'listId')::uuid);
  update todo.lists set color = args->>'color' where id = (args->>'listId')::uuid;
  return null;
end $$;

-- Las tareas no se borran: se desvinculan (FK on delete set null).
create function todo.delete_list(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid();
begin
  perform todo_private.own_list((args->>'listId')::uuid);
  delete from todo.lists where id = (args->>'listId')::uuid;
  return null;
end $$;

-- ================================================================ equipos

create function todo.create_team(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); ws uuid := (args->>'workspaceId')::uuid;
        nm text := btrim(coalesce(args->>'name', '')); nid uuid;
begin
  if ws is not null and not todo_private.is_ws_member(ws) then raise exception 'No perteneces a ese entorno'; end if;
  if nm = '' then raise exception 'El equipo necesita un nombre'; end if;
  insert into todo.teams (name, owner_id, workspace_id) values (nm, v, ws) returning id into nid;
  insert into todo.team_members (team_id, user_id) values (nid, v);
  return to_jsonb(nid);
end $$;

create function todo.add_team_member(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); t todo.teams; who uuid := (args->>'userId')::uuid;
begin
  select * into t from todo.teams where id = (args->>'teamId')::uuid;
  if not found then raise exception 'Equipo no encontrado'; end if;
  if t.owner_id <> v then raise exception 'Solo el propietario puede añadir miembros'; end if;
  if t.workspace_id is not null and not exists (
       select 1 from todo.workspace_members where workspace_id = t.workspace_id and user_id = who) then
    raise exception 'Ese usuario no pertenece a este entorno';
  end if;
  if todo_private.is_team_member(t.id, who) then raise exception 'Ese usuario ya está en el equipo'; end if;
  insert into todo.team_members (team_id, user_id) values (t.id, who);
  return null;
end $$;

create function todo.leave_team(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); t todo.teams;
begin
  select * into t from todo.teams where id = (args->>'teamId')::uuid;
  if not found then raise exception 'Equipo no encontrado'; end if;
  if t.owner_id = v then raise exception 'El propietario no puede abandonar su propio equipo'; end if;
  delete from todo.team_members where team_id = t.id and user_id = v;
  return null;
end $$;

-- ================================================================ proyectos

create function todo_private.assert_project(p_id uuid) returns todo.tasks
language plpgsql stable security definer set search_path = '' as $$
declare p todo.tasks;
begin
  select * into p from todo.tasks where id = p_id;
  if not found then raise exception 'Proyecto no encontrado'; end if;
  if not p.is_project then raise exception 'Esa tarea no es un proyecto'; end if;
  return todo_private.assert_access(p_id);
end $$;

create function todo.convert_to_project(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); t todo.tasks;
begin
  t := todo_private.assert_access((args->>'taskId')::uuid);
  if t.is_project then return to_jsonb(t.id); end if;
  if t.parent_task_id is not null then raise exception 'Una subtarea no puede convertirse en proyecto'; end if;
  update todo.tasks set is_project = true, project_status = 'not_started', recurrence = null where id = t.id;
  return to_jsonb(t.id);
end $$;

create function todo.convert_from_project(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); p todo.tasks;
begin
  p := todo_private.assert_project((args->>'projectId')::uuid);
  if exists (select 1 from todo.tasks where parent_task_id = p.id) then
    raise exception 'Vacía el proyecto (sin tareas) antes de volverlo a tarea';
  end if;
  delete from todo.milestones where project_id = p.id;
  delete from todo.project_links where project_id = p.id;
  update todo.tasks set is_project = false, project_status = null, start_date = null, end_date = null,
         review_date = null, description = null, lead_id = null, tags = null
   where id = p.id;
  return null;
end $$;

create function todo.update_project(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); p todo.tasks; lead uuid;
begin
  p := todo_private.assert_project((args->>'projectId')::uuid);
  if args ? 'description' then p.description := args->>'description'; end if;
  if args ? 'startDate' then p.start_date := (args->>'startDate')::date; end if;
  if args ? 'endDate' then p.end_date := (args->>'endDate')::date; end if;
  if args ? 'reviewDate' then p.review_date := (args->>'reviewDate')::date; end if;
  if args ? 'projectStatus' then p.project_status := args->>'projectStatus'; end if;
  if args ? 'leadId' then
    lead := (args->>'leadId')::uuid;
    if lead is not null and p.team_id is not null and not todo_private.is_team_member(p.team_id, lead) then
      raise exception 'El responsable debe pertenecer al equipo';
    end if;
    p.lead_id := lead;
  end if;
  if args ? 'tags' then
    p.tags := array(select btrim(x) from jsonb_array_elements_text(args->'tags') x where btrim(x) <> '');
  end if;
  update todo.tasks set description = p.description, start_date = p.start_date, end_date = p.end_date,
         review_date = p.review_date, project_status = p.project_status, lead_id = p.lead_id, tags = p.tags
   where id = p.id;
  return null;
end $$;

-- Se puede compartir por nombre de usuario del todo o por el email con el
-- que la persona entra en la Intranet. Solo con gente del mismo entorno.
create function todo.share_project(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); p todo.tasks; who uuid; inp text := btrim(coalesce(args->>'username', ''));
begin
  p := todo_private.assert_project((args->>'projectId')::uuid);
  if p.creator_id <> v then raise exception 'Solo el creador puede compartir el proyecto'; end if;
  select id into who from todo.users where username = inp and not archived;
  if who is null then
    select tu.id into who from auth.users au join todo.users tu on tu.id = au.id
     where lower(au.email) = lower(inp) and not tu.archived;
  end if;
  if who is null then raise exception 'Usuario "%" no encontrado', inp; end if;
  if who = v then raise exception 'No puedes compartir contigo mismo'; end if;
  if p.workspace_id is not null and not exists (
       select 1 from todo.workspace_members where workspace_id = p.workspace_id and user_id = who) then
    raise exception 'Usuario "%" no encontrado', inp;
  end if;
  insert into todo.project_members (project_id, user_id) values (p.id, who) on conflict do nothing;
  return null;
end $$;

create function todo.unshare_project(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); p todo.tasks;
begin
  p := todo_private.assert_project((args->>'projectId')::uuid);
  if p.creator_id <> v then raise exception 'Solo el creador puede gestionar el acceso'; end if;
  delete from todo.project_members where project_id = p.id and user_id = (args->>'memberId')::uuid;
  return null;
end $$;

create function todo.add_milestone(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); p todo.tasks; nm text := btrim(coalesce(args->>'name', '')); nid uuid;
begin
  p := todo_private.assert_project((args->>'projectId')::uuid);
  if nm = '' then raise exception 'El hito necesita un nombre'; end if;
  insert into todo.milestones (project_id, name, date, completed, sort_order)
  values (p.id, nm, nullif(args->>'date', '')::date, false,
          coalesce((select max(sort_order) from todo.milestones where project_id = p.id), -1) + 1)
  returning id into nid;
  return to_jsonb(nid);
end $$;

create function todo.update_milestone(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); m todo.milestones;
begin
  select * into m from todo.milestones where id = (args->>'milestoneId')::uuid;
  if not found then raise exception 'Hito no encontrado'; end if;
  perform todo_private.assert_project(m.project_id);
  if args ? 'name' and btrim(coalesce(args->>'name', '')) <> '' then m.name := btrim(args->>'name'); end if;
  if args ? 'date' then m.date := (args->>'date')::date; end if;
  if args ? 'completed' then m.completed := (args->>'completed')::boolean; end if;
  update todo.milestones set name = m.name, date = m.date, completed = m.completed where id = m.id;
  return null;
end $$;

create function todo.delete_milestone(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); m todo.milestones;
begin
  select * into m from todo.milestones where id = (args->>'milestoneId')::uuid;
  if not found then return null; end if;
  perform todo_private.assert_project(m.project_id);
  delete from todo.milestones where id = m.id;
  return null;
end $$;

create function todo.add_link(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); p todo.tasks; u text := btrim(coalesce(args->>'url', ''));
        lbl text := btrim(coalesce(args->>'label', '')); nid uuid;
begin
  p := todo_private.assert_project((args->>'projectId')::uuid);
  if u = '' then raise exception 'El enlace necesita una URL'; end if;
  insert into todo.project_links (project_id, label, url) values (p.id, coalesce(nullif(lbl, ''), u), u)
  returning id into nid;
  return to_jsonb(nid);
end $$;

create function todo.delete_link(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); l todo.project_links;
begin
  select * into l from todo.project_links where id = (args->>'linkId')::uuid;
  if not found then return null; end if;
  perform todo_private.assert_project(l.project_id);
  delete from todo.project_links where id = l.id;
  return null;
end $$;

-- ================================================================ adjuntos

-- El fichero ya lo subió el cliente a 'todo-adjuntos/<taskId>/...'; aquí
-- solo se registra. Se exige que la ruta cuelgue de esa misma tarea.
create function todo.add_attachment(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); t todo.tasks; path text := args->>'storagePath'; nid uuid;
begin
  t := todo_private.assert_access((args->>'taskId')::uuid);
  if path is null or split_part(path, '/', 1) <> t.id::text then raise exception 'Ruta de adjunto no válida'; end if;
  insert into todo.attachments (task_id, storage_path, name, size, mime_type, uploader_id)
  values (t.id, path, args->>'name', (args->>'size')::bigint, coalesce(args->>'mimeType', ''), v)
  returning id into nid;
  return to_jsonb(nid);
end $$;

create function todo.delete_attachment(args jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := todo_private.uid(); a todo.attachments;
begin
  select * into a from todo.attachments where id = (args->>'attachmentId')::uuid;
  if not found then return null; end if;
  perform todo_private.assert_access(a.task_id);
  delete from todo.attachments where id = a.id;
  return jsonb_build_object('storagePaths', jsonb_build_array(a.storage_path));
end $$;

-- ================================================================ permisos

revoke all on all functions in schema todo from public, anon;
revoke all on all functions in schema todo_private from public, anon;
grant usage on schema todo to authenticated;
grant usage on schema todo_private to authenticated;
grant select on all tables in schema todo to authenticated;
grant execute on all functions in schema todo to authenticated;
grant execute on all functions in schema todo_private to authenticated;

-- ================================================================ tiempo real

alter publication supabase_realtime add table
  todo.tasks, todo.my_day, todo.lists, todo.teams, todo.team_members, todo.workspace_members,
  todo.milestones, todo.project_links, todo.project_members, todo.attachments, todo.user_tags;

-- ================================================================ storage

insert into storage.buckets (id, name, public) values ('todo-adjuntos', 'todo-adjuntos', false)
on conflict (id) do nothing;

create policy "todo_adjuntos_select" on storage.objects for select to authenticated
  using (bucket_id = 'todo-adjuntos' and todo_private.can_access_storage_path(name));
create policy "todo_adjuntos_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'todo-adjuntos' and todo_private.can_access_storage_path(name));
create policy "todo_adjuntos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'todo-adjuntos' and todo_private.can_access_storage_path(name));
