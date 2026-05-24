# Cider

**Cider** is a local-first, browser-based AI coding IDE inspired by Cursor. It uses the **DeepSeek API** for reasoning and runs entirely on your machine.

![Architecture](docs/ARCHITECTURE.md)

## Features

- **Project workspace** — open local folders, file tree, tabs, search
- **Monaco editor** — syntax highlighting, multi-tab editing
- **AI modes** — Ask, Plan, Agent (autonomous tool use)
- **DeepSeek streaming** — real-time responses via WebSocket
- **Agent tools** — read/write/edit files, search, run commands, git
- **Context engine** — local semantic file indexing
- **Memory** — persistent project-level facts
- **Terminal** — run commands with safety checks
- **Git** — status, commit, push via simple-git
- **Security** — path sandbox, command blocklist, tool approvals

## Quick Start

### Prerequisites

- Node.js 20+
- npm (scripts use `npx pnpm` — no global pnpm install needed)

### Setup

```bash
cp .env.example .env
# Edit .env and set DEEPSEEK_API_KEY=sk-...

npm run install:all
npm run dev
```

Open **http://localhost:3000**, enter your project folder path, and start coding.

### Desktop (Electron)

```bash
pnpm desktop
```

Starts the backend and opens the IDE in an Electron window.

## Project Structure

```
apps/web      → Next.js 15 frontend
apps/server   → Fastify backend + agent engine
apps/desktop  → Electron wrapper
packages/shared → Shared TypeScript types
docs/         → Architecture & roadmap
```

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Server status |
| `POST /api/projects/open` | Open folder `{ path }` |
| `GET /api/projects/:id/tree` | File tree |
| `WS /ws` | Streaming AI chat |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Command palette |
| `Ctrl+S` | Save active file |
| `Enter` | Send chat message |

## License

MIT
