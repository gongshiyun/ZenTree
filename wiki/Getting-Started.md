# Getting Started

## Prerequisites

- **Node.js** ≥ 18 (LTS recommended)
- **Git for Windows** installed and available in `PATH`
- **Windows 10+** (primary target), Linux and macOS also supported

## Clone & Install

```bash
git clone https://github.com/your-org/ZenTree.git
cd ZenTree
npm install
```

## Development

```bash
npm run dev
```

This runs two processes concurrently:

| Process | Command | Description |
|---------|---------|-------------|
| Renderer | `vite` | Vite dev server on `http://localhost:5173` with HMR |
| Main | `tsc -p tsconfig.main.json && wait-on http://localhost:5173 && electron . --dev` | Compiles Electron main, waits for Vite, launches Electron |

The Electron window loads from the Vite dev server, enabling hot reload for React components.

## Build (Production)

```bash
npm run build
```

Compiles TypeScript (main process) and bundles the renderer via Vite into `dist/`.

## Package

```bash
# Windows (NSIS installer + portable)
npm run pack

# Linux (AppImage + deb)
npm run pack:linux

# All platforms
npm run pack:all
```

Output goes to `release/` directory.

## TypeScript Configuration

| File | Scope | Key Settings |
|------|-------|-------------|
| `tsconfig.json` | Renderer (`src/`) | `jsx: react-jsx`, `module: ESNext`, `noEmit: true` |
| `tsconfig.main.json` | Main process (`electron/`) | `module: commonjs`, `outDir: dist-electron/` |

## Vite Configuration

- **Base path:** `./` (relative, required for Electron `file://` loading)
- **Alias:** `@` → `src/`
- **Dev server port:** 5173
- **Build output:** `dist/`

## Environment Detection

The main process detects dev mode via:
```typescript
process.env.NODE_ENV === "development" || process.argv.includes("--dev")
```

In dev mode, it loads `http://localhost:5173` and opens DevTools. In production, it loads `dist/index.html`.

## Settings Storage

Application settings persist to:
```
<userData>/zentree-settings.json
```

On Windows: `%APPDATA%/zentree/zentree-settings.json`

Stored keys include: `gitPath`, `themePreset`, `language`, `windowWidth`, `windowHeight`, `repos`,
`tabs`, `repoGroups`, `lastRepo`. Settings are shape-validated on load and on write
(`electron/settingsRepository.ts`); a structurally corrupt file is backed up next to the original and
replaced by defaults, so a bad edit can never brick git operations.

## Testing Notes

`npm test` needs a real `git` binary on `PATH`. Each integration test creates an isolated repository
under the OS temp directory. `tests/setup.ts` gives every worker a hermetic git environment (temporary
`HOME`/`GIT_CONFIG_GLOBAL`, `GIT_CONFIG_NOSYSTEM=1`, no terminal prompts), so your machine's global
git config cannot influence results. Use `npm run check` for the full gate (renderer + main + tests
type-checked, then the suite) and `npm run test:coverage` for a coverage report.
