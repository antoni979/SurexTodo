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

  teams: defineTable({
    name: v.string(),
    ownerId: v.id("users"),
  }).index("by_owner", ["ownerId"]),

  teamMembers: defineTable({
    teamId: v.id("teams"),
    userId: v.id("users"),
  })
    .index("by_team", ["teamId"])
    .index("by_user", ["userId"])
    .index("by_team_user", ["teamId", "userId"]),

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

    // --- Subtasks: parentTaskId points to the owning task or project.
    parentTaskId: v.optional(v.id("tasks")),

    // --- Project flag and project-only fields.
    isProject: v.optional(v.boolean()),
    description: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
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
    .index("by_parent", ["parentTaskId"]),

  milestones: defineTable({
    projectId: v.id("tasks"),
    name: v.string(),
    date: v.optional(v.string()),
    completed: v.boolean(),
    order: v.number(),
  }).index("by_project", ["projectId"]),

  projectLinks: defineTable({
    projectId: v.id("tasks"),
    label: v.string(),
    url: v.string(),
  }).index("by_project", ["projectId"]),

  myDay: defineTable({
    userId: v.id("users"),
    taskId: v.id("tasks"),
    date: v.string(),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_task", ["taskId"]),
});
