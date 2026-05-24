import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getDb, schema } from "../db/index.js";
import { assertPathAllowed, shouldIgnoreEntry } from "../lib/security.js";
import { logger } from "../lib/logger.js";

const INDEXABLE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".py", ".rs", ".go",
  ".css", ".html", ".sql", ".yaml", ".yml", ".toml", ".vue", ".svelte",
]);

export class ContextIndexService {
  async indexProject(
    projectId: string,
    rootPath: string,
    onProgress?: (percent: number) => void
  ): Promise<number> {
    const files: string[] = [];
    await this.collectFiles(rootPath, "", files);
    const db = getDb();
    let done = 0;

    for (const rel of files) {
      try {
        const abs = assertPathAllowed(rootPath, rel);
        const content = await fs.readFile(abs, "utf-8");
        const hash = crypto.createHash("sha256").update(content).digest("hex");
        const symbols = extractSymbols(content, rel);
        const preview = content.slice(0, 500);

        const existing = await db
          .select()
          .from(schema.fileIndex)
          .where(eq(schema.fileIndex.path, rel))
          .limit(1);

        const embedding = simpleEmbedding(content);

        if (existing[0]) {
          await db
            .update(schema.fileIndex)
            .set({ hash, symbols, contentPreview: preview, embedding, updatedAt: Date.now() })
            .where(eq(schema.fileIndex.id, existing[0].id));
        } else {
          await db.insert(schema.fileIndex).values({
            id: uuid(),
            projectId,
            path: rel,
            hash,
            language: path.extname(rel).slice(1),
            symbols,
            contentPreview: preview,
            embedding,
            updatedAt: Date.now(),
          });
        }
      } catch (err) {
        logger.warn({ err, rel }, "Index skip");
      }
      done++;
      onProgress?.(Math.round((done / files.length) * 100));
    }

    return files.length;
  }

  async search(projectId: string, query: string, limit = 8): Promise<Array<{ path: string; preview: string; score: number }>> {
    const db = getDb();
    const entries = await db
      .select()
      .from(schema.fileIndex)
      .where(eq(schema.fileIndex.projectId, projectId));

    const queryVec = simpleEmbedding(query);
    const scored = entries
      .map((e) => ({
        path: e.path,
        preview: e.contentPreview ?? "",
        score: cosineSimilarity(queryVec, (e.embedding as number[]) ?? []),
      }))
      .filter((s) => s.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
  }

  private async collectFiles(rootPath: string, dirRel: string, out: string[]) {
    const absDir = assertPathAllowed(rootPath, dirRel || ".");
    const entries = await fs.readdir(absDir, { withFileTypes: true });

    for (const entry of entries) {
      if (shouldIgnoreEntry(entry.name)) continue;
      const rel = dirRel ? path.join(dirRel, entry.name) : entry.name;

      if (entry.isDirectory()) {
        await this.collectFiles(rootPath, rel, out);
      } else if (INDEXABLE_EXT.has(path.extname(entry.name).toLowerCase())) {
        out.push(rel);
      }
    }
  }
}

function extractSymbols(content: string, filePath: string): string[] {
  const symbols: string[] = [];
  const patterns = [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    /(?:export\s+)?class\s+(\w+)/g,
    /(?:export\s+)?(?:const|let)\s+(\w+)\s*=/g,
    /def\s+(\w+)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      symbols.push(match[1]);
    }
  }
  if (!symbols.length) symbols.push(path.basename(filePath));
  return [...new Set(symbols)].slice(0, 30);
}

/** Lightweight bag-of-words embedding for local semantic search (no external model). */
function simpleEmbedding(text: string): number[] {
  const words = text.toLowerCase().replace(/[^a-z0-9_\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const vec = new Array(128).fill(0);
  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) hash = (hash * 31 + word.charCodeAt(i)) | 0;
    const idx = Math.abs(hash) % 128;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}

export const contextIndex = new ContextIndexService();
