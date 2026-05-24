"use client";

import dynamic from "next/dynamic";
import { useIdeStore } from "@/stores/ide-store";
import { api } from "@/lib/api";
import { useCallback } from "react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export function CodeEditor() {
  const { tabs, activeTabPath, projectId, updateTabContent, markTabSaved } = useIdeStore();
  const activeTab = tabs.find((t) => t.path === activeTabPath);

  const handleSave = useCallback(async () => {
    if (!activeTab || !projectId) return;
    await api.writeFile(projectId, activeTab.path, activeTab.content);
    markTabSaved(activeTab.path);
  }, [activeTab, projectId, markTabSaved]);

  if (!activeTab) {
    return (
      <div className="flex h-full items-center justify-center text-cider-muted">
        <div className="text-center">
          <p className="text-lg font-medium text-cider-text/60">Cider</p>
          <p className="mt-2 text-sm">Open a file from the explorer</p>
          <p className="mt-1 text-xs text-cider-muted">Ctrl+S to save · Ctrl+K command palette</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" onKeyDown={(e) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    }}>
      <MonacoEditor
        height="100%"
        language={activeTab.language}
        theme="vs-dark"
        value={activeTab.content}
        onChange={(v) => updateTabContent(activeTab.path, v ?? "")}
        options={{
          fontSize: 14,
          fontFamily: "var(--font-geist-mono), monospace",
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          padding: { top: 12 },
          smoothScrolling: true,
          cursorBlinking: "smooth",
          automaticLayout: true,
        }}
      />
    </div>
  );
}
