export type AiMode = "ask" | "plan" | "agent";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: number;
  mode?: AiMode;
  toolCalls?: ToolCallRecord[];
  metadata?: Record<string, unknown>;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  status: "pending" | "running" | "completed" | "failed" | "awaiting_approval";
}

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
