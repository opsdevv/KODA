import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { projectService } from "../services/projects.js";
import { pickFolder } from "../services/folder-picker.js";
import { filesystem } from "../services/filesystem.js";
import { chatService } from "../services/chat.js";
import { gitService } from "../services/git.js";
import { contextIndex } from "../services/context-index.js";
import { memory } from "../services/memory.js";
import { terminalService } from "../services/terminal.js";
import { previewService } from "../services/preview.js";
import { deepseek } from "../services/deepseek.js";
import { config } from "../config.js";
import { encryptSecret } from "../lib/security.js";
import { getDb, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export async function registerRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({
    status: "ok",
    deepseek: deepseek.isConfigured(),
    version: "0.1.0",
  }));

  app.get("/api/projects", async () => projectService.list());

  app.post("/api/projects/open", async (req) => {
    const body = z.object({ path: z.string() }).parse(req.body);
    return projectService.open(body.path);
  });

  app.post("/api/projects/pick-folder", async () => {
    const result = pickFolder();
    return { path: result.path, error: result.error };
  });

  app.post("/api/projects/import-folder", async (req, reply) => {
    const files: Array<{ relativePath: string; buffer: Buffer }> = [];
    let folderName = "project";

    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === "field") {
        if (part.fieldname === "name") {
          folderName = String(part.value);
        }
        continue;
      }

      const relativePath = part.filename.replace(/\\/g, "/");
      const buffer = await part.toBuffer();
      files.push({ relativePath, buffer });
    }

    if (files.length === 0) {
      return reply.status(400).send({ error: "No files uploaded" });
    }

    try {
      const project = await projectService.importFolder(files, folderName);
      return {
        ...project,
        filesImported: project.filesImported,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/api/projects/create", async (req) => {
    const body = z.object({ parentPath: z.string(), name: z.string() }).parse(req.body);
    return projectService.create(body.parentPath, body.name);
  });

  app.post("/api/projects/new", async (req) => {
    const body = z.object({ name: z.string().min(1).max(64) }).parse(req.body);
    return projectService.createInWorkspace(body.name);
  });

  app.post("/api/projects/upload", async (req, reply) => {
    const file = await req.file();
    if (!file) {
      return reply.status(400).send({ error: "No file uploaded. Use field name 'file'." });
    }

    const filename = file.filename;
    try {
      const project = await projectService.uploadZip(file.file, filename);
      return {
        ...project,
        filesExtracted: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.get("/api/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await projectService.get(id);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    return project;
  });

  app.get("/api/projects/:id/tree", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await projectService.get(id);
    if (!project) return reply.status(404).send({ error: "Not found" });
    return filesystem.listTree(project.rootPath);
  });

  app.get("/api/projects/:id/file", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { path: filePath } = z.object({ path: z.string() }).parse(req.query);
    const project = await projectService.get(id);
    if (!project) return reply.status(404).send({ error: "Not found" });
    return filesystem.readFile(project.rootPath, filePath);
  });

  app.put("/api/projects/:id/file", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ path: z.string(), content: z.string() }).parse(req.body);
    const project = await projectService.get(id);
    if (!project) return reply.status(404).send({ error: "Not found" });
    await filesystem.writeFile(project.rootPath, body.path, body.content);
    return { ok: true };
  });

  app.delete("/api/projects/:id/file", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ path: z.string() }).parse(req.body);
    const project = await projectService.get(id);
    if (!project) return reply.status(404).send({ error: "Not found" });
    await filesystem.deletePath(project.rootPath, body.path);
    return { ok: true };
  });

  app.get("/api/projects/:id/search", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { q } = z.object({ q: z.string() }).parse(req.query);
    const project = await projectService.get(id);
    if (!project) return reply.status(404).send({ error: "Not found" });
    return filesystem.searchFiles(project.rootPath, q);
  });

  app.post("/api/projects/:id/index", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await projectService.get(id);
    if (!project) return reply.status(404).send({ error: "Not found" });
    const count = await contextIndex.indexProject(id, project.rootPath);
    return { indexed: count };
  });

  app.get("/api/projects/:id/conversations", async (req) => {
    const { id } = req.params as { id: string };
    return chatService.listConversations(id);
  });

  app.post("/api/projects/:id/conversations", async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ title: z.string().optional(), mode: z.enum(["ask", "plan", "agent"]).optional() }).parse(req.body);
    return chatService.createConversation(id, body.title ?? "New Chat", body.mode ?? "ask");
  });

  app.get("/api/conversations/:id/messages", async (req) => {
    const { id } = req.params as { id: string };
    return chatService.getMessages(id);
  });

  app.delete("/api/conversations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    await chatService.deleteConversation(id);
    return reply.status(204).send();
  });

  app.get("/api/projects/:id/git/status", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await projectService.get(id);
    if (!project) return reply.status(404).send({ error: "Not found" });
    return gitService.status(project.rootPath);
  });

  app.post("/api/projects/:id/git/commit", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ message: z.string() }).parse(req.body);
    const project = await projectService.get(id);
    if (!project) return reply.status(404).send({ error: "Not found" });
    await gitService.commit(project.rootPath, body.message);
    return { ok: true };
  });

  app.post("/api/projects/:id/git/push", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await projectService.get(id);
    if (!project) return reply.status(404).send({ error: "Not found" });
    await gitService.push(project.rootPath);
    return { ok: true };
  });

  app.get("/api/projects/:id/memories", async (req) => {
    const { id } = req.params as { id: string };
    return memory.list(id);
  });

  app.post("/api/projects/:id/terminal/create", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ cols: z.number().optional(), rows: z.number().optional() }).parse(req.body);
    const project = await projectService.get(id);
    if (!project) return reply.status(404).send({ error: "Not found" });
    const session = terminalService.createSession(id, project.rootPath, body.cols || 80, body.rows || 24);
    return session;
  });

  app.post("/api/projects/:id/terminal/run", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ command: z.string() }).parse(req.body);
    const project = await projectService.get(id);
    if (!project) return reply.status(404).send({ error: "Not found" });
    return terminalService.runCommand(project.rootPath, body.command);
  });

  app.get("/api/projects/:id/preview", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await projectService.get(id);
    if (!project) return reply.status(404).send({ error: "Not found" });
    return previewService.getStatus(id);
  });

  app.post("/api/projects/:id/preview", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        openBrowser: z.boolean().optional(),
        publicHost: z.string().optional(),
      })
      .parse(req.body ?? {});
    const project = await projectService.get(id);
    if (!project) return reply.status(404).send({ error: "Not found" });
    try {
      return await previewService.start(id, project.rootPath, {
        openBrowser: body.openBrowser,
        publicHost: body.publicHost,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.delete("/api/projects/:id/preview", async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await projectService.get(id);
    if (!project) return reply.status(404).send({ error: "Not found" });
    previewService.stop(id);
    return reply.status(204).send();
  });

  app.post("/api/settings/api-key", async (req) => {
    const body = z.object({ apiKey: z.string() }).parse(req.body);
    const db = getDb();
    const encrypted = encryptSecret(body.apiKey);
    const existing = await db.select().from(schema.credentials).where(eq(schema.credentials.key, "deepseek_api_key")).limit(1);
    if (existing[0]) {
      await db.update(schema.credentials).set({ encryptedValue: encrypted, updatedAt: Date.now() }).where(eq(schema.credentials.id, existing[0].id));
    } else {
      await db.insert(schema.credentials).values({
        id: uuid(),
        key: "deepseek_api_key",
        encryptedValue: encrypted,
        updatedAt: Date.now(),
      });
    }
    deepseek.setApiKey(body.apiKey);
    return { ok: true };
  });

  app.get("/api/settings", async () => ({
    deepseekConfigured: deepseek.isConfigured(),
    host: config.host,
    port: config.port,
    defaultProject: config.defaultProject,
    autoApproveTools: config.autoApproveTools,
    authRequired: false,
  }));

  const openDefault = async (_req: unknown, reply: import("fastify").FastifyReply) => {
    try {
      return await projectService.open(config.defaultProject);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({
        error: `Cannot open default project (${config.defaultProject}): ${message}`,
      });
    }
  };

  app.get("/api/projects/open-default", openDefault);
  app.post("/api/projects/open-default", openDefault);
}
