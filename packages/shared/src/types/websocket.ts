export type WsClientMessage =
  | { type: "chat:start"; conversationId: string; projectId: string; mode: string; message: string }
  | { type: "chat:cancel"; conversationId: string }
  | { type: "agent:approve_plan"; taskId: string }
  | { type: "agent:approve_tool"; taskId: string; toolCallId: string }
  | { type: "agent:reject_tool"; taskId: string; toolCallId: string }
  | { type: "terminal:input"; sessionId: string; data: string }
  | { type: "terminal:resize"; sessionId: string; cols: number; rows: number }
  | { type: "ping" };

export type WsServerMessage =
  | { type: "chat:delta"; conversationId: string; delta: string }
  | { type: "chat:done"; conversationId: string; messageId: string }
  | { type: "chat:tool_call"; conversationId: string; toolCall: unknown }
  | { type: "agent:event"; event: unknown }
  | { type: "terminal:output"; sessionId: string; data: string }
  | { type: "terminal:exit"; sessionId: string; code: number }
  | { type: "index:progress"; projectId: string; percent: number }
  | { type: "error"; message: string }
  | { type: "pong" };
