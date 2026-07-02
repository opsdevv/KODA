# KODA Architecture

## Overview

KODA is a **local-first AI coding IDE** inspired by Cursor. It runs entirely on the user's machine:

| Layer | Technology | Port |
|-------|------------|------|
| Frontend | Next.js 15, React 19, Monaco, Zustand | 3000 |
| Backend | Fastify, WebSockets, SQLite | 3847 |
| AI | DeepSeek API (OpenAI-compatible) | external |
| Desktop | Electron (optional wrapper) | — |

```
┌─────────────────────────────────────────────────────────────┐
│  Browser / Electron (localhost:3000)                        │
│  ┌──────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │ Explorer │ │ Monaco Edit │ │ AI Chat (Ask/Plan/Agent)│ │
│  └──────────┘ └─────────────┘ └─────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Terminal Panel                                          ││
│  └─────────────────────────────────────────────────────────┘│
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP /api/* (rewrite) + WS :3847
┌───────────────────────────▼─────────────────────────────────┐
│  @koda/server (Fastify)                                    │
│  ┌────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ Filesystem │ │ Agent Loop   │ │ Context Index (local) │ │
│  │ Sandbox    │ │ ReAct+Tools  │ │ Bag-of-words embed    │ │
│  └────────────┘ └──────────────┘ └──────────────────────┘ │
│  ┌────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ Git        │ │ Terminal     │ │ SQLite + Drizzle       │ │
│  │ simple-git │ │ spawn/shell  │ │ Memory, conversations  │ │
│  └────────────┘ └──────────────┘ └──────────────────────┘ │
└───────────────────────────┬─────────────────────────────────┘
                            │
              ┌─────────────▼─────────────┐
              │ DeepSeek API (streaming)  │
              └───────────────────────────┘
```

## Monorepo Structure

```
cider/
├── apps/
│   ├── web/          # Next.js IDE UI
│   ├── server/       # Local API + agent engine
│   └── desktop/      # Electron shell
├── packages/
│   └── shared/       # Shared TypeScript types
├── docs/
│   ├── ARCHITECTURE.md
│   └── IMPLEMENTATION_PLAN.md
└── data/             # SQLite DB, runtime data (gitignored)
```

## Agent Architecture

**Pattern:** ReAct (Reason + Act) with structured tool calling.

```
User Message
    │
    ▼
┌─────────────────┐
│ Context Builder │ ← project memory, semantic file search
└────────┬────────┘
         ▼
┌─────────────────┐     no tools
│ DeepSeek Stream │────────────────► Response
└────────┬────────┘
         │ tool_calls
         ▼
┌─────────────────┐
│ Tool Executor   │ ← sandboxed FS, approval gate
└────────┬────────┘
         │ observations
         ▼
    (loop ≤ 25 iterations)
```

### Modes

| Mode | Tools | Behavior |
|------|-------|----------|
| Ask | Optional/minimal | Q&A, explanations |
| Plan | No execution | JSON plan, awaits approval |
| Agent | Full toolkit | Autonomous read/write/run/git |

### Tools

`read_file`, `write_file`, `edit_file`, `search_codebase`, `list_directory`, `run_command`, `delete_file`, `git_status`, `git_commit`, `remember`

Approval required: `run_command`, `delete_file`, `git_commit`

## Database Schema (SQLite)

| Table | Purpose |
|-------|---------|
| projects | Open workspace roots |
| conversations | Chat threads per project |
| messages | Message history |
| agent_tasks | Long-running agent state |
| memories | Project-level AI memory |
| file_index | Indexed files + embeddings |
| credentials | Encrypted API keys |
| settings | App settings KV |

## WebSocket Protocol

**Client → Server:** `chat:start`, `chat:cancel`, `agent:approve_tool`, `agent:reject_tool`, `ping`

**Server → Client:** `chat:delta`, `chat:done`, `agent:event`, `error`, `pong`

## Security Model

1. **Path sandbox** — all FS ops resolved under project root
2. **Command blocklist** — dangerous patterns rejected
3. **Tool approval** — destructive/shell ops need user consent via WS
4. **Encrypted credentials** — AES-256-GCM in SQLite
5. **Local bind** — server defaults to `127.0.0.1`

## Context Engine

Phase 1 uses **local bag-of-words embeddings** (128-dim) for semantic file retrieval without external models. Files matching extensions are indexed; `node_modules`, `.git`, `dist` ignored.

Future: plug in `ollama` / `@xenova/transformers` for real embeddings.

## Extension Points

- Plugin system (hooks: `onToolCall`, `onFileSave`)
- Voice input → Web Speech API → chat
- Multi-agent via task queue table
- Offline mode: swap DeepSeek for local Ollama via same OpenAI client
