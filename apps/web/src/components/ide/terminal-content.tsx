"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as TerminalIcon } from "lucide-react";
import { useIdeStore } from "@/stores/ide-store";
import { api } from "@/lib/api";
import { kodaWs } from "@/lib/websocket";
import { Button } from "@/components/ui/button";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";

export function TerminalContent() {
  const { projectId } = useIdeStore();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const wsUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: "#1a1a2e",
        foreground: "#eaeaea",
      },
      cols: 80,
      rows: 24,
    });

    term.open(terminalRef.current);

    xtermRef.current = term;

    return () => {
      term.dispose();
    };
  }, []);

  useEffect(() => {
    if (!projectId || !xtermRef.current || !kodaWs) return;

    const initSession = async () => {
      try {
        if (sessionId) {
          setSessionId(null);
        }

        const session = await api.createTerminalSession(
          projectId,
          xtermRef.current.cols || 80,
          xtermRef.current.rows || 24
        );
        setSessionId(session.id);

        xtermRef.current.clear();

        xtermRef.current.onData((data: string) => {
          kodaWs.send({
            type: "terminal:input",
            sessionId: session.id,
            data,
          });
        });

        xtermRef.current.onResize(({ cols, rows }: { cols: number; rows: number }) => {
          kodaWs.send({
            type: "terminal:resize",
            sessionId: session.id,
            cols,
            rows,
          });
        });

        wsUnsubscribeRef.current = kodaWs.subscribe((msg: any) => {
          if (msg.type === "terminal:output" && msg.sessionId === session.id) {
            xtermRef.current?.write(msg.data);
          } else if (msg.type === "terminal:exit" && msg.sessionId === session.id) {
            xtermRef.current?.write("\r\n[Process exited]\r\n");
          }
        });
      } catch (err) {
        xtermRef.current?.write(`Error initializing terminal: ${err instanceof Error ? err.message : String(err)}\r\n`);
      }
    };

    initSession();

    return () => {
      if (wsUnsubscribeRef.current) {
        wsUnsubscribeRef.current();
        wsUnsubscribeRef.current = null;
      }
    };
  }, [projectId]);

  useEffect(() => {
    if (kodaWs) {
      kodaWs.connect();
    }
  }, []);

  return (
    <div className="flex h-full flex-col bg-koda-bg">
      <div className="flex items-center justify-between border-b border-koda-border px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs text-koda-muted">
          <TerminalIcon className="h-3.5 w-3.5" />
          Terminal
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (xtermRef.current) {
              xtermRef.current.clear();
            }
          }}
        >
          Clear
        </Button>
      </div>
      <div 
        ref={terminalRef} 
        className="flex-1 overflow-hidden" 
        style={{ minHeight: "300px", minWidth: "600px" }} 
      />
    </div>
  );
}
