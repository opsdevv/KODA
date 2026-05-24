export interface TerminalSession {
  id: string;
  projectId: string;
  cwd: string;
  cols: number;
  rows: number;
  createdAt: number;
}

export interface CommandExecutionRequest {
  command: string;
  cwd?: string;
  requireApproval?: boolean;
}

export interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\s+\//,
  /\bformat\s+[a-z]:/i,
  /\bdel\s+\/s\s+\/q/i,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\b:(){ :|:& };:/,
  />\s*\/dev\/sd/,
  /\bshutdown\b/i,
  /\breboot\b/i,
];
