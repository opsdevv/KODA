"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, File, Folder, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { FileNode } from "@koda/shared";
import { api } from "@/lib/api";
import { useIdeStore } from "@/stores/ide-store";
import { cn } from "@/lib/utils";

function FileTreeNode({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const { projectId, openTab } = useIdeStore();
  const isDir = node.type === "directory";

  const handleClick = async () => {
    if (isDir) {
      setOpen(!open);
      return;
    }
    if (!projectId) return;
    const file = await api.readFile(projectId, node.path);
    openTab({
      path: node.path,
      content: file.content,
      language: file.language ?? "plaintext",
      isDirty: false,
    });
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className={cn(
          "flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm hover:bg-white/5",
          "text-cider-muted hover:text-cider-text"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isDir ? (
          open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <span className="w-3.5" />
        )}
        {isDir ? <Folder className="h-3.5 w-3.5 shrink-0 text-cider-accent/70" /> : <File className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{node.name}</span>
      </button>
      {isDir && open && node.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function FileExplorer() {
  const { projectId, projectName } = useIdeStore();
  const { data, refetch, isLoading, isFetching } = useQuery({
    queryKey: ["tree", projectId],
    queryFn: () => api.getTree(projectId!),
    enabled: !!projectId,
  });

  if (!projectId) {
    return <div className="p-4 text-sm text-cider-muted">No project open</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-cider-border px-3 py-2">
        <div className="min-w-0">
          <span className="text-xs font-medium uppercase tracking-wider text-cider-muted">Explorer</span>
          {projectName && (
            <p className="truncate text-[10px] text-cider-muted/80">{projectName}</p>
          )}
        </div>
        <button onClick={() => refetch()} className="rounded p-1 hover:bg-white/5" title="Refresh">
          <RefreshCw className={cn("h-3.5 w-3.5", (isLoading || isFetching) && "animate-spin")} />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-1">
        {isLoading && !data && (
          <p className="px-2 py-4 text-xs text-cider-muted">Loading files…</p>
        )}
        {data && <FileTreeNode node={data} />}
        {!isLoading && !data && (
          <p className="px-2 py-4 text-xs text-cider-muted">No files yet</p>
        )}
      </div>
    </div>
  );
}
