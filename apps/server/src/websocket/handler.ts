import type { WebSocket } from "@fastify/websocket";
import type { WsClientMessage, WsServerMessage, AgentLoopEvent } from "@koda/shared";
import { chatService } from "../services/chat.js";
import { logger } from "../lib/logger.js";
import { config } from "../config.js";
import { terminalService } from "../services/terminal.js";

const pendingApprovals = new Map<string, { resolve: (v: boolean) => void }>();
const activeTerminalListeners = new Map<string, () => void>();

export function handleWebSocket(socket: WebSocket) {
  let abortController: AbortController | null = null;
  let activeConversationId: string | null = null;
  let activeProjectId: string | null = null;

  const send = (msg: WsServerMessage) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  };

  // Helper to listen to terminal output
  const listenToTerminal = (sessionId: string) => {
    if (activeTerminalListeners.has(sessionId)) return;
    const sessionData = terminalService.getSession(sessionId);
    if (sessionData?.ptyProcess) {
      const onData = (data: string) => {
        send({ type: "terminal:output", sessionId, data });
      };
      const onExit = (code: number) => {
        send({ type: "terminal:exit", sessionId, code });
        activeTerminalListeners.delete(sessionId);
      };
      sessionData.ptyProcess.on("data", onData);
      sessionData.ptyProcess.on("exit", onExit);
      activeTerminalListeners.set(sessionId, () => {
        sessionData.ptyProcess.off("data", onData);
        sessionData.ptyProcess.off("exit", onExit);
      });
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
                  }, 120000);
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
          send({ type: "chat:done", conversationId: activeConversationId ?? "", messageId: "" });
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

        case "terminal:input": {
          listenToTerminal(msg.sessionId);
          const sessionData = terminalService.getSession(msg.sessionId);
          if (sessionData?.ptyProcess) {
            sessionData.ptyProcess.write(msg.data);
          }
          break;
        }

        case "terminal:resize": {
          listenToTerminal(msg.sessionId);
          const sessionData = terminalService.getSession(msg.sessionId);
          if (sessionData?.ptyProcess) {
            sessionData.ptyProcess.resize(msg.cols, msg.rows);
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
    // Clean up terminal listeners
    for (const [, cleanup] of activeTerminalListeners) {
      cleanup();
    }
    activeTerminalListeners.clear();
  });
}
