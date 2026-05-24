import type { WebSocket } from "@fastify/websocket";
import type { WsClientMessage, WsServerMessage, AgentLoopEvent } from "@cider/shared";
import { chatService } from "../services/chat.js";
import { logger } from "../lib/logger.js";
import { config } from "../config.js";

const pendingApprovals = new Map<string, { resolve: (v: boolean) => void }>();

export function handleWebSocket(socket: WebSocket) {
  let abortController: AbortController | null = null;
  let activeConversationId: string | null = null;
  let activeProjectId: string | null = null;

  const send = (msg: WsServerMessage) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  };

  socket.on("message", async (raw: Buffer | string) => {
    try {
      const msg = JSON.parse(raw.toString()) as WsClientMessage;

      switch (msg.type) {
        case "ping":
          send({ type: "pong" });
          break;

        case "chat:start": {
          abortController?.abort();
          abortController = new AbortController();
          activeConversationId = msg.conversationId;
          activeProjectId = msg.projectId;

          const projectId = msg.projectId;

          const emit = (event: AgentLoopEvent) => {
            if (event.type === "message_delta") {
              send({
                type: "chat:delta",
                conversationId: msg.conversationId,
                delta: (event.payload as { delta: string }).delta,
              });
            } else {
              send({ type: "agent:event", event });
            }
          };

          try {
            await chatService.runChat(
              projectId,
              msg.conversationId,
              msg.mode as "ask" | "plan" | "agent",
              msg.message,
              emit,
              abortController.signal,
              async (toolCallId, name, args) => {
                if (config.autoApproveTools) return true;
                return new Promise((resolve) => {
                  pendingApprovals.set(toolCallId, { resolve });
                  send({
                    type: "agent:event",
                    event: {
                      type: "tool_call",
                      payload: { id: toolCallId, name, arguments: args, awaiting_approval: true },
                    },
                  });
                  setTimeout(() => {
                    if (pendingApprovals.has(toolCallId)) {
                      pendingApprovals.delete(toolCallId);
                      resolve(true);
                    }
                  }, 120_000);
                });
              }
            );
            send({ type: "chat:done", conversationId: msg.conversationId, messageId: "" });
          } catch (err) {
            send({ type: "error", message: err instanceof Error ? err.message : String(err) });
          }
          break;
        }

        case "chat:cancel":
          abortController?.abort();
          break;

        case "agent:approve_tool": {
          const pending = pendingApprovals.get(msg.toolCallId);
          if (pending) {
            pending.resolve(true);
            pendingApprovals.delete(msg.toolCallId);
          }
          break;
        }

        case "agent:reject_tool": {
          const pending = pendingApprovals.get(msg.toolCallId);
          if (pending) {
            pending.resolve(false);
            pendingApprovals.delete(msg.toolCallId);
          }
          break;
        }

        default:
          logger.debug({ type: (msg as { type: string }).type }, "Unhandled WS message");
      }
    } catch (err) {
      logger.error({ err }, "WebSocket message error");
      send({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  });

  socket.on("close", () => {
    abortController?.abort();
  });
}
