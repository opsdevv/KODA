"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { loadWorkspace, clearWorkspace } from "@/lib/workspace-persist";
import { useIdeStore } from "@/stores/ide-store";

/** Restores last workspace or opens the server default — no login or welcome screen. */
export function WorkspaceBootstrap({ children }: { children: React.ReactNode }) {
  const { projectId, setProject, clearProject } = useIdeStore();
  const [ready, setReady] = useState(false);
  const validatedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Skip if we've already validated this projectId
      if (validatedRef.current === projectId) {
        if (!ready) setReady(true);
        return;
      }

      // First, check if current projectId is valid
      if (projectId) {
        try {
          const project = await api.getProject(projectId);
          if (!cancelled) {
            validatedRef.current = projectId;
            setReady(true);
            return;
          }
        } catch {
          // Current projectId is invalid, clear it
          if (!cancelled) {
            validatedRef.current = null;
            clearProject();
          }
        }
      }

      // If no valid project, try to load from saved workspace
      try {
        const saved = loadWorkspace();
        if (saved?.projectId) {
          try {
            const project = await api.getProject(saved.projectId);
            if (!cancelled) {
              validatedRef.current = project.id;
              setProject(project.id, project.rootPath, project.name);
              api.indexProject(project.id).catch(() => {});
            }
            return;
          } catch {
            /* fall through to path or default */
          }
        }
        if (saved?.projectPath) {
          const project = await api.openProject(saved.projectPath);
          if (!cancelled) {
            validatedRef.current = project.id;
            setProject(project.id, project.rootPath, project.name);
            api.indexProject(project.id).catch(() => {});
          }
          return;
        }

        const project = await api.openDefaultProject();
        if (!cancelled) {
          validatedRef.current = project.id;
          setProject(project.id, project.rootPath, project.name);
          api.indexProject(project.id).catch(() => {});
        }
      } catch {
        /* IDE still usable; user can pick a folder from the header */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, setProject, clearProject, ready]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-koda-bg text-koda-muted">
        <p className="text-sm animate-pulse">Opening workspace…</p>
      </div>
    );
  }

  return <>{children}</>;
}
