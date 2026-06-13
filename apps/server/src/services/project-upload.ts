import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import unzipper from "unzipper";
import { v4 as uuid } from "uuid";
import { getProjectsWorkspace } from "../config.js";
import { logger } from "../lib/logger.js";

export interface UploadProgress {
  phase: "uploading" | "extracting" | "done";
  bytesReceived?: number;
  filesExtracted?: number;
  currentFile?: string;
}

export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 80) || "project";
}

function isPathSafe(destDir: string, entryPath: string): boolean {
  const normalized = entryPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) return false;
  const resolved = path.resolve(destDir, normalized);
  const base = path.resolve(destDir);
  return resolved === base || resolved.startsWith(base + path.sep);
}

export async function extractZipStream(
  stream: Readable,
  destDir: string,
  onProgress?: (p: UploadProgress) => void
): Promise<number> {
  await fsp.mkdir(destDir, { recursive: true });
  let filesExtracted = 0;

  return new Promise((resolve, reject) => {
    const parser = unzipper.Parse();
    let chain: Promise<void> = Promise.resolve();

    const processEntry = async (entry: unzipper.Entry) => {
      const entryPath = entry.path.replace(/\\/g, "/");
      if (!isPathSafe(destDir, entryPath)) {
        entry.autodrain();
        return;
      }

      const fullPath = path.join(destDir, entryPath);

      if (entry.type === "Directory") {
        await fsp.mkdir(fullPath, { recursive: true });
        entry.autodrain();
        return;
      }

      await fsp.mkdir(path.dirname(fullPath), { recursive: true });
      await new Promise<void>((res, rej) => {
        entry.pipe(fs.createWriteStream(fullPath)).on("finish", res).on("error", rej);
      });

      filesExtracted++;
      onProgress?.({
        phase: "extracting",
        filesExtracted,
        currentFile: entryPath,
      });
    };

    parser.on("entry", (entry: unzipper.Entry) => {
      chain = chain
        .then(() => processEntry(entry))
        .catch((err) => {
          logger.error({ err, path: entry.path }, "Zip entry extract failed");
          entry.autodrain();
        });
    });

    parser.on("close", () => {
      chain.then(() => resolve(filesExtracted)).catch(reject);
    });
    parser.on("error", reject);
    stream.on("error", reject);
    stream.pipe(parser);
  });
}

/** If zip has a single top-level folder, use it as project root. */
export async function resolveProjectRoot(extractedDir: string): Promise<string> {
  const entries = await fsp.readdir(extractedDir, { withFileTypes: true });
  if (entries.length === 1 && entries[0].isDirectory()) {
    return path.join(extractedDir, entries[0].name);
  }
  return extractedDir;
}

const ROOT_SKIP = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  "out",
]);

/** Prefer a directory that contains package.json (with dev/start) or index.html. */
export async function findBestProjectRoot(extractedDir: string): Promise<string> {
  let root = await resolveProjectRoot(extractedDir);
  if (await hasProjectMarker(root)) return root;

  const candidates: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 5) return;
    if (await hasDevPackage(dir)) candidates.push(dir);

    let entries: import("node:fs").Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ROOT_SKIP.has(ent.name) || ent.name.startsWith(".")) continue;
      await walk(path.join(dir, ent.name), depth + 1);
    }
  }

  await walk(root, 0);
  if (candidates.length === 0) return root;

  candidates.sort((a, b) => {
    const depthA = a.split(path.sep).length;
    const depthB = b.split(path.sep).length;
    if (depthA !== depthB) return depthA - depthB;
    const aApps = a.includes(`${path.sep}apps${path.sep}`) ? 0 : 1;
    const bApps = b.includes(`${path.sep}apps${path.sep}`) ? 0 : 1;
    return aApps - bApps;
  });

  return candidates[0];
}

async function hasProjectMarker(dir: string): Promise<boolean> {
  try {
    await fsp.access(path.join(dir, "package.json"));
    return true;
  } catch {
    /* continue */
  }
  try {
    await fsp.access(path.join(dir, "index.html"));
    return true;
  } catch {
    return false;
  }
}

async function hasDevPackage(dir: string): Promise<boolean> {
  const pkgPath = path.join(dir, "package.json");
  try {
    const raw = await fsp.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};
    return Boolean(scripts.dev || scripts.start || scripts.serve || scripts.preview);
  } catch {
    return false;
  }
}

export function allocateProjectDir(baseName: string): string {
  const workspace = getProjectsWorkspace();
  const slug = sanitizeName(baseName);
  const dirName = `${slug}-${uuid().slice(0, 8)}`;
  return path.join(workspace, dirName);
}

export async function ensureWorkspace(): Promise<string> {
  const workspace = getProjectsWorkspace();
  await fsp.mkdir(workspace, { recursive: true });
  return workspace;
}

export function validateZipFilename(filename: string): void {
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".zip")) {
    throw new Error("Only .zip archives are supported");
  }
}

const SKIP_IMPORT_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".turbo",
  "out",
  "__pycache__",
  ".venv",
]);

function shouldSkipImportPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments.some((seg) => SKIP_IMPORT_SEGMENTS.has(seg) || seg.startsWith("."));
}

export async function importFolderFiles(
  files: Array<{ relativePath: string; buffer: Buffer }>,
  baseName: string
): Promise<{ destDir: string; filesWritten: number }> {
  if (files.length === 0) {
    throw new Error("No files selected");
  }

  await ensureWorkspace();
  const destDir = allocateProjectDir(sanitizeName(baseName));
  await fsp.mkdir(destDir, { recursive: true });

  let filesWritten = 0;
  for (const { relativePath, buffer } of files) {
    const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!normalized || !isPathSafe(destDir, normalized) || shouldSkipImportPath(normalized)) {
      continue;
    }

    const fullPath = path.join(destDir, normalized);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, buffer);
    filesWritten++;
  }

  if (filesWritten === 0) {
    await fsp.rm(destDir, { recursive: true, force: true });
    throw new Error("No project files to import (skipped dotfiles and dependencies)");
  }

  return { destDir, filesWritten };
}

