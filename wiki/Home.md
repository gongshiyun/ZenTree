# ZenTree Wiki

A lightweight, modern Git GUI client built with **Electron + React + TypeScript**, delivering SourceTree-like core interactions with a faster, cleaner experience.

## Feature Highlights

| Feature | Description |
|---------|-------------|
| Commit Graph | HTML5 Canvas-rendered DAG with bezier curves, zoom/pan, viewport culling (10,000+ commits) |
| Branch Labels | Colored branch tags rendered on the graph |
| File Diff Viewer | Side-panel diff with hunk-level stage / unstage / revert |
| Three-Column Layout | Branches sidebar · Commit graph + file list · Diff panel |
| 10 Color Themes | Catppuccin, Dracula, Nord, One Dark Pro, Tokyo Night, Monokai, GitHub Dark, Solarized Dark/Light, Catppuccin Latte |
| i18n | Full English & Chinese with real-time switching |
| Frameless Window | Custom title bar with native window controls |
| Amend Commit | Auto-fills last commit message |
| Git Bash Launcher | One-click open Git Bash in repo directory |
| Repository Search | Filter saved repositories in dropdown |
| Remote Branches | Display & checkout remote branches with tracking |
| Lazy Loading | Commit log paginated at 200/batch, infinite scroll |
| Keyboard Shortcuts | `F5` refresh · `Ctrl+Enter` commit · `Esc` dismiss errors |
| Drag & Drop | Drop a folder onto welcome screen to add a repository |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Electron 36 |
| Build Tooling | Vite 6 + TypeScript 5.7 |
| UI Framework | React 18 + Zustand 5 |
| Git Backend | simple-git 3.27 |
| Graph Rendering | HTML5 Canvas (zero third-party chart libs) |
| Packaging | electron-builder (NSIS / Portable / AppImage / DMG) |

## Wiki Pages

- [[Architecture]] — High-level system design and data flow
- [[Getting Started]] — Development environment setup and commands
- [[Components]] — React component reference
- [[State Management]] — Zustand store design
- [[IPC API]] — Electron IPC interface reference
- [[Canvas Renderer]] — Graph rendering engine internals
- [[Theming]] — Color theme system
- [[Internationalization]] — i18n architecture
- [[Build and Packaging]] — Production build & distribution

## Project Structure

```
ZenTree/
├── electron/              # Electron main process
│   ├── main.ts            # IPC handlers, window management, Git operations
│   └── preload.ts         # contextBridge API (renderer ↔ main)
├── src/
│   ├── components/        # React UI components
│   │   ├── TopBar.tsx     # Title bar, repo selector, toolbar
│   │   ├── Sidebar.tsx    # Branch list (local + remote)
│   │   ├── CommitGraph.tsx# Canvas graph wrapper
│   │   ├── FilePanel.tsx  # Staged/unstaged file list
│   │   ├── DiffPanel.tsx  # Resizable diff container
│   │   ├── DiffViewer.tsx # Hunk-level diff rendering
│   │   ├── CommitBar.tsx  # Commit message input + amend
│   │   ├── StatusBar.tsx  # Loading/error indicator
│   │   └── SettingsDialog.tsx # Settings modal
│   ├── stores/
│   │   └── repoStore.ts   # Zustand global state + graph builder
│   ├── renderer/
│   │   └── canvasRenderer.ts # Canvas 2D graph engine
│   ├── i18n/
│   │   ├── index.ts       # i18n runtime (t, useT, useLocale)
│   │   ├── en.ts          # English strings
│   │   └── zh.ts          # Chinese strings
│   ├── types/
│   │   └── index.ts       # Shared TypeScript interfaces
│   ├── App.tsx            # Root layout + Welcome screen
│   ├── App.css            # Global styles
│   ├── theme.css          # CSS custom properties
│   └── main.tsx           # React entry point
├── package.json
├── vite.config.ts
├── tsconfig.json          # Renderer TS config
└── tsconfig.main.json     # Main process TS config
```

## License

MIT
