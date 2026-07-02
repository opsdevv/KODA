"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FolderOpen,
  FolderPlus,
  Upload,
  ChevronDown,
  HardDrive,
  ExternalLink,
  Square,
  Loader2,
} from "lucide-react";
import type { ProjectInfo } from "@koda/shared";
import { api } from "@/lib/api";
import { getPreviewPublicHost } from "@/lib/api-base";
import { useIdeStore } from "@/stores/ide-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ProjectMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { projectId, setProject } = useIdeStore();
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects(),
    enabled: menuOpen,
  });

  const activateProject = async (project: { id: string; rootPath: string; name: string }) => {
    setProject(project.id, project.rootPath, project.name);
    await queryClient.invalidateQueries({ queryKey: ["tree"] });
    await queryClient.invalidateQueries({ queryKey: ["conversations", project.id] });
    api.indexProject(project.id).catch(() => {});
    setSuccess(`Opened ${project.name}`);
    setError("");
    setTimeout(() => setSuccess(""), 4000);
  };

  const launchPreview = async (project: ProjectInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewLoadingId(project.id);
    setError("");
    try {
      const result = await api.startProjectPreview(project.id, {
        openBrowser: true,
        publicHost: getPreviewPublicHost(),
      });
      const link = result.url ?? result.localUrl;
      if (link) {
        setPreviewUrls((prev) => ({ ...prev, [project.id]: link }));
        setSuccess(
          result.openedBrowser
            ? `Launched ${project.name} in your browser`
            : `Dev server running at ${link}`
        );
        setTimeout(() => setSuccess(""), 5000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const stopPreview = async (project: ProjectInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewLoadingId(project.id);
    try {
      await api.stopProjectPreview(project.id);
      setPreviewUrls((prev) => {
        const next = { ...prev };
        delete next[project.id];
        return next;
      });
      setSuccess(`Stopped preview for ${project.name}`);
      setTimeout(() => setSuccess(""), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const openFolderInPlace = async () => {
    setMenuOpen(false);
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const { path, error: pickerError } = await api.pickProjectFolder();
      if (pickerError) throw new Error(pickerError);
      if (!path) return;

      const project = await api.openProject(path);
      await activateProject(project);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMenuOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = "";
    if (!files?.length) return;

    const firstPath = files[0].webkitRelativePath || files[0].name;
    const folderName = firstPath.split(/[/\\]/)[0] || "project";

    setMenuOpen(false);
    setLoading(true);
    setError("");
    setSuccess("");
    setUploadProgress("Importing folder…");

    try {
      const project = await api.importProjectFolder(files, folderName, (ev) => {
        if (ev.phase === "uploading" && ev.percent != null) {
          setUploadProgress(`Importing ${ev.percent}%`);
        } else if (ev.phase === "processing") {
          setUploadProgress("Saving files…");
        }
      });
      await activateProject(project);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      const count = "filesImported" in project ? project.filesImported : undefined;
      if (count) setSuccess(`Imported ${count} files into ${project.name}`);
      setUploadProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMenuOpen(true);
      setUploadProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    if (!projectName.trim()) return;
    setLoading(true);
    setError("");
    try {
      const project = await api.createProject(projectName.trim());
      await activateProject(project);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setNewProjectOpen(false);
      setProjectName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleZipSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Please select a .zip file");
      setMenuOpen(true);
      return;
    }

    setMenuOpen(false);
    setLoading(true);
    setError("");
    setSuccess("");
    setUploadProgress("Uploading…");

    try {
      const project = await api.uploadProjectZip(file, (ev) => {
        if (ev.phase === "uploading" && ev.percent != null) {
          setUploadProgress(`Uploading ${ev.percent}%`);
        } else if (ev.phase === "processing") {
          setUploadProgress("Extracting files…");
        }
      });
      await activateProject(project);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setUploadProgress(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMenuOpen(true);
      setUploadProgress(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={handleZipSelect}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        multiple
        // @ts-expect-error webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        onChange={handleFolderSelect}
      />

      <div className="relative flex items-center gap-2">
        <div className="relative">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMenuOpen(!menuOpen)}
            disabled={loading}
          >
            Project
            <ChevronDown className={cn("h-3.5 w-3.5 transition", menuOpen && "rotate-180")} />
          </Button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 max-h-[min(70vh,480px)] w-[min(92vw,320px)] overflow-y-auto rounded-lg border border-koda-border bg-koda-panel py-1 shadow-xl">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
                  onClick={() => {
                    folderInputRef.current?.click();
                  }}
                >
                  <FolderOpen className="h-4 w-4 text-koda-accent" />
                  Open folder
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
                  onClick={openFolderInPlace}
                  disabled={loading}
                >
                  <HardDrive className="h-4 w-4" />
                  Link folder on disk
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setMenuOpen(false);
                  }}
                >
                  <Upload className="h-4 w-4 text-koda-accent" />
                  Upload ZIP project
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
                  onClick={() => {
                    setNewProjectOpen(true);
                    setMenuOpen(false);
                    setError("");
                  }}
                >
                  <FolderPlus className="h-4 w-4 text-koda-accent" />
                  New project
                </button>

                <div className="my-1 border-t border-koda-border" />
                <p className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-koda-muted">
                  Your projects
                </p>

                {projectsLoading && (
                  <p className="px-3 py-2 text-xs text-koda-muted">Loading projects…</p>
                )}

                {!projectsLoading && projects.length === 0 && (
                  <p className="px-3 py-2 text-xs text-koda-muted">No saved projects yet</p>
                )}

                {projects.map((project) => {
                  const isActive = project.id === projectId;
                  const isPreviewLoading = previewLoadingId === project.id;
                  const previewUrl = previewUrls[project.id];

                  return (
                    <div
                      key={project.id}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1.5 hover:bg-white/5",
                        isActive && "bg-white/5"
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate px-1 text-left text-sm"
                        title={project.name}
                        onClick={() => {
                          void activateProject(project);
                          setMenuOpen(false);
                        }}
                      >
                        {project.name}
                      </button>
                      {previewUrl ? (
                        <a
                          href={previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded p-1 text-koda-accent hover:bg-white/10"
                          title={`Open ${previewUrl}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      {previewUrl ? (
                        <button
                          type="button"
                          className="rounded p-1 text-koda-muted hover:bg-white/10 hover:text-koda-danger"
                          title="Stop preview server"
                          disabled={isPreviewLoading}
                          onClick={(e) => void stopPreview(project, e)}
                        >
                          <Square className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded p-1 text-koda-accent hover:bg-white/10"
                          title="Start dev server and open in browser"
                          disabled={isPreviewLoading}
                          onClick={(e) => void launchPreview(project, e)}
                        >
                          {isPreviewLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {uploadProgress && (
          <span className="text-xs text-koda-accent animate-pulse">{uploadProgress}</span>
        )}

        {loading && !uploadProgress && (
          <span className="text-xs text-koda-muted animate-pulse">Working…</span>
        )}

        {success && !loading && (
          <span className="max-w-[200px] truncate text-xs text-koda-accent" title={success}>
            {success}
          </span>
        )}

        {error && !newProjectOpen && (
          <span className="max-w-[240px] truncate text-xs text-koda-danger" title={error}>
            {error}
          </span>
        )}
      </div>

      {newProjectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl glass p-6 shadow-2xl">
            <h2 className="text-sm font-medium">Create new project</h2>
            <p className="mt-1 text-xs text-koda-muted">
              Creates a project in your local KODA workspace.
            </p>
            <input
              autoFocus
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createProject()}
              placeholder="my-app"
              className="mt-3 w-full rounded-lg border border-koda-border bg-koda-bg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-koda-accent"
            />

            {error && <p className="mt-2 text-xs text-koda-danger">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setNewProjectOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={createProject}
                disabled={loading || !projectName.trim()}
              >
                {loading ? "Working…" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
