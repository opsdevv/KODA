import { create } from "zustand";
import type { AiMode } from "@cider/shared";
import { clearWorkspace, saveWorkspace } from "@/lib/workspace-persist";

export interface EditorTab {
  path: string;
  content: string;
  language: string;
  isDirty: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface IdeState {
  projectId: string | null;
  projectPath: string | null;
  projectName: string | null;
  sidebarWidth: number;
  chatWidth: number;
  bottomPanelHeight: number;
  showTerminal: boolean;
  showChat: boolean;
  aiMode: AiMode;
  tabs: EditorTab[];
  activeTabPath: string | null;
  conversationId: string | null;
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
  pendingToolApproval: { id: string; name: string; args: Record<string, unknown> } | null;
  commandPaletteOpen: boolean;
  terminalOutput: string[];

  setProject: (id: string, path: string, name: string) => void;
  clearProject: () => void;
  setSidebarWidth: (w: number) => void;
  setChatWidth: (w: number) => void;
  setBottomPanelHeight: (h: number) => void;
  toggleTerminal: () => void;
  toggleChat: () => void;
  setAiMode: (mode: AiMode) => void;
  openTab: (tab: EditorTab) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string) => void;
  updateTabContent: (path: string, content: string) => void;
  markTabSaved: (path: string) => void;
  reloadTab: (path: string, content: string, language?: string) => void;
  setConversationId: (id: string | null) => void;
  startNewChat: () => void;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (msg: ChatMessage) => void;
  appendStream: (delta: string) => void;
  finishStream: () => void;
  setStreaming: (v: boolean) => void;
  setPendingToolApproval: (v: IdeState["pendingToolApproval"]) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  appendTerminal: (line: string) => void;
  clearTerminal: () => void;
}

export const useIdeStore = create<IdeState>((set, get) => ({
  projectId: null,
  projectPath: null,
  projectName: null,
  sidebarWidth: 260,
  chatWidth: 380,
  bottomPanelHeight: 220,
  showTerminal: true,
  showChat: true,
  aiMode: "agent",
  tabs: [],
  activeTabPath: null,
  conversationId: null,
  messages: [],
  streamingContent: "",
  isStreaming: false,
  pendingToolApproval: null,
  commandPaletteOpen: false,
  terminalOutput: [],

  setProject: (id, path, name) => {
    saveWorkspace({ projectId: id, projectPath: path, projectName: name });
    set({
      projectId: id,
      projectPath: path,
      projectName: name,
      tabs: [],
      activeTabPath: null,
      conversationId: null,
      messages: [],
      streamingContent: "",
      isStreaming: false,
      pendingToolApproval: null,
    });
  },
  clearProject: () => {
    clearWorkspace();
    set({ projectId: null, projectPath: null, projectName: null, tabs: [], activeTabPath: null });
  },
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setChatWidth: (w) => set({ chatWidth: w }),
  setBottomPanelHeight: (h) => set({ bottomPanelHeight: h }),
  toggleTerminal: () => set((s) => ({ showTerminal: !s.showTerminal })),
  toggleChat: () => set((s) => ({ showChat: !s.showChat })),
  setAiMode: (mode) => set({ aiMode: mode }),
  openTab: (tab) =>
    set((s) => {
      const exists = s.tabs.find((t) => t.path === tab.path);
      if (exists) return { activeTabPath: tab.path };
      return { tabs: [...s.tabs, tab], activeTabPath: tab.path };
    }),
  closeTab: (path) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.path !== path);
      const activeTabPath =
        s.activeTabPath === path ? tabs[tabs.length - 1]?.path ?? null : s.activeTabPath;
      return { tabs, activeTabPath };
    }),
  setActiveTab: (path) => set({ activeTabPath: path }),
  updateTabContent: (path, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, content, isDirty: true } : t)),
    })),
  markTabSaved: (path) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, isDirty: false } : t)),
    })),
  reloadTab: (path, content, language) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === path
          ? { ...t, content, language: language ?? t.language, isDirty: false }
          : t
      ),
    })),
  setConversationId: (id) => set({ conversationId: id }),
  startNewChat: () =>
    set({
      conversationId: null,
      messages: [],
      streamingContent: "",
      isStreaming: false,
      pendingToolApproval: null,
    }),
  setMessages: (messages) => set({ messages }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  appendStream: (delta) =>
    set((s) => ({ streamingContent: s.streamingContent + delta })),
  finishStream: () =>
    set((s) => {
      if (!s.streamingContent) return { isStreaming: false };
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: s.streamingContent,
      };
      return {
        messages: [...s.messages, msg],
        streamingContent: "",
        isStreaming: false,
      };
    }),
  setStreaming: (v) => set({ isStreaming: v, streamingContent: v ? "" : get().streamingContent }),
  setPendingToolApproval: (v) => set({ pendingToolApproval: v }),
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  appendTerminal: (line) => set((s) => ({ terminalOutput: [...s.terminalOutput, line] })),
  clearTerminal: () => set({ terminalOutput: [] }),
}));
