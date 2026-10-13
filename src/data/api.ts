// Catálogo de funciones del backend, con los MISMOS nombres que tenía Convex
// (api.tasks.listMyDay, api.lists.createList…). Cada entrada apunta a la
// función SQL equivalente del esquema `todo` y lleva el tipo de sus args y de
// su resultado.

import type {
  Attachment,
  EnrichedTask,
  Id,
  KanbanStatus,
  ListSummary,
  Me,
  Member,
  Priority,
  ProjectDetail,
  ProjectStatus,
  ProjectSummary,
  RecurrenceDoc,
  Subtask,
  Team,
  TeamDetail,
  Workspace,
} from "./types";

export type QueryRef<A, R> = {
  kind: "query";
  /** Nombre estable, se usa como clave de caché. */
  name: string;
  /** Función SQL en el esquema `todo`. */
  fn: string;
  readonly __args?: A;
  readonly __result?: R;
};

export type MutationRef<A, R> = {
  kind: "mutation";
  name: string;
  fn: string;
  /** Si falla por falta de red, se guarda en la cola offline y se reintenta. */
  queueable?: boolean;
  /** Generar `id` en el cliente antes de enviar (para reintentos idempotentes). */
  clientId?: boolean;
  readonly __args?: A;
  readonly __result?: R;
};

export type FunctionReturnType<F> = F extends QueryRef<any, infer R>
  ? R
  : F extends MutationRef<any, infer R>
    ? R
    : never;

const q = <A, R>(name: string, fn: string): QueryRef<A, R> => ({ kind: "query", name, fn });
const m = <A, R = null>(
  name: string,
  fn: string,
  opts: { queueable?: boolean; clientId?: boolean } = {},
): MutationRef<A, R> => ({ kind: "mutation", name, fn, ...opts });

type WsArg = { workspaceId?: Id<"workspaces"> };
type DayArg = { today?: string };
type Nullable<T> = T | null;
type DeleteResult = { storagePaths: string[] } | null;

export const api = {
  profiles: {
    me: q<Record<string, never>, Me>("profiles:me", "me"),
  },
  workspaces: {
    listMyWorkspaces: q<Record<string, never>, Workspace[]>("workspaces:listMyWorkspaces", "list_my_workspaces"),
  },
  teams: {
    listMyTeams: q<WsArg, Team[]>("teams:listMyTeams", "list_my_teams"),
    getTeam: q<{ teamId: Id<"teams"> }, TeamDetail | null>("teams:getTeam", "get_team"),
    listAddableUsers: q<{ teamId: Id<"teams"> }, Member[]>("teams:listAddableUsers", "list_addable_team_users"),
    createTeam: m<{ name: string } & WsArg, Id<"teams">>("teams:createTeam", "create_team"),
    addMember: m<{ teamId: Id<"teams">; userId: Id<"users"> }>("teams:addMember", "add_team_member"),
    leaveTeam: m<{ teamId: Id<"teams"> }>("teams:leaveTeam", "leave_team"),
  },
  lists: {
    listMyLists: q<WsArg, ListSummary[]>("lists:listMyLists", "list_my_lists"),
    createList: m<{ name: string; color?: string } & WsArg, Id<"lists">>("lists:createList", "create_list"),
    renameList: m<{ listId: Id<"lists">; name: string }>("lists:renameList", "rename_list"),
    setListColor: m<{ listId: Id<"lists">; color: string }>("lists:setListColor", "set_list_color"),
    deleteList: m<{ listId: Id<"lists"> }>("lists:deleteList", "delete_list"),
  },
  tasks: {
    listAllTags: q<WsArg, string[]>("tasks:listAllTags", "list_all_tags"),
    getTask: q<{ taskId: Id<"tasks"> } & DayArg, EnrichedTask | null>("tasks:getTask", "get_task"),
    listPersonal: q<DayArg & WsArg, EnrichedTask[]>("tasks:listPersonal", "list_personal"),
    listByList: q<{ listId: Id<"lists"> } & DayArg, EnrichedTask[]>("tasks:listByList", "list_by_list"),
    listTeamTasks: q<{ teamId: Id<"teams"> } & DayArg, EnrichedTask[]>("tasks:listTeamTasks", "list_team_tasks"),
    listMyDay: q<{ today: string } & WsArg, EnrichedTask[]>("tasks:listMyDay", "list_my_day"),
    listPlanned: q<{ today: string } & WsArg, EnrichedTask[]>("tasks:listPlanned", "list_planned"),
    listSubtasks: q<{ parentId: Id<"tasks"> }, Subtask[]>("tasks:listSubtasks", "list_subtasks"),

    createTask: m<
      {
        title: string;
        priority: Priority;
        dueDate?: string;
        teamId?: Id<"teams">;
        assigneeId?: Id<"users">;
        recurrence?: RecurrenceDoc;
        addToMyDay?: boolean;
        today?: string;
        parentTaskId?: Id<"tasks">;
        tags?: string[];
        listId?: Id<"lists">;
      } & WsArg,
      Id<"tasks">
    >("tasks:createTask", "create_task", { queueable: true, clientId: true }),
    createSubtask: m<{ parentId: Id<"tasks">; title: string; dueDate?: string }, Id<"tasks">>(
      "tasks:createSubtask",
      "create_subtask",
    ),
    updateTask: m<{
      taskId: Id<"tasks">;
      title?: string;
      priority?: Priority;
      dueDate?: Nullable<string>;
      assigneeId?: Nullable<Id<"users">>;
      note?: Nullable<string>;
      recurrence?: Nullable<RecurrenceDoc>;
      tags?: Nullable<string[]>;
      listId?: Nullable<Id<"lists">>;
    }>("tasks:updateTask", "update_task", { queueable: true }),
    /** `completed` = estado deseado; si se manda, reintentar es seguro. */
    toggleComplete: m<{ taskId: Id<"tasks">; today?: string; completed?: boolean }>(
      "tasks:toggleComplete",
      "toggle_complete",
      { queueable: true },
    ),
    bulkUpdate: m<{
      taskIds: Id<"tasks">[];
      priority?: Priority;
      dueDate?: Nullable<string>;
      addTags?: string[];
      listId?: Nullable<Id<"lists">>;
    }>("tasks:bulkUpdate", "bulk_update"),
    bulkDelete: m<{ taskIds: Id<"tasks">[] }, DeleteResult>("tasks:bulkDelete", "bulk_delete"),
    deleteTask: m<{ taskId: Id<"tasks"> }, DeleteResult>("tasks:deleteTask", "delete_task"),
    setMyDay: m<{ taskId: Id<"tasks">; today: string; inMyDay: boolean }>("tasks:setMyDay", "set_my_day", {
      queueable: true,
    }),
    moveTaskInKanban: m<{ taskId: Id<"tasks">; status: KanbanStatus }>(
      "tasks:moveTaskInKanban",
      "move_task_in_kanban",
      { queueable: true },
    ),
    deleteUserTag: m<{ name: string }>("tasks:deleteUserTag", "delete_user_tag"),
  },
  projects: {
    listMyProjects: q<WsArg, ProjectSummary[]>("projects:listMyProjects", "list_my_projects"),
    getProject: q<{ projectId: Id<"tasks"> }, ProjectDetail | null>("projects:getProject", "get_project"),
    convertToProject: m<{ taskId: Id<"tasks"> }, Id<"tasks">>("projects:convertToProject", "convert_to_project"),
    convertFromProject: m<{ projectId: Id<"tasks"> }>("projects:convertFromProject", "convert_from_project"),
    updateProject: m<{
      projectId: Id<"tasks">;
      description?: Nullable<string>;
      startDate?: Nullable<string>;
      endDate?: Nullable<string>;
      reviewDate?: Nullable<string>;
      projectStatus?: ProjectStatus;
      leadId?: Nullable<Id<"users">>;
      tags?: string[];
    }>("projects:updateProject", "update_project"),
    shareProject: m<{ projectId: Id<"tasks">; username: string }>("projects:shareProject", "share_project"),
    unshareProject: m<{ projectId: Id<"tasks">; memberId: Id<"users"> }>(
      "projects:unshareProject",
      "unshare_project",
    ),
    addMilestone: m<{ projectId: Id<"tasks">; name: string; date?: string }, Id<"milestones">>(
      "projects:addMilestone",
      "add_milestone",
    ),
    updateMilestone: m<{
      milestoneId: Id<"milestones">;
      name?: string;
      date?: Nullable<string>;
      completed?: boolean;
    }>("projects:updateMilestone", "update_milestone"),
    deleteMilestone: m<{ milestoneId: Id<"milestones"> }>("projects:deleteMilestone", "delete_milestone"),
    addLink: m<{ projectId: Id<"tasks">; label: string; url: string }, Id<"projectLinks">>(
      "projects:addLink",
      "add_link",
    ),
    deleteLink: m<{ linkId: Id<"projectLinks"> }>("projects:deleteLink", "delete_link"),
  },
  attachments: {
    listAttachments: q<{ taskId: Id<"tasks"> }, Attachment[]>("attachments:listAttachments", "list_attachments"),
    addAttachment: m<
      { taskId: Id<"tasks">; storagePath: string; name: string; size: number; mimeType: string },
      Id<"attachments">
    >("attachments:addAttachment", "add_attachment"),
    deleteAttachment: m<{ attachmentId: Id<"attachments"> }, DeleteResult>(
      "attachments:deleteAttachment",
      "delete_attachment",
    ),
  },
};
