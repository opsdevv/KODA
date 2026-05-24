import type { AiMode } from "./ai.js";

export interface AgentTask {
  id: string;
  projectId: string;
  conversationId: string;
  mode: AiMode;
  goal: string;
  status: AgentTaskStatus;
  plan?: PlanStep[];
  checkpoints: TaskCheckpoint[];
  createdAt: number;
  updatedAt: number;
}

export type AgentTaskStatus =
  | "pending"
  | "planning"
  | "awaiting_approval"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "skipped" | "failed";
  order: number;
}

export interface TaskCheckpoint {
  id: string;
  label: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresApproval?: boolean;
}

export interface FileChange {
  path: string;
  action: "write" | "edit" | "delete" | "rename";
  description?: string;
}

export interface AgentLoopEvent {
  type:
    | "thinking"
    | "plan"
    | "tool_call"
    | "tool_result"
    | "file_changes"
    | "message_delta"
    | "message_done"
    | "error"
    | "checkpoint"
    | "status";
  taskId: string;
  payload: unknown;
}
