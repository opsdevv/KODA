"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useIdeStore } from "@/stores/ide-store";

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, toggleTerminal, toggleChat, setAiMode } = useIdeStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === "Escape") setCommandPaletteOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const commands = [
    { label: "Toggle Terminal", action: () => { toggleTerminal(); setCommandPaletteOpen(false); } },
    { label: "Toggle AI Chat", action: () => { toggleChat(); setCommandPaletteOpen(false); } },
    { label: "Ask Mode", action: () => { setAiMode("ask"); setCommandPaletteOpen(false); } },
    { label: "Plan Mode", action: () => { setAiMode("plan"); setCommandPaletteOpen(false); } },
    { label: "Agent Mode", action: () => { setAiMode("agent"); setCommandPaletteOpen(false); } },
  ];

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60"
            onClick={() => setCommandPaletteOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 rounded-xl glass p-2 shadow-2xl"
          >
            <input
              autoFocus
              placeholder="Type a command..."
              className="w-full rounded-lg bg-transparent px-4 py-3 text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key >= "1" && e.key <= "5") {
                  const idx = Number(e.key) - 1;
                  commands[idx]?.action();
                }
              }}
            />
            <div className="mt-1 space-y-0.5">
              {commands.map((cmd, i) => (
                <button
                  key={cmd.label}
                  onClick={cmd.action}
                  className="flex w-full items-center justify-between rounded-lg px-4 py-2 text-sm hover:bg-white/5"
                >
                  <span>{cmd.label}</span>
                  <kbd className="text-xs text-cider-muted">{i + 1}</kbd>
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
