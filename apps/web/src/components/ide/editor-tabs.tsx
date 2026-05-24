"use client";

import { X } from "lucide-react";
import { useIdeStore } from "@/stores/ide-store";
import { cn } from "@/lib/utils";

export function EditorTabs() {
  const { tabs, activeTabPath, setActiveTab, closeTab } = useIdeStore();

  if (!tabs.length) return null;

  return (
    <div className="flex h-9 items-center gap-0.5 overflow-x-auto border-b border-cider-border bg-cider-surface/50 px-1">
      {tabs.map((tab) => (
        <button
          key={tab.path}
          onClick={() => setActiveTab(tab.path)}
          className={cn(
            "group flex h-7 max-w-[180px] items-center gap-1.5 rounded px-2.5 text-xs transition-colors",
            activeTabPath === tab.path
              ? "bg-cider-panel text-cider-text"
              : "text-cider-muted hover:bg-white/5 hover:text-cider-text"
          )}
        >
          <span className="truncate">{tab.path.split(/[/\\]/).pop()}</span>
          {tab.isDirty && <span className="text-cider-accent">●</span>}
          <X
            className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.path);
            }}
          />
        </button>
      ))}
    </div>
  );
}
