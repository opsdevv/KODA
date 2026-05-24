import { spawn } from "node:child_process";
import { v4 as uuid } from "uuid";
import type { CommandExecutionResult, TerminalSession } from "@cider/shared";
import { isDangerousCommand } from "../lib/security.js";
import { logger } from "../lib/logger.js";

export class TerminalService {
  private sessions = new Map<string, TerminalSession>();

  createSession(projectId: string, cwd: string, cols = 80, rows = 24): TerminalSession {
    const session: TerminalSession = {
      id: uuid(),
      projectId,
      cwd,
      cols,
      rows,
      createdAt: Date.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(id: string): TerminalSession | undefined {
    return this.sessions.get(id);
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
