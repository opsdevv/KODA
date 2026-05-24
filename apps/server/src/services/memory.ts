import { eq, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getDb, schema } from "../db/index.js";

export class MemoryService {
  async add(projectId: string, category: string, content: string, importance = 5) {
    const db = getDb();
    const id = uuid();
    await db.insert(schema.memories).values({
      id,
      projectId,
      category,
      content,
      importance,
      createdAt: Date.now(),
    });
    return id;
  }

  async list(projectId: string, limit = 20) {
    const db = getDb();
    return db
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.projectId, projectId))
      .orderBy(desc(schema.memories.importance), desc(schema.memories.createdAt))
      .limit(limit);
  }

  async buildContextPrompt(projectId: string): Promise<string> {
    const items = await this.list(projectId, 15);
    if (!items.length) return "";
    const lines = items.map((m) => `- [${m.category}] ${m.content}`);
    return `\n## Project Memory\n${lines.join("\n")}\n`;
  }
}

export const memory = new MemoryService();
