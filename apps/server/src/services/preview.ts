import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import type { ProjectPreviewStartResult, ProjectPreviewStatus } from "@cider/shared";
import { logger } from "../lib/logger.js";

type PackageManager = "npm" | "pnpm" | "yarn";
type RunnerKind = "default" | "next" | "vite" | "static";

interface DevTarget {
  cwd: string;
  script: string;
  defaultPort: number;
  packageManager: PackageManager;
  runner: RunnerKind;
  staticOnly?: boolean;
}

interface PreviewSession {
  projectId: string;
  cwd: string;
  port: number;
  localUrl: string;
  url: string;
  command: string;
  process: ChildProcess;
  startedAt: number;
}

const SKIP_DIRS = new Set([
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
  ".cache",
]);

const PREFERRED_REL_DIRS = [
  "apps/web",
  "apps/client",
  "apps/frontend",
  "apps/app",
  "packages/web",
  "packages/frontend",
  "client",
  "frontend",
  "web",
  "app",
  "src",
];

const META_DEV_PATTERN = /concurrently|turbo\s+run|lerna\s+run|npm-run-all|run-p\s|run-s\s/i;

export class PreviewService {
  private sessions = new Map<string, PreviewSession>();

  getStatus(projectId: string): ProjectPreviewStatus {
    const session = this.sessions.get(projectId);
    if (!session) return { running: false };
    return {
      running: !session.process.killed && session.process.exitCode == null,
      url: session.url,
      localUrl: session.localUrl,
      port: session.port,
      command: session.command,
      cwd: session.cwd,
      startedAt: session.startedAt,
    };
  }

  async start(
    projectId: string,
    rootPath: string,
    options: { openBrowser?: boolean; publicHost?: string } = {}
  ): Promise<ProjectPreviewStartResult> {
    const existing = this.sessions.get(projectId);
    if (existing && existing.process.exitCode == null && !existing.process.killed) {
      const openedBrowser = options.openBrowser !== false ? await this.openInBrowser(existing.localUrl) : false;
      return {
        running: true,
        url: existing.url,
        localUrl: existing.localUrl,
        port: existing.port,
        command: existing.command,
        cwd: existing.cwd,
        startedAt: existing.startedAt,
        openedBrowser,
      };
    }

    if (existing) this.stop(projectId);

    let target = await detectDevTarget(rootPath);
    if (!target) {
      await scaffoldMinimalPreview(rootPath);
      target = await detectDevTarget(rootPath);
    }
    if (!target) {
      throw new Error(
        "No dev server found. Add a dev or start script in package.json, an index.html file, or use a framework app under apps/ or packages/."
      );
    }

    const port = await findFreePort(target.defaultPort);
    const localUrl = `http://127.0.0.1:${port}`;
    const url = buildPublicUrl(port, options.publicHost);
    const command = describeCommand(target, port);

    const child = spawnDevProcess(target, port);
    const session: PreviewSession = {
      projectId,
      cwd: target.cwd,
      port,
      localUrl,
      url,
      command,
      process: child,
      startedAt: Date.now(),
    };
    this.sessions.set(projectId, session);

    child.on("exit", (code) => {
      logger.info({ projectId, code }, "Preview dev server exited");
      if (this.sessions.get(projectId)?.process === child) {
        this.sessions.delete(projectId);
      }
    });

    try {
      await waitForServer(port, child, 120_000);
    } catch (err) {
      this.stop(projectId);
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Dev server did not become ready: ${message}`);
    }

    const openedBrowser =
      options.openBrowser !== false ? await this.openInBrowser(localUrl) : false;

    return {
      running: true,
      url,
      localUrl,
      port,
      command,
      cwd: target.cwd,
      startedAt: session.startedAt,
      openedBrowser,
    };
  }

  stop(projectId: string): boolean {
    const session = this.sessions.get(projectId);
    if (!session) return false;
    try {
      if (!session.process.killed) {
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(session.process.pid), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
          });
        } else {
          session.process.kill("SIGTERM");
        }
      }
    } catch (err) {
      logger.warn({ err, projectId }, "Failed to stop preview process");
    }
    this.sessions.delete(projectId);
    return true;
  }

  private async openInBrowser(url: string): Promise<boolean> {
    const platform = process.platform;
    try {
      if (platform === "win32") {
        spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true });
      } else if (platform === "darwin") {
        spawn("open", [url], { detached: true, stdio: "ignore" });
      } else {
        spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
      }
      return true;
    } catch (err) {
      logger.warn({ err, url }, "Could not open system browser");
      return false;
    }
  }
}

function buildPublicUrl(port: number, publicHost?: string): string {
  const host = (publicHost ?? process.env.CIDER_PREVIEW_PUBLIC_HOST ?? "").trim();
  if (!host) return `http://127.0.0.1:${port}`;
  if (host.startsWith("http://") || host.startsWith("https://")) {
    const u = new URL(host);
    if (u.port) return host;
    return `${u.protocol}//${u.hostname}:${port}`;
  }
  return `http://${host}:${port}`;
}

function describeCommand(target: DevTarget, port: number): string {
  if (target.staticOnly) return `npx serve -l ${port}`;
  if (target.runner === "next") return `next dev -p ${port}`;
  if (target.runner === "vite") return `vite --port ${port}`;
  return `${target.packageManager} run ${target.script} (PORT=${port})`;
}

async function detectDevTarget(rootPath: string): Promise<DevTarget | null> {
  const resolvedRoot = path.resolve(rootPath);

  const preferredDirs = [
    resolvedRoot,
    ...PREFERRED_REL_DIRS.map((d) => path.join(resolvedRoot, d)),
  ];
  const candidates: Array<{ dir: string; score: number; target: DevTarget }> = [];

  for (const dir of preferredDirs) {
    const target = await tryPackageJsonTarget(dir, dir === resolvedRoot);
    if (target) {
      candidates.push({ dir, score: scoreDevTarget(resolvedRoot, dir, target), target });
    }
  }

  const discovered = await discoverPackageJsonDirs(resolvedRoot, 5);
  for (const dir of discovered) {
    if (preferredDirs.includes(dir)) continue;
    const target = await tryPackageJsonTarget(dir, dir === resolvedRoot);
    if (target) {
      candidates.push({ dir, score: scoreDevTarget(resolvedRoot, dir, target), target });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].target;
  }

  const staticDir = await findStaticSiteRoot(resolvedRoot);
  if (staticDir) {
    const pm = await detectPackageManager(staticDir);
    return {
      cwd: staticDir,
      script: "",
      defaultPort: 4173,
      packageManager: pm,
      runner: "static",
      staticOnly: true,
    };
  }

  return null;
}

function scoreDevTarget(rootPath: string, dir: string, target: DevTarget): number {
  let score = 0;
  if (target.script === "dev") score += 25;
  else if (target.script === "start") score += 12;
  else score += 6;

  if (target.runner === "next" || target.runner === "vite") score += 20;
  if (dir !== rootPath) score += 5;

  const rel = path.relative(rootPath, dir).replace(/\\/g, "/");
  if (rel.startsWith("apps/")) score += 15;
  if (rel.startsWith("packages/")) score += 10;

  const depth = rel.split("/").filter(Boolean).length;
  if (depth >= 1 && depth <= 3) score += 4;
  if (depth > 4) score -= 10;

  return score;
}

async function discoverPackageJsonDirs(rootPath: string, maxDepth: number): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    const pkgPath = path.join(dir, "package.json");
    try {
      await fs.access(pkgPath);
      found.push(dir);
    } catch {
      /* no package.json here */
    }

    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (SKIP_DIRS.has(ent.name) || ent.name.startsWith(".")) continue;
      await walk(path.join(dir, ent.name), depth + 1);
    }
  }

  await walk(rootPath, 0);
  return found;
}

async function findStaticSiteRoot(rootPath: string): Promise<string | null> {
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootPath, depth: 0 }];

  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    if (depth > 6) continue;

    try {
      await fs.access(path.join(dir, "index.html"));
      return dir;
    } catch {
      /* continue */
    }

    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (SKIP_DIRS.has(ent.name) || ent.name.startsWith(".")) continue;
      queue.push({ dir: path.join(dir, ent.name), depth: depth + 1 });
    }
  }

  return null;
}

async function scaffoldMinimalPreview(rootPath: string): Promise<void> {
  const pkgPath = path.join(rootPath, "package.json");
  const indexPath = path.join(rootPath, "index.html");

  try {
    await fs.access(pkgPath);
    return;
  } catch {
    /* no package.json */
  }

  try {
    await fs.access(indexPath);
    return;
  } catch {
    /* no index.html */
  }

  const name = path.basename(rootPath).replace(/[^a-z0-9-]/gi, "-").toLowerCase() || "app";
  await fs.writeFile(
    indexPath,
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name}</title>
</head>
<body>
  <h1>${name}</h1>
  <p>Edit <code>index.html</code> or add a <code>dev</code> script to package.json.</p>
</body>
</html>
`,
    "utf-8"
  );

  await fs.writeFile(
    pkgPath,
    JSON.stringify(
      {
        name,
        private: true,
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview",
        },
      },
      null,
      2
    ),
    "utf-8"
  );

  logger.info({ rootPath }, "Scaffolded minimal Vite preview for empty project");
}

async function tryPackageJsonTarget(dir: string, isRoot: boolean): Promise<DevTarget | null> {
  const pkgPath = path.join(dir, "package.json");
  try {
    const raw = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};

    const script =
      (scripts.dev && "dev") ||
      (scripts.preview && "preview") ||
      (scripts.start && "start") ||
      (scripts.serve && "serve") ||
      null;
    if (!script) return null;

    const scriptText = scripts[script] ?? "";
    if (isRoot && META_DEV_PATTERN.test(scriptText)) {
      return null;
    }

    const runner = inferRunner(scriptText);
    const defaultPort = inferPortFromScript(scriptText, runner);
    const packageManager = await detectPackageManager(dir);
    return { cwd: dir, script, defaultPort, packageManager, runner };
  } catch {
    return null;
  }
}

function inferRunner(scriptText: string): RunnerKind {
  if (/next\s+dev|next dev/i.test(scriptText)) return "next";
  if (/vite/i.test(scriptText)) return "vite";
  return "default";
}

function inferPortFromScript(script: string, runner: RunnerKind): number {
  const portFlag = script.match(/(?:--port|-p)\s+(\d{2,5})/);
  if (portFlag) return Number(portFlag[1]);
  if (runner === "next") return 3000;
  if (runner === "vite") return 5173;
  if (/astro\s+dev/i.test(script)) return 4321;
  if (/nuxt/i.test(script)) return 3000;
  if (/gatsby/i.test(script)) return 8000;
  return 3000;
}

async function detectPackageManager(dir: string): Promise<PackageManager> {
  const checks: Array<[string, PackageManager]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ];
  for (const [file, pm] of checks) {
    try {
      await fs.access(path.join(dir, file));
      return pm;
    } catch {
      /* try next */
    }
  }
  try {
    await fs.access(path.join(dir, "pnpm-workspace.yaml"));
    return "pnpm";
  } catch {
    return "npm";
  }
}

function npxExecutable(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function spawnDevProcess(target: DevTarget, port: number): ChildProcess {
  const env = {
    ...process.env,
    PORT: String(port),
    BROWSER: "none",
    CI: "true",
  };

  const opts: Parameters<typeof spawn>[2] = {
    cwd: target.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    // Node 20.12.2+ on Windows requires shell for .cmd/.bat (CVE-2024-27980).
    ...(process.platform === "win32" ? { shell: true } : {}),
  };

  if (target.staticOnly || target.runner === "static") {
    return spawn(npxExecutable(), ["--yes", "serve", "-l", String(port), "."], opts);
  }

  if (target.runner === "next") {
    return spawn(npxExecutable(), ["--yes", "next", "dev", "-p", String(port)], opts);
  }

  if (target.runner === "vite") {
    return spawn(
      npxExecutable(),
      ["--yes", "vite", "--port", String(port), "--host", "127.0.0.1"],
      opts
    );
  }

  const pm = target.packageManager;
  const executable =
    process.platform === "win32"
      ? pm === "pnpm"
        ? "pnpm.cmd"
        : pm === "yarn"
          ? "yarn.cmd"
          : "npm.cmd"
      : pm;

  const args = pm === "yarn" ? [target.script] : ["run", target.script];
  return spawn(executable, args, opts);
}

async function findFreePort(preferred: number): Promise<number> {
  for (let port = preferred; port < preferred + 50; port++) {
    if (await isPortFree(port)) return port;
  }
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : preferred;
      server.close(() => resolve(port));
    });
  });
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function waitForServer(
  port: number,
  child: ChildProcess,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  let output = "";

  const onData = (chunk: Buffer) => {
    output += chunk.toString();
  };

  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  while (Date.now() - start < timeoutMs) {
    if (child.exitCode != null) {
      throw new Error(
        `Process exited with code ${child.exitCode}. ${output.slice(-800)}`.trim()
      );
    }
    if (await probeHttp(port)) return;
    await sleep(500);
  }

  throw new Error(`Timed out after ${timeoutMs / 1000}s waiting for port ${port}`);
}

function probeHttp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = net.connect({ host: "127.0.0.1", port }, () => {
      req.end();
      resolve(true);
    });
    req.setTimeout(400, () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const previewService = new PreviewService();
