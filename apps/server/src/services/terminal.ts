import { spawn } from "node:child_process";
import { v4 as uuid } from "uuid";
import type { CommandExecutionResult, TerminalSession } from "@koda/shared";
import { isDangerousCommand } from "../lib/security.js";
import { logger } from "../lib/logger.js";

export class TerminalService {
  private sessions = new Map<string, { session: TerminalSession; ptyProcess: any }>();
  private ptyModule: any = null;

  constructor() {
    // Try to import node-pty
    import("node-pty")
      .then((module) => {
        this.ptyModule = module;
        logger.info("node-pty loaded successfully");
      })
      .catch((e) => {
        logger.warn({ err: e }, "node-pty not available, terminal features will be limited");
      });
  }

  createSession(projectId: string, cwd: string, cols = 80, rows = 24): TerminalSession & { id: string } {
    const id = uuid();
    const isWin = process.platform === "win32";
    const shell = isWin ? "powershell.exe" : process.env.SHELL || "/bin/bash";
    
    let ptyProcess: any;
    if (this.ptyModule) {
      ptyProcess = this.ptyModule.spawn(shell, [], {
        name: "xterm-color",
        cols,
        rows,
        cwd,
        env: process.env,
      });

      ptyProcess.on("error", (err: Error) => {
        logger.error({ err }, "PTY process error");
      });
    }

    const session: TerminalSession = {
      id,
      projectId,
      cwd,
      cols,
      rows,
      createdAt: Date.now(),
    };
    
    if (ptyProcess) {
      this.sessions.set(id, { session, ptyProcess });
    }
    
    return { ...session, id };
  }

  getSession(id: string): { session: TerminalSession; ptyProcess: any } | undefined {
    return this.sessions.get(id);
  }

  closeSession(id: string): void {
    const sessionData = this.sessions.get(id);
    if (sessionData) {
      try {
        sessionData.ptyProcess.kill();
      } catch (e) {
        logger.error({ err: e }, "Error killing PTY process");
      }
      this.sessions.delete(id);
    }
  }

  async runCommand(cwd: string, command: string, requireApproval = true): Promise<CommandExecutionResult> {
    if (isDangerousCommand(command)) {
      throw new Error("Command blocked for safety");
    }

    const start = Date.now();
    const isWin = process.platform === "win32";
    const shell = isWin ? "powershell.exe" : "/bin/bash";
    const shellArgs = isWin ? ["-NoProfile", "-Command", command] : ["-c", command];

    return new Promise((resolve, reject) => {
      const proc = spawn(shell, shellArgs, { cwd, env: process.env });
      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.stderr.on("data", (d) => { stderr += d.toString(); });

      proc.on("error", (err) => {
        logger.error({ err, command }, "Command spawn failed");
        reject(err);
      });

      proc.on("close", (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 1,
          durationMs: Date.now() - start,
        });
      });
    });
  }
}

export const terminalService = new TerminalService();
