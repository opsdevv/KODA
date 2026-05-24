"use client";

import { useState } from "react";
import { Terminal } from "lucide-react";
import { useIdeStore } from "@/stores/ide-store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function TerminalPanel() {
  const { projectId, terminalOutput, appendTerminal, clearTerminal } = useIdeStore();
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!command.trim() || !projectId || running) return;
    setRunning(true);
    appendTerminal(`$ ${command}`);
    try {
      const result = await api.runCommand(projectId, command);
      if (result.stdout) appendTerminal(result.stdout);
      if (result.stderr) appendTerminal(result.stderr);
      appendTerminal(`[exit ${result.exitCode}]`);
    } catch (err) {
      appendTerminal(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
      setCommand("");
    }
  };

  return (
    <div className="flex h-full flex-col bg-cider-bg">
      <div className="flex items-center justify-between border-b border-cider-border px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs text-cider-muted">
          <Terminal className="h-3.5 w-3.5" />
          Terminal
        </div>
        <Button size="sm" variant="ghost" onClick={clearTerminal}>Clear</Button>
      </div>
      <pre className="flex-1 overflow-auto p-3 font-mono text-xs text-cider-text/90">
        {terminalOutput.join("\n") || "Ready."}
      </pre>
      <div className="flex gap-2 border-t border-cider-border p-2">
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="Enter command..."
          className="flex-1 rounded bg-cider-panel px-2 py-1 font-mono text-xs outline-none focus:ring-1 focus:ring-cider-accent"
          disabled={!projectId || running}
        />
        <Button size="sm" onClick={run} disabled={running || !projectId}>Run</Button>
      </div>
    </div>
  );
}
