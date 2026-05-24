import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  rootPath: text("root_path").notNull(),
  openedAt: integer("opened_at").notNull(),
  settings: text("settings", { mode: "json" }).$type<Record<string, unknown>>(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  mode: text("mode").notNull().default("ask"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at").notNull(),
});

export const agentTasks = sqliteTable("agent_tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  conversationId: text("conversation_id").notNull(),
  mode: text("mode").notNull(),
  goal: text("goal").notNull(),
  status: text("status").notNull(),
  plan: text("plan", { mode: "json" }),
  checkpoints: text("checkpoints", { mode: "json" }),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  category: text("category").notNull(),
  content: text("content").notNull(),
  importance: integer("importance").default(5),
  createdAt: integer("created_at").notNull(),
});

export const fileIndex = sqliteTable("file_index", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  path: text("path").notNull(),
  hash: text("hash").notNull(),
  language: text("language"),
  symbols: text("symbols", { mode: "json" }).$type<string[]>(),
  contentPreview: text("content_preview"),
  embedding: text("embedding", { mode: "json" }).$type<number[]>(),
  updatedAt: integer("updated_at").notNull(),
});

export const credentials = sqliteTable("credentials", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  encryptedValue: text("encrypted_value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
});
