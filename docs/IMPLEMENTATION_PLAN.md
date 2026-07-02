# KODA Implementation Plan

## Phase 1 — Foundation ✅ (Current)

- [x] Monorepo (pnpm workspaces)
- [x] Shared types package
- [x] Fastify server with health, projects, files APIs
- [x] SQLite schema + migrations
- [x] DeepSeek streaming integration
- [x] Agent orchestrator (ReAct loop)
- [x] Tool system (10 tools)
- [x] WebSocket streaming chat
- [x] Context indexer (local embeddings)
- [x] Memory system
- [x] Git integration (status, commit, push)
- [x] Terminal command execution
- [x] Next.js IDE shell (explorer, tabs, Monaco, chat, terminal)
- [x] Electron desktop wrapper
- [x] Command palette (Ctrl+K)

## Phase 2 — Polish (Next)

- [ ] Resizable panels (react-resizable-panels)
- [ ] File watcher (chokidar) → live tree refresh
- [ ] Auto-save debounced writes
- [ ] Diff preview before agent applies edits
- [ ] Inline AI completions (Monaco provider)
- [ ] Full node-pty interactive terminal
- [ ] Git diff viewer UI
- [ ] Native folder picker (Electron dialog)
- [ ] Settings page (theme, model, approvals)

## Phase 3 — Advanced

- [ ] Real embeddings (Ollama / transformers.js)
- [ ] Plugin SDK
- [ ] Voice-to-agent
- [ ] Multi-agent task queue
- [ ] AI test generation runner
- [ ] Code review mode
- [ ] Tauri alternative to Electron
- [ ] CI-friendly headless agent CLI

## Phase 4 — Production Hardening

- [ ] Rate limiting + token budgeting
- [ ] Audit log for tool executions
- [ ] Backup/restore SQLite
- [ ] Auto-update (Electron)
- [ ] E2E tests (Playwright)
- [ ] packaged installers (electron-builder)

## Module Build Order (Reference)

1. `packages/shared` — types
2. `apps/server` — config, db, security
3. `apps/server` — filesystem, deepseek
4. `apps/server` — agent tools + orchestrator
5. `apps/server` — routes + websocket
6. `apps/web` — stores, api, layout
7. `apps/web` — IDE components
8. `apps/desktop` — electron shell
9. Docs + README

## Running Locally

```bash
cp .env.example .env
# Add DEEPSEEK_API_KEY

pnpm install
pnpm dev
# Web: http://localhost:3000
# API: http://127.0.0.1:3847
```
