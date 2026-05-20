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
  })
    .index("by_creator", ["creatorId"])
    .index("by_team", ["teamId"])
    .index("by_assignee", ["assigneeId"]),

  myDay: defineTable({
    userId: v.id("users"),
    taskId: v.id("tasks"),
    date: v.string(),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_task", ["taskId"]),
});
