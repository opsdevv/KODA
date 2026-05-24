import { eq, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AiMode } from "@cider/shared";
import { getDb, schema } from "../db/index.js";
import { agentOrchestrator } from "../agent/orchestrator.js";
import type { AgentLoopEvent } from "@cider/shared";
import { projectService } from "./projects.js";

export class ChatService {
  async createConversation(projectId: string, title: string, mode: AiMode = "ask") {
    const db = getDb();
    const id = uuid();
    const now = Date.now();
    await db.insert(schema.conversations).values({
      id,
      projectId,
      title,
      mode,
      createdAt: now,
      updatedAt: now,
    });
    return { id, projectId, title, mode, createdAt: now, updatedAt: now };
  }

  async getMessages(conversationId: string) {
    const db = getDb();
    return db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(schema.messages.createdAt);
  }

  async saveMessage(conversationId: string, role: string, content: string, metadata?: Record<string, unknown>) {
    const db = getDb();
    const id = uuid();
    await db.insert(schema.messages).values({
      id,
      conversationId,
      role,
      content,
      metadata,
      createdAt: Date.now(),
    });
    return id;
  }

  async listConversations(projectId: string) {
    const db = getDb();
    return db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.projectId, projectId))
      .orderBy(desc(schema.conversations.updatedAt));
  }

  async deleteConversation(conversationId: string) {
    const db = getDb();
    await db.delete(schema.messages).where(eq(schema.messages.conversationId, conversationId));
    await db.delete(schema.conversations).where(eq(schema.conversations.id, conversationId));
  }

  async runChat(
    projectId: string,
    conversationId: string,
    mode: AiMode,
    userMessage: string,
    emit: (event: AgentLoopEvent) => void,
    signal?: AbortSignal,
    onToolApproval?: (toolCallId: string, name: string, args: Record<string, unknown>) => Promise<boolean>
  ): Promise<string> {
    const project = await projectService.get(projectId);
    if (!project) throw new Error("Project not found");

    await this.saveMessage(conversationId, "user", userMessage, { mode });

    const history = await this.getMessages(conversationId);
    const conversationHistory: ChatCompletionMessageParam[] = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-20)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const response = await agentOrchestrator.run({
      projectId,
      rootPath: project.rootPath,
      mode,
      goal: userMessage,
      conversationHistory: conversationHistory.slice(0, -1),
      emit,
      signal,
      onToolApproval,
    });

    await this.saveMessage(conversationId, "assistant", response, { mode });
    return response;
  }
}

export const chatService = new ChatService();
