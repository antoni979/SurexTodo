import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export const priorityValidator = v.union(
  v.literal("baja"),
  v.literal("media"),
  v.literal("alta"),
  v.literal("urgente"),
);

export const recurrenceValidator = v.object({
  type: v.union(
    v.literal("daily"),
    v.literal("weekdays"),
    v.literal("weekly"),
    v.literal("monthly"),
    v.literal("custom"),
  ),
  // For "custom": weekday numbers, 0 = domingo … 6 = sábado.
  days: v.optional(v.array(v.number())),
  // Repeat every N units (default 1). E.g. interval=2 + type="weekly" = every 2 weeks.
  interval: v.optional(v.number()),
});

export const projectStatusValidator = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("paused"),
  v.literal("completed"),
  v.literal("cancelled"),
);

export const kanbanStatusValidator = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("done"),
);

export default defineSchema({
  ...authTables,

  profiles: defineTable({
    userId: v.id("users"),
    username: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_username", ["username"]),

  workspaces: defineTable({
    name: v.string(),
    ownerId: v.id("users"),
  }).index("by_owner", ["ownerId"]),

  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_workspace_user", ["workspaceId", "userId"]),

  teams: defineTable({
    name: v.string(),
    ownerId: v.id("users"),
    workspaceId: v.optional(v.id("workspaces")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_workspace", ["workspaceId"]),

  teamMembers: defineTable({
    teamId: v.id("teams"),
    userId: v.id("users"),
  })
    .index("by_team", ["teamId"])
    .index("by_user", ["userId"])
    .index("by_team_user", ["teamId", "userId"]),

  userTags: defineTable({
    userId: v.id("users"),
    name: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
  })
    .index("by_user", ["userId"])
    .index("by_user_name", ["userId", "name"]),

  lists: defineTable({
    name: v.string(),
    color: v.optional(v.string()),       // hex, e.g. "#3b82f6"
    ownerId: v.id("users"),
    workspaceId: v.optional(v.id("workspaces")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_workspace_owner", ["workspaceId", "ownerId"]),

  tasks: defineTable({
    title: v.string(),
    priority: priorityValidator,
    completed: v.boolean(),
    dueDate: v.optional(v.string()),
    note: v.optional(v.string()),
    creatorId: v.id("users"),
    teamId: v.optional(v.id("teams")),
    assigneeId: v.optional(v.id("users")),
    recurrence: v.optional(recurrenceValidator),
    workspaceId: v.optional(v.id("workspaces")),

    // --- Lista personalizada (estilo Microsoft To-Do).
    listId: v.optional(v.id("lists")),

    // --- Subtasks: parentTaskId points to the owning task or project.
    parentTaskId: v.optional(v.id("tasks")),

    // --- Project flag and project-only fields.
    isProject: v.optional(v.boolean()),
    description: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    reviewDate: v.optional(v.string()),
    projectStatus: v.optional(projectStatusValidator),
    leadId: v.optional(v.id("users")),
    tags: v.optional(v.array(v.string())),

    // --- Kanban (only meaningful when this task is a child of a project).
    kanbanStatus: v.optional(kanbanStatusValidator),
    kanbanOrder: v.optional(v.number()),
  })
    .index("by_creator", ["creatorId"])
    .index("by_team", ["teamId"])
    .index("by_assignee", ["assigneeId"])
    .index("by_parent", ["parentTaskId"])
    .index("by_list", ["listId"]),

  milestones: defineTable({
    projectId: v.id("tasks"),
    name: v.string(),
    date: v.optional(v.string()),
    completed: v.boolean(),
    order: v.number(),
  }).index("by_project", ["projectId"]),

  projectMembers: defineTable({
    projectId: v.id("tasks"),
    userId: v.id("users"),
  })
    .index("by_project", ["projectId"])
    .index("by_user", ["userId"])
    .index("by_project_user", ["projectId", "userId"]),

  projectLinks: defineTable({
    projectId: v.id("tasks"),
    label: v.string(),
    url: v.string(),
  }).index("by_project", ["projectId"]),

  attachments: defineTable({
    taskId: v.id("tasks"),
    storageId: v.id("_storage"),
    name: v.string(),
    size: v.number(),
    mimeType: v.string(),
    uploaderId: v.id("users"),
  }).index("by_task", ["taskId"]),

  myDay: defineTable({
    userId: v.id("users"),
    taskId: v.id("tasks"),
    date: v.string(),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_task", ["taskId"]),

  // --- Segundo Cerebro: un único espacio de notas por usuario, transversal
  // a todos sus entornos (deliberadamente SIN workspaceId). La única
  // garantía de privacidad exigida es entre usuarios, no entre entornos.
  brainNotes: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    body: v.string(), // markdown en crudo, incluye [[wikilinks]]
    tags: v.optional(v.array(v.string())),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_title", ["ownerId", "title"]),

  // Enlaces [[Título]] extraídos del body al guardar una nota. Se recalculan
  // enteros en cada guardado (borrar+reinsertar), nada de diffing.
  brainLinks: defineTable({
    ownerId: v.id("users"),
    sourceNoteId: v.id("brainNotes"),
    targetTitle: v.string(),
    targetNoteId: v.optional(v.id("brainNotes")), // undefined = enlace roto
  })
    .index("by_source", ["sourceNoteId"])
    .index("by_target_note", ["targetNoteId"])
    .index("by_owner", ["ownerId"]),
});
