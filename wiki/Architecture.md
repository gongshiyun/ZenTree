# Architecture

## System Overview

ZenTree follows the standard Electron dual-process architecture with a clear separation of concerns:

```
┌──────────────────────────────────────────────────────────────────┐
│                        Electron Main Process                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Window Mgmt  │  │ IPC Handlers │  │ simple-git (Git Ops)   │ │
│  └──────────────┘  └──────┬───────┘  └────────────────────────┘ │
│                           │                                       │
│  ┌────────────────────────┴──────────────────────────────────┐   │
│  │              Settings (JSON file persistence)              │   │
│  └───────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬──────────────────────────────────┘
                                │ contextBridge (preload.ts)
                                │ window.gitAPI
┌───────────────────────────────┴──────────────────────────────────┐
│                     Electron Renderer Process                      │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ React 18   │  │ Zustand 5    │  │ Canvas Renderer          │ │
│  │ Components │←→│ Global Store │←→│ (GraphRenderer class)    │ │
│  └────────────┘  └──────────────┘  └──────────────────────────┘ │
│  ┌────────────┐  ┌──────────────┐                                │
│  │ i18n       │  │ CSS Themes   │                                │
│  └────────────┘  └──────────────┘                                │
└──────────────────────────────────────────────────────────────────┘
```

## Process Communication

All Git operations execute in the **main process** via `simple-git`. The renderer never touches the filesystem or spawns processes directly.

**Flow:**

1. React component calls `window.gitAPI.<method>(...)`
2. `preload.ts` forwards via `ipcRenderer.invoke(channel, ...args)`
3. `main.ts` handles via `ipcMain.handle(channel, handler)`
4. Handler executes Git command, returns `{ success, data?, error? }`
5. Component updates Zustand store → triggers re-render

## Data Flow

```
User Action → Component → window.gitAPI → IPC → main.ts → simple-git → Git CLI
                                                        ↓
UI Update ← Zustand Store ← Component ← IPC Response ←┘
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Canvas over SVG/DOM | Performance with 10,000+ commit nodes; viewport culling avoids rendering off-screen elements |
| Zustand over Redux | Minimal boilerplate, no providers needed, works outside React (canvas callbacks) |
| simple-git over nodegit | Pure JS wrapper around Git CLI — no native compilation, smaller binary |
| Frameless window | Custom title bar blends with theme; `WebkitAppRegion: drag` for native window dragging |
| JSON settings file | No database needed; stored in `app.getPath("userData")/zentree-settings.json` |
| Lazy loading (200/batch) | Keeps initial load fast for large repos; infinite scroll triggers next batch |

## Module Boundaries

| Module | Responsibility | Dependencies |
|--------|---------------|--------------|
| `electron/main.ts` | Composition root: wires settings, git, window and IPC | electron |
| `electron/windowManager.ts` | BrowserWindow lifecycle + bounds persistence | electron |
| `electron/settingsRepository.ts` | Settings JSON persistence (infrastructure) | fs, path |
| `electron/gitRepository.ts` | simple-git adapter, git-bash locator (infrastructure) | simple-git, fs, child_process |
| `electron/ipc.ts` | IPC channel registration, validation, safeHandler | electron |
| `electron/preload.ts` | Secure bridge (contextBridge), typed by shared GitAPI | electron |
| `src/domain/graph/*` | Pure graph layout + lane/color algorithms | types |
| `src/domain/theme/presets.ts` | Theme presets + CSS variable application | — |
| `src/domain/diff/*` | Diff parsing, hunk patch building, syntax highlighting (pure) | types |
| `src/application/repoStore.ts` | Zustand store: state + use cases (refresh, load more, settings init) | zustand, i18n, domain |
| `src/infrastructure/gitBridge.ts` | Renderer-side gateway over window.gitAPI | types |
| `src/renderer/canvasRenderer.ts` | Canvas 2D rendering, camera, hit-testing, events | domain/graph, types |
| `src/components/*` | UI presentation, user interaction | application, i18n, types |
| `src/i18n/*` | Locale strings, reactive translation hooks | — |
| `src/types/index.ts` | Shared contracts (GitAPI, AppSettings, GraphNode, DiffHunk, etc.) | — |

## Security Model

- `contextIsolation: true` — renderer cannot access Node.js APIs
- `nodeIntegration: false` — no `require()` in renderer
- `sandbox: true` — preload only uses `contextBridge`/`ipcRenderer`, which work sandboxed
- All filesystem access confined to main process
- Hunk patches written to OS temp dir and cleaned up immediately
