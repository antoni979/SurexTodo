// Tipos de los datos que devuelven las funciones del esquema `todo`. Tienen la
// misma forma que devolvía Convex (camelCase, _id/_creationTime), para que el
// resto de la app no note el cambio.

/** Identificador (uuid). El parámetro solo documenta de qué tabla es. */
export type Id<T extends string> = string & { readonly __table?: T };

export type Priority = "baja" | "media" | "alta" | "urgente";
export type KanbanStatus = "todo" | "in_progress" | "done";
export type ProjectStatus = "not_started" | "in_progress" | "paused" | "completed" | "cancelled";
export type RecurrenceDoc = {
  type: "daily" | "weekdays" | "weekly" | "monthly" | "custom";
  days?: number[];
  interval?: number;
};

export type Member = { userId: Id<"users">; username: string };

export type Me = { userId: Id<"users">; username: string | null; noAccess?: boolean } | null;

export type Workspace = {
  _id: Id<"workspaces">;
  _creationTime: number;
  name: string;
  ownerId: Id<"users">;
};

export type Team = {
  _id: Id<"teams">;
  _creationTime: number;
  name: string;
  ownerId: Id<"users">;
  workspaceId?: Id<"workspaces">;
};

export type TeamDetail = {
  _id: Id<"teams">;
  name: string;
  ownerId: Id<"users">;
  workspaceId: Id<"workspaces"> | null;
  isOwner: boolean;
  members: Member[];
};

export type ListSummary = {
  _id: Id<"lists">;
  name: string;
  color: string;
  workspaceId: Id<"workspaces"> | null;
};

export type EnrichedTask = {
  _id: Id<"tasks">;
  _creationTime: number;
  title: string;
  priority: Priority;
  completed: boolean;
  dueDate?: string;
  note?: string;
  creatorId: Id<"users">;
  teamId?: Id<"teams">;
  assigneeId?: Id<"users">;
  recurrence?: RecurrenceDoc;
  workspaceId?: Id<"workspaces">;
  listId?: Id<"lists">;
  parentTaskId?: Id<"tasks">;
  isProject?: boolean;
  description?: string;
  startDate?: string;
  endDate?: string;
  reviewDate?: string;
  projectStatus?: ProjectStatus;
  leadId?: Id<"users">;
  tags?: string[];
  kanbanStatus?: KanbanStatus;
  kanbanOrder?: number;
  creatorName: string | null;
  assigneeName: string | null;
  teamName: string | null;
  projectName: string | null;
  inMyDay: boolean;
  subtaskTotal: number;
  subtaskDone: number;
};

export type Subtask = {
  _id: Id<"tasks">;
  _creationTime: number;
  title: string;
  completed: boolean;
  dueDate: string | null;
};

export type ProjectSummary = {
  _id: Id<"tasks">;
  _creationTime: number;
  title: string;
  teamId: Id<"teams"> | null;
  teamName: string | null;
  projectStatus: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  leadName: string | null;
  taskCount: number;
  progress: number;
  tags: string[];
};

export type ProjectTask = {
  _id: Id<"tasks">;
  _creationTime: number;
  title: string;
  priority: Priority;
  completed: boolean;
  dueDate: string | null;
  note: string | null;
  assigneeId: Id<"users"> | null;
  assigneeName: string | null;
  kanbanStatus: KanbanStatus;
  kanbanOrder: number;
  subtasks: { _id: Id<"tasks">; title: string; completed: boolean; dueDate: string | null }[];
};

export type ProjectDetail = {
  _id: Id<"tasks">;
  title: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  reviewDate: string | null;
  projectStatus: ProjectStatus;
  leadId: Id<"users"> | null;
  leadName: string | null;
  tags: string[];
  teamId: Id<"teams"> | null;
  teamName: string | null;
  creatorId: Id<"users">;
  creatorName: string | null;
  isOwner: boolean;
  members: Member[];
  sharedMembers: Member[];
  tasks: ProjectTask[];
  milestones: { _id: Id<"milestones">; name: string; date: string | null; completed: boolean; order: number }[];
  links: { _id: Id<"projectLinks">; label: string; url: string }[];
  progress: number;
};

export type Attachment = {
  _id: Id<"attachments">;
  name: string;
  size: number;
  mimeType: string;
  uploaderId: Id<"users">;
  storagePath: string;
  createdAt: number;
};
