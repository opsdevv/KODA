"use client";

import { PanelRightOpen } from "lucide-react";
import { useIdeStore } from "@/stores/ide-store";
import { FileExplorer } from "./file-explorer";
import { CodeEditor } from "./code-editor";
import { EditorTabs } from "./editor-tabs";
import { AiChatPanel } from "./ai-chat-panel";
import { TerminalPanel } from "./terminal-panel";
import { CommandPalette } from "./command-palette";
import { ProjectMenu } from "./project-menu";
import { ServerStatus } from "./server-status";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function IdeLayout() {
  const {
    sidebarWidth,
    chatWidth,
    bottomPanelHeight,
    showTerminal,
    showChat,
    projectName,
    toggleChat,
  } = useIdeStore();

  return (
    <div className="flex h-screen flex-col bg-cider-bg">
      <header className="flex h-10 items-center justify-between border-b border-cider-border px-4 glass">
        <div className="flex items-center gap-2">
          <svg
            width="18"
            height="18"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="shrink-0"
          >
            <circle cx="16" cy="16" r="14" stroke="#7c6cff" strokeWidth="1.5" fill="none" />
            <path
              d="M12 16c0-3 1-6 4-8s4 3 4 5c0 3-1 6-4 8s-4-3-4-5z"
              fill="#7c6cff"
              opacity="0.85"
            />
            <path
              d="M14 12c0 0 3-2 5-1"
              stroke="#7c6cff"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          <span className="text-sm font-semibold tracking-tight">
            <span className="text-cider-accent">Cider</span>
            {projectName && <span className="text-cider-muted"> / {projectName}</span>}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <ServerStatus />
          <ProjectMenu />
          <span className="text-xs text-cider-muted">Ctrl+K · Ctrl+S</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside
          style={{ width: sidebarWidth }}
          className="shrink-0 border-r border-cider-border bg-cider-surface/30"
        >
          <FileExplorer />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <EditorTabs />
          <div
            className="flex-1 overflow-hidden"
            style={{ height: showTerminal ? `calc(100% - ${bottomPanelHeight}px)` : "100%" }}
          >
            <CodeEditor />
          </div>
          {showTerminal && (
            <div
              style={{ height: bottomPanelHeight }}
              className="shrink-0 border-t border-cider-border"
            >
              <TerminalPanel />
            </div>
          )}
        </main>

        {showChat ? (
          <aside
            style={{ width: chatWidth }}
            className={cn("shrink-0 border-l border-cider-border")}
          >
            <AiChatPanel />
          </aside>
        ) : (
          <aside className="flex w-9 shrink-0 flex-col items-center border-l border-cider-border bg-cider-surface/30 py-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title="Open AI chat"
              onClick={toggleChat}
            >
              <PanelRightOpen className="h-4 w-4" />
            </Button>
          </aside>
        )}
      </div>

      <CommandPalette />
    </div>
  );
}
