"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { loadWorkspace } from "@/lib/workspace-persist";
import { useIdeStore } from "@/stores/ide-store";

/** Restores last workspace or opens the server default — no login or welcome screen. */
export function WorkspaceBootstrap({ children }: { children: React.ReactNode }) {
  const { projectId, setProject } = useIdeStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (projectId) {
      setReady(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const saved = loadWorkspace();
        if (saved?.projectId) {
          try {
            const project = await api.getProject(saved.projectId);
            if (!cancelled) {
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
            setProject(project.id, project.rootPath, project.name);
            api.indexProject(project.id).catch(() => {});
          }
          return;
        }

        const project = await api.openDefaultProject();
        if (!cancelled) {
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
  }, [projectId, setProject]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-cider-bg text-cider-muted">
        <p className="text-sm animate-pulse">Opening workspace…</p>
      </div>
    );
  }

  return <>{children}</>;
}
