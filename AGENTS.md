# AGENTS.md — ZenTree contributor & agent guide

ZenTree is a lightweight Git GUI (Electron 36 + React 18 + TypeScript + Zustand + Canvas).
This file is the shortest reliable path into the codebase for humans and coding agents.

## Commands

```powershell
npm.cmd install            # npm.ps1 may be blocked by PowerShell execution policy
npm.cmd run dev            # Vite renderer + Electron main (HMR)
npm.cmd run typecheck      # renderer/domain/store types (tsconfig.json)
npm.cmd run typecheck:main # electron main-process types (tsconfig.main.json)
npm.cmd test               # Vitest suite (integration tests need a real `git` on PATH)
npm.cmd run check          # typecheck + typecheck:main + tests
npm.cmd run build          # typecheck + main-process tsc + Vite production bundle
npm.cmd run pack           # Windows NSIS + portable build (electron-builder)
node scripts/make-fixture.mjs   # demo repos for screenshots/manual QA (.qa/fixtures)
node scripts/shots.mjs          # Electron screenshot matrix (.qa/shots)
node scripts/css-coverage.mjs   # className ↔ stylesheet coverage check
```

Environment prerequisite: a working `git` binary (`git --version`). The integration
tests create throw-away repositories under the OS temp directory and must never rely on
the machine's global git identity (tests set a local `user.name`/`user.email`).

## Layering (dependency direction: components → application → domain; electron ↔ types)

| Path | Responsibility |
|---|---|
| `electron/main.ts` | composition root: settings repo, git adapter, updater, watcher, window, IPC |
| `electron/gitRepository.ts` | all git operations through simple-git (no renderer git access) |
| `electron/ipc.ts` / `preload.ts` | typed IPC surface (`src/types/index.ts` is the contract) |
| `electron/watcher.ts` | fs.watch on git metadata → debounced `repo:changed` event |
| `src/domain/` | pure logic: diff parse/highlight/word-diff/conflict markers, graph layout & colors, theme presets, tabs, file tree, fingerprint |
| `src/application/repoStore.ts` | Zustand store: per-repo snapshots, refresh tokens, tabs, settings restore |
| `src/infrastructure/gitBridge.ts` | the only renderer-side entry point to `window.gitAPI` |
| `src/renderer/canvasRenderer.ts` | dual-canvas commit graph engine (base + interaction overlay) |
| `src/components/` | React UI |
| `src/styles/{shell,panels,dialogs}.css` | visual system (tokens live in `src/theme.css`) |
| `src/i18n/{en,zh}.ts` | dictionaries; keys and placeholder counts must stay in sync |

## Conventions

- Contracts: a new git capability touches `gitRepository.ts` → `ipc.ts` → `src/types` → `preload.ts` → UI, and `wiki/IPC-API.md`.
- IPC failures are wrapped by `safeHandler` into `{ success, error }`; renderer never sees thrown errors.
- i18n: add keys to both `en.ts` and `zh.ts`; `tests/i18n.test.ts` enforces parity.
- Theme: never hardcode colors in component CSS; use tokens from `src/theme.css` (palette comes from `src/domain/theme/presets.ts`).
- Styling: `src/App.css` was removed in the 1.4 redesign. Component class hooks are asserted by tests — keep them when restructuring markup.
- Security: `contextIsolation` + sandbox on, `nodeIntegration` off. Renderer-controlled URLs are allow-listed before `shell.openExternal`. Working-tree paths are confined to the repository (`resolveWorkingFilePath`).
- Tests: `tests/domain.test.ts` (pure), `tests/repoStore.test.ts` (mocked bridge), `tests/ipc.test.ts` + `tests/gitRepository.test.ts` (real git, temp repos), component tests under jsdom (canvas is stubbed in `tests/helpers/canvasStub.ts`).

## Historical path migrations (post-DDD refactor)

- `src/stores/repoStore.ts` → `src/application/repoStore.ts`
- `src/utils/highlight.ts` → `src/domain/diff/highlight.ts`
- `src/App.css` → `src/theme.css` + `src/styles/{shell,panels,dialogs}.css`
- `src/styles` is the only place component CSS lives; do not recreate `App.css`.
