"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Send,
  Square,
  Sparkles,
  Plus,
  MessageSquare,
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
  PanelRightClose,
} from "lucide-react";
import type { AiMode, FileChange } from "@koda/shared";
import { useIdeStore } from "@/stores/ide-store";
import { api } from "@/lib/api";
import { kodaWs } from "@/lib/websocket";
import { Button } from "@/components/ui/button";
import { ChatMarkdown } from "@/components/ide/chat-markdown";
import { cn } from "@/lib/utils";

const MODES: { id: AiMode; label: string; desc: string }[] = [
  { id: "ask", label: "Ask", desc: "Q&A" },
  { id: "plan", label: "Plan", desc: "Plan first" },
  { id: "agent", label: "Agent", desc: "Autonomous" },
];

function chatListMeta(title: string, updatedAt: number) {
  const label = title.trim() || "New chat";
  const time = new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return { label, time };
}

export function AiChatPanel() {
  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings(),
  });
  const autoApprove = settings?.autoApproveTools ?? true;

  const {
    projectId,
    aiMode,
    setAiMode,
    messages,
    streamingContent,
    isStreaming,
    conversationId,
    setConversationId,
    startNewChat,
    setMessages,
    addMessage,
    setStreaming,
    pendingToolApproval,
    setPendingToolApproval,
    toggleChat,
    agentActivity,
    setAgentActivity,
  } = useIdeStore();

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations", projectId],
    queryFn: () => api.listConversations(projectId!),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (!projectId) return;

    void kodaWs?.connect();
    const unsub = kodaWs?.subscribe((msg) => {
      const store = useIdeStore.getState();
      if (msg.type === "chat:delta") store.appendStream(msg.delta);
      if (msg.type === "chat:done") {
        store.finishStream();
        void queryClient.invalidateQueries({ queryKey: ["conversations", projectId] });
      }
      if (msg.type === "agent:event") {
        const event = msg.event as any;
        switch (event.type) {
          case "thinking":
            store.setAgentActivity(`Thinking... (Iteration ${event.payload.iteration})`);
            break;
          case "tool_call":
            if (event.payload.awaiting_approval) {
              store.setPendingToolApproval({
                id: event.payload.id,
                name: event.payload.name,
                args: event.payload.arguments,
              });
            } else {
              store.setAgentActivity(`Executing tool: ${event.payload.name}...`);
            }
            break;
          case "tool_result":
            store.setAgentActivity("Processing tool result...");
            break;
          case "file_changes":
            store.setAgentActivity("Updating files...");
            const changes = (event.payload as any)?.changes ?? [];
            void queryClient.invalidateQueries({ queryKey: ["tree", projectId] });
            void (async () => {
              for (const change of changes) {
                if (change.action === "delete") continue;
                const open = store.tabs.find((t) => t.path === change.path);
                if (!open) continue;
                try {
                  const file = await api.readFile(projectId, change.path);
                  store.reloadTab(change.path, file.content, file.language);
                } catch {
                  /* file may have been removed */
                }
              }
            })();
            break;
          case "checkpoint":
            store.setAgentActivity(event.payload.label);
            break;
          case "status":
            if (event.payload.status === "completed") {
              store.setAgentActivity("");
            }
            break;
        }
      }
      if (msg.type === "error") {
        store.addMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Error: ${msg.message}`,
        });
        store.setStreaming(false);
        store.setAgentActivity("");
      }
    });

    return () => {
      unsub?.();
    };
  }, [projectId, queryClient]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingContent]);

  const ensureConversation = async () => {
    if (conversationId) return conversationId;
    if (!projectId) throw new Error("No project");
    const conv = await api.createConversation(projectId, "New chat", aiMode);
    setConversationId(conv.id);
    void queryClient.invalidateQueries({ queryKey: ["conversations", projectId] });
    return conv.id;
  };

  const sendMessage = async () => {
    if (!input.trim() || !projectId || isStreaming) return;
    const text = input.trim();
    setInput("");
    addMessage({ id: crypto.randomUUID(), role: "user", content: text });
    setStreaming(true);
    setAgentActivity("Starting...");

    const convId = await ensureConversation();
    kodaWs?.send({
      type: "chat:start",
      conversationId: convId,
      projectId,
      mode: aiMode,
      message: text,
    });
  };

  const loadConversation = async (id: string, mode?: string) => {
    if (isStreaming) return;
    const rows = await api.getMessages(id);
    const chatMessages = rows
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    setConversationId(id);
    setMessages(chatMessages);
    if (mode === "ask" || mode === "plan" || mode === "agent") setAiMode(mode);
    setShowHistory(false);
  };

  const handleNewChat = () => {
    if (isStreaming) return;
    startNewChat();
    setShowHistory(false);
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.deleteConversation(id);
    if (conversationId === id) startNewChat();
    void queryClient.invalidateQueries({ queryKey: ["conversations", projectId] });
  };

  const approveTool = (approved: boolean) => {
    if (!pendingToolApproval || !conversationId) return;
    kodaWs?.send({
      type: approved ? "agent:approve_tool" : "agent:reject_tool",
      taskId: "",
      toolCallId: pendingToolApproval.id,
      conversationId,
    } as never);
    setPendingToolApproval(null);
  };

  const activeTitle =
    conversations.find((c) => c.id === conversationId)?.title ?? (conversationId ? "Chat" : "New chat");

  return (
    <div className="flex h-full flex-col glass">
      <div className="flex shrink-0 items-center gap-1 border-b border-koda-border px-2 py-2">
        <Sparkles className="h-4 w-4 shrink-0 text-koda-accent" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{activeTitle}</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="New chat"
          onClick={handleNewChat}
          disabled={isStreaming}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title={showHistory ? "Hide chats" : "Chat history"}
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? <ChevronUp className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="Close panel"
          onClick={() => toggleChat()}
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden border-b border-koda-border"
          >
            <div className="max-h-40 overflow-y-auto p-2">
              {conversations.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-koda-muted">No previous chats</p>
              ) : (
                <ul className="space-y-0.5">
                  {conversations.map((conv) => {
                    const { label, time } = chatListMeta(conv.title, conv.updatedAt);
                    return (
                      <li key={conv.id}>
                        <button
                          type="button"
                          onClick={() => void loadConversation(conv.id, conv.mode)}
                          className={cn(
                            "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                            conversationId === conv.id
                              ? "bg-koda-accent/15 text-koda-accent"
                              : "text-koda-muted hover:bg-white/5 hover:text-[#e8e8ed]"
                          )}
                        >
                          <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                          <span className="min-w-0 flex-1 truncate">{label}</span>
                          {time && <span className="shrink-0 text-[10px] opacity-50">{time}</span>}
                          <span
                            role="button"
                            tabIndex={0}
                            title="Delete chat"
                            onClick={(e) => void handleDeleteConversation(conv.id, e)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleDeleteConversation(conv.id, e as unknown as React.MouseEvent);
                            }}
                            className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-koda-danger/20 hover:text-koda-danger group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex shrink-0 gap-1 border-b border-koda-border p-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setAiMode(m.id)}
            disabled={isStreaming}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs transition-all",
              aiMode === m.id
                ? "bg-koda-accent/20 text-koda-accent ring-1 ring-koda-accent/40"
                : "text-koda-muted hover:bg-white/5"
            )}
          >
            <div className="font-medium">{m.label}</div>
            <div className="text-[10px] opacity-70">{m.desc}</div>
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
            <Bot className="h-8 w-8 text-koda-accent/40" />
            <p className="text-sm text-koda-muted">
              {projectId
                ? "Use Agent mode to edit files in your project"
                : "Open a project from the Project menu first"}
            </p>
            <Button size="sm" variant="outline" onClick={handleNewChat} className="mt-2">
              <Plus className="mr-1 h-3.5 w-3.5" />
              Start a new chat
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex gap-2",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              {msg.role === "assistant" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-koda-accent/20">
                  <Bot className="h-4 w-4 text-koda-accent" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[88%] rounded-xl px-3 py-2.5",
                  msg.role === "user"
                    ? "bg-koda-accent/20 text-[#f0f0f5]"
                    : "bg-koda-panel ring-1 ring-white/5"
                )}
              >
                {msg.role === "user" ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                ) : (
                  <ChatMarkdown content={msg.content} />
                )}
              </div>
            </motion.div>
          ))}

          {isStreaming && (
            <div className="flex gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-koda-accent/20">
                <Bot className="h-4 w-4 text-koda-accent" />
              </div>
              <div className="max-w-[88%] rounded-xl bg-koda-panel px-3 py-2.5 ring-1 ring-white/5 streaming-cursor">
                {streamingContent ? (
                  <ChatMarkdown content={streamingContent} />
                ) : (
                  <span className="text-sm text-koda-accent">{agentActivity || "Thinking..."}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {pendingToolApproval && !autoApprove && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 border-t border-koda-warning/30 bg-koda-warning/10 p-3"
          >
            <p className="text-xs font-medium text-koda-warning">
              Approve: {pendingToolApproval.name}
            </p>
            <pre className="mt-1 max-h-20 overflow-auto text-[10px] text-koda-muted">
              {JSON.stringify(pendingToolApproval.args, null, 2)}
            </pre>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => approveTool(true)}>
                Approve
              </Button>
              <Button size="sm" variant="danger" onClick={() => approveTool(false)}>
                Reject
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {conversationId && messages.length > 0 && !isStreaming && (
        <div className="shrink-0 border-t border-koda-border/50 px-3 py-1.5">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center justify-center gap-1 rounded-md py-1 text-[11px] text-koda-muted transition-colors hover:bg-white/5 hover:text-[#e8e8ed]"
          >
            <X className="h-3 w-3" />
            Close this chat and start fresh
          </button>
        </div>
      )}

      <div className="shrink-0 border-t border-koda-border p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendMessage();
              }
            }}
            placeholder={`Message in ${aiMode} mode…`}
            rows={2}
            disabled={!projectId}
            className="flex-1 resize-none rounded-lg border border-koda-border bg-koda-bg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-koda-accent disabled:opacity-50"
          />
          {isStreaming ? (
            <Button
              size="icon"
              variant="outline"
              onClick={() =>
                conversationId &&
                kodaWs?.send({ type: "chat:cancel", conversationId })
              }
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" onClick={() => void sendMessage()} disabled={!input.trim() || !projectId}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
