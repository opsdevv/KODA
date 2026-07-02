import type {
  ProjectInfo,
  FileNode,
  FileReadResult,
  GitStatus,
  ProjectPreviewStartResult,
  ProjectPreviewStatus,
} from "@koda/shared";
import { getApiBase } from "./api-base";

const API = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const hasBody = init?.body !== undefined && init?.body !== null;
  const needsJsonBody = ["POST", "PUT", "PATCH"].includes(method) && !hasBody;

  const headers = new Headers(init?.headers);
  if (needsJsonBody || hasBody) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  const res = await fetch(`${API}${path}`, {
    ...init,
    method,
    headers,
    body: hasBody ? init!.body : needsJsonBody ? "{}" : undefined,
  });

  if (!res.ok) {
    let err = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      err = body.error ?? err;
    } catch {
      err = (await res.text()) || err;
    }
    throw new Error(err);
  }
  return res.json() as Promise<T>;
}

export interface UploadProgressEvent {
  phase: "uploading" | "processing" | "done";
  percent?: number;
  loaded?: number;
  total?: number;
}

export const api = {
  health: () => request<{ status: string; deepseek: boolean }>("/health"),

  listProjects: () => request<ProjectInfo[]>("/projects"),

  openProject: (path: string) =>
    request<ProjectInfo>("/projects/open", { method: "POST", body: JSON.stringify({ path }) }),

  /** Native OS folder picker (local server only). Uses direct backend URL to avoid proxy timeouts. */
  pickProjectFolder: async (): Promise<{ path: string | null; error?: string }> => {
    const res = await fetch(`${getApiBase()}/projects/pick-folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      let err = res.statusText;
      try {
        const body = (await res.json()) as { error?: string };
        err = body.error ?? err;
      } catch {
        err = (await res.text()) || err;
      }
      throw new Error(err);
    }
    return res.json() as Promise<{ path: string | null; error?: string }>;
  },

  importProjectFolder: (
    files: FileList,
    folderName: string,
    onProgress?: (event: UploadProgressEvent) => void
  ): Promise<ProjectInfo & { filesImported?: number }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append("name", folderName);

      const SKIP = new Set([
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

      let appended = 0;
      for (const file of Array.from(files)) {
        const rel = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
        const segments = rel.split("/").filter(Boolean);
        if (segments.some((seg) => SKIP.has(seg) || seg.startsWith("."))) continue;
        form.append("files", file, rel);
        appended++;
      }

      if (appended === 0) {
        reject(new Error("No project files to import"));
        return;
      }

      xhr.upload.addEventListener("progress", (e) => {
        if (!e.lengthComputable) return;
        onProgress?.({
          phase: "uploading",
          percent: Math.round((e.loaded / e.total) * 100),
          loaded: e.loaded,
          total: e.total,
        });
      });

      xhr.addEventListener("loadstart", () => {
        onProgress?.({ phase: "processing" });
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            onProgress?.({ phase: "done", percent: 100 });
            resolve(JSON.parse(xhr.responseText) as ProjectInfo & { filesImported?: number });
          } catch {
            reject(new Error("Invalid server response"));
          }
        } else {
          let message = xhr.statusText;
          try {
            const body = JSON.parse(xhr.responseText) as { error?: string };
            message = body.error ?? message;
          } catch {
            message = xhr.responseText || message;
          }
          reject(new Error(message));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Import failed")));
      xhr.addEventListener("abort", () => reject(new Error("Import cancelled")));

      xhr.open("POST", `${getApiBase()}/projects/import-folder`);
      xhr.send(form);
    });
  },

  openDefaultProject: () =>
    request<ProjectInfo>("/projects/open-default", { method: "POST" }),

  createProject: (name: string) =>
    request<ProjectInfo>("/projects/new", { method: "POST", body: JSON.stringify({ name }) }),

  uploadProjectZip: (
    file: File,
    onProgress?: (event: UploadProgressEvent) => void
  ): Promise<ProjectInfo> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append("file", file);

      xhr.upload.addEventListener("progress", (e) => {
        if (!e.lengthComputable) return;
        onProgress?.({
          phase: "uploading",
          percent: Math.round((e.loaded / e.total) * 100),
          loaded: e.loaded,
          total: e.total,
        });
      });

      xhr.addEventListener("loadstart", () => {
        onProgress?.({ phase: "processing" });
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            onProgress?.({ phase: "done", percent: 100 });
            resolve(JSON.parse(xhr.responseText) as ProjectInfo);
          } catch {
            reject(new Error("Invalid server response"));
          }
        } else {
          let message = xhr.statusText;
          try {
            const body = JSON.parse(xhr.responseText) as { error?: string };
            message = body.error ?? message;
          } catch {
            message = xhr.responseText || message;
          }
          reject(new Error(message));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Upload failed")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

      xhr.open("POST", `${getApiBase()}/projects/upload`);
      xhr.send(form);
    });
  },

  getProject: (id: string) => request<ProjectInfo>(`/projects/${id}`),

  getTree: (id: string) => request<FileNode>(`/projects/${id}/tree`),

  readFile: (id: string, path: string) =>
    request<FileReadResult>(`/projects/${id}/file?path=${encodeURIComponent(path)}`),

  writeFile: (id: string, path: string, content: string) =>
    request<{ ok: boolean }>(`/projects/${id}/file`, {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    }),

  searchFiles: (id: string, q: string) =>
    request<Array<{ path: string; line: number; preview: string }>>(
      `/projects/${id}/search?q=${encodeURIComponent(q)}`
    ),

  indexProject: (id: string) =>
    request<{ indexed: number }>(`/projects/${id}/index`, { method: "POST" }),

  listConversations: (projectId: string) =>
    request<Array<{ id: string; title: string; mode: string; updatedAt: number; createdAt: number }>>(
      `/projects/${projectId}/conversations`
    ),

  createConversation: (projectId: string, title?: string, mode?: string) =>
    request<{ id: string }>(`/projects/${projectId}/conversations`, {
      method: "POST",
      body: JSON.stringify({ title, mode }),
    }),

  getMessages: (conversationId: string) =>
    request<Array<{ id: string; role: string; content: string; createdAt: number }>>(
      `/conversations/${conversationId}/messages`
    ),

  deleteConversation: async (conversationId: string) => {
    const res = await fetch(`${API}/conversations/${conversationId}`, { method: "DELETE" });
    if (!res.ok) {
      let err = res.statusText;
      try {
        const body = (await res.json()) as { error?: string };
        err = body.error ?? err;
      } catch {
        err = (await res.text()) || err;
      }
      throw new Error(err);
    }
  },

  gitStatus: (id: string) => request<GitStatus>(`/projects/${id}/git/status`),

  gitCommit: (id: string, message: string) =>
    request<{ ok: boolean }>(`/projects/${id}/git/commit`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  createTerminalSession: (id: string, cols?: number, rows?: number) =>
    request<{ id: string; projectId: string; cwd: string; cols: number; rows: number; createdAt: number }>(
      `/projects/${id}/terminal/create`,
      {
        method: "POST",
        body: JSON.stringify({ cols, rows }),
      }
    ),

  runCommand: (id: string, command: string) =>
    request<{ stdout: string; stderr: string; exitCode: number }>(`/projects/${id}/terminal/run`, {
      method: "POST",
      body: JSON.stringify({ command }),
    }),

  getProjectPreview: (id: string) =>
    request<ProjectPreviewStatus>(`/projects/${id}/preview`),

  startProjectPreview: (
    id: string,
    options?: { openBrowser?: boolean; publicHost?: string }
  ) =>
    request<ProjectPreviewStartResult>(`/projects/${id}/preview`, {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    }),

  stopProjectPreview: async (id: string) => {
    const res = await fetch(`${API}/projects/${id}/preview`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      let err = res.statusText;
      try {
        const body = (await res.json()) as { error?: string };
        err = body.error ?? err;
      } catch {
        err = (await res.text()) || err;
      }
      throw new Error(err);
    }
  },

  setApiKey: (apiKey: string) =>
    request<{ ok: boolean }>("/settings/api-key", {
      method: "POST",
      body: JSON.stringify({ apiKey }),
    }),

  settings: () =>
    request<{
      deepseekConfigured: boolean;
      defaultProject: string;
      autoApproveTools: boolean;
      authRequired: boolean;
    }>("/settings"),
};
