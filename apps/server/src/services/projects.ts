import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import fs from "node:fs/promises";
import path from "node:path";
import type { ProjectInfo } from "@koda/shared";
import { getDb, schema } from "../db/index.js";
import { contextIndex } from "./context-index.js";
import {
  allocateProjectDir,
  ensureWorkspace,
  extractZipStream,
  findBestProjectRoot,
  importFolderFiles,
  sanitizeName,
  validateZipFilename,
  type UploadProgress,
} from "./project-upload.js";
import type { Readable } from "node:stream";

export class ProjectService {
  async list(): Promise<ProjectInfo[]> {
    const db = getDb();
    const rows = await db.select().from(schema.projects);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      rootPath: r.rootPath,
      openedAt: r.openedAt,
    }));
  }

  async open(rootPath: string): Promise<ProjectInfo> {
    const resolved = path.resolve(rootPath);
    await fs.access(resolved);
    const db = getDb();
    const existing = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.rootPath, resolved))
      .limit(1);

    if (existing[0]) {
      await db
        .update(schema.projects)
        .set({ openedAt: Date.now() })
        .where(eq(schema.projects.id, existing[0].id));
      return {
        id: existing[0].id,
        name: existing[0].name,
        rootPath: existing[0].rootPath,
        openedAt: Date.now(),
      };
    }

    const id = uuid();
    const name = path.basename(resolved);
    const project: ProjectInfo = { id, name, rootPath: resolved, openedAt: Date.now() };

    await db.insert(schema.projects).values({
      id,
      name,
      rootPath: resolved,
      openedAt: project.openedAt,
    });

    contextIndex.indexProject(id, resolved).catch(() => {});
    return project;
  }

  async create(parentPath: string, name: string): Promise<ProjectInfo> {
    const rootPath = path.join(path.resolve(parentPath), name);
    await fs.mkdir(rootPath, { recursive: true });
    return this.open(rootPath);
  }

  async createInWorkspace(name: string): Promise<ProjectInfo> {
    await ensureWorkspace();
    const destDir = allocateProjectDir(sanitizeName(name));
    await fs.mkdir(destDir, { recursive: true });
    const slug = sanitizeName(name);
    await fs.writeFile(
      path.join(destDir, "README.md"),
      `# ${name}\n\nCreated with Cider.\n`,
      "utf-8"
    );
    await fs.writeFile(
      path.join(destDir, "index.html"),
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name}</title>
</head>
<body>
  <h1>${name}</h1>
  <p>Click <strong>Launch</strong> in Cider to preview this site.</p>
</body>
</html>
`,
      "utf-8"
    );
    await fs.writeFile(
      path.join(destDir, "package.json"),
      JSON.stringify(
        {
          name: slug,
          private: true,
          type: "module",
          scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
        },
        null,
        2
      ),
      "utf-8"
    );
    return this.open(destDir);
  }

  async importFolder(
    files: Array<{ relativePath: string; buffer: Buffer }>,
    folderName: string
  ): Promise<ProjectInfo & { filesImported: number }> {
    const { destDir, filesWritten } = await importFolderFiles(files, folderName);
    const rootPath = await findBestProjectRoot(destDir);
    const project = await this.open(rootPath);
    return { ...project, filesImported: filesWritten };
  }

  async uploadZip(
    stream: Readable,
    filename: string,
    onProgress?: (p: UploadProgress) => void
  ): Promise<ProjectInfo> {
    validateZipFilename(filename);
    await ensureWorkspace();

    const baseName = path.basename(filename, path.extname(filename));
    const destDir = allocateProjectDir(baseName);

    onProgress?.({ phase: "extracting", filesExtracted: 0 });
    const count = await extractZipStream(stream, destDir, onProgress);
    if (count === 0) {
      await fs.rm(destDir, { recursive: true, force: true });
      throw new Error("Zip archive is empty or invalid");
    }

    const rootPath = await findBestProjectRoot(destDir);
    onProgress?.({ phase: "done", filesExtracted: count });
    return this.open(rootPath);
  }

  async get(id: string): Promise<ProjectInfo | null> {
    const db = getDb();
    const rows = await db.select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1);
    const r = rows[0];
    if (!r) return null;
    return { id: r.id, name: r.name, rootPath: r.rootPath, openedAt: r.openedAt };
  }
}

export const projectService = new ProjectService();
