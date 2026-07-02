import fs from "node:fs/promises";
import path from "node:path";
import type { FileNode, FileReadResult, FileSearchResult } from "@koda/shared";
import { assertPathAllowed, shouldIgnoreEntry } from "../lib/security.js";
import { logger } from "../lib/logger.js";

export class FilesystemService {
  async listTree(rootPath: string, relativePath = ""): Promise<FileNode> {
    const absPath = assertPathAllowed(rootPath, relativePath || ".");
    const stat = await fs.stat(absPath);
    const name = path.basename(absPath) || path.basename(rootPath);

    if (!stat.isDirectory()) {
      return { name, path: relativePath || name, type: "file", size: stat.size, modifiedAt: stat.mtimeMs };
    }

    const entries = await fs.readdir(absPath, { withFileTypes: true });
    const children: FileNode[] = [];

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (shouldIgnoreEntry(entry.name)) continue;
      const childRel = relativePath ? path.join(relativePath, entry.name) : entry.name;
      try {
        children.push(await this.listTree(rootPath, childRel));
      } catch (err) {
        logger.warn({ err, childRel }, "Skipped unreadable path");
      }
    }

    return { name, path: relativePath || ".", type: "directory", children, modifiedAt: stat.mtimeMs };
  }

  async readFile(rootPath: string, relativePath: string): Promise<FileReadResult> {
    const absPath = assertPathAllowed(rootPath, relativePath);
    const content = await fs.readFile(absPath, "utf-8");
    return { path: relativePath, content, language: detectLanguage(relativePath) };
  }

  async writeFile(rootPath: string, relativePath: string, content: string): Promise<void> {
    const absPath = assertPathAllowed(rootPath, relativePath);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, "utf-8");
  }

  async deletePath(rootPath: string, relativePath: string): Promise<void> {
    const absPath = assertPathAllowed(rootPath, relativePath);
    await fs.rm(absPath, { recursive: true, force: true });
  }

  async renamePath(rootPath: string, from: string, to: string): Promise<void> {
    const fromAbs = assertPathAllowed(rootPath, from);
    const toAbs = assertPathAllowed(rootPath, to);
    await fs.mkdir(path.dirname(toAbs), { recursive: true });
    await fs.rename(fromAbs, toAbs);
  }

  async searchFiles(rootPath: string, query: string, maxResults = 50): Promise<FileSearchResult[]> {
    const results: FileSearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    async function walk(dirRel: string) {
      if (results.length >= maxResults) return;
      const absDir = assertPathAllowed(rootPath, dirRel || ".");
      const entries = await fs.readdir(absDir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxResults) return;
        if (shouldIgnoreEntry(entry.name)) continue;
        const rel = dirRel ? path.join(dirRel, entry.name) : entry.name;

        if (entry.isDirectory()) {
          await walk(rel);
          continue;
        }

        try {
          const content = await fs.readFile(assertPathAllowed(rootPath, rel), "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const idx = line.toLowerCase().indexOf(lowerQuery);
            if (idx >= 0) {
              results.push({
                path: rel,
                line: i + 1,
                column: idx + 1,
                preview: line.trim().slice(0, 200),
              });
              if (results.length >= maxResults) return;
            }
          }
        } catch {
          /* skip binary/unreadable */
        }
      }
    }

    await walk("");
    return results;
  }
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".json": "json",
    ".md": "markdown",
    ".py": "python",
    ".rs": "rust",
    ".go": "go",
    ".css": "css",
    ".html": "html",
    ".sql": "sql",
    ".yaml": "yaml",
    ".yml": "yaml",
  };
  return map[ext] ?? "plaintext";
}

export const filesystem = new FilesystemService();
