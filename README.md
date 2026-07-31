# ZenTree

A lightweight, modern Git GUI client built with Electron + React + TypeScript. Designed to deliver the core interaction of SourceTree with a faster, cleaner experience.

[中文文档](README_zh.md)

## Features

- **Commit Graph** — HTML5 Canvas-rendered DAG with smooth bezier curves, zoom/pan, and viewport culling for repos with 10,000+ commits
- **Branch Labels** — Colored branch tags on the graph, similar to SourceTree
- **File Diff Viewer** — Click any file to see changes in a side panel with hunk-level staging/unstaging/reverting
- **Three-Column Layout** — Branches sidebar | Commit graph + file list | Diff panel
- **10 Color Themes** — Catppuccin, Dracula, Nord, One Dark Pro, Tokyo Night, Monokai, GitHub Dark, Solarized Dark/Light, and more
- **i18n** — Full English and Chinese support with real-time switching
- **Frameless Window** — Custom title bar with window controls, blends with the app theme
- **Amend Commit** — Auto-fills the last commit message when toggled
- **Git Bash Launcher** — Open Git Bash in the current repo directory with one click
- **Repository Search** — Filter your saved repositories in the dropdown
- **Remote Branches** — Display and checkout remote branches with tracking
- **Lazy Loading** — Commit log paginated at 200 per batch, infinite scroll
- **Keyboard Shortcuts** — `F5` refresh, `Ctrl+Enter` commit, `Esc` dismiss errors
- **Drag & Drop** — Drop a folder onto the welcome screen to add a repository
- **Auto Update** — Checks GitHub Releases for new versions, downloads and installs them from Settings > About

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Shell | Electron 36 |
| Build Tooling | Vite 6 + TypeScript 5.7 |
| UI Framework | React 18 + Zustand 5 |
| Git Backend | simple-git 3.27 |
| Graph Rendering | HTML5 Canvas (no third-party chart libs) |
| Packaging | electron-builder (NSIS installer) |

## Screenshots

*(Coming soon)*

## Installation

Download the latest installer from [Releases](../../releases):

- **`ZenTree Setup x.x.x.exe`** — NSIS installer with desktop shortcut
- **`win-unpacked/ZenTree.exe`** — Portable version (no installation required)

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

### System Requirements

- Windows 10 or later
- [Git for Windows](https://git-scm.com/download/win) installed and available in PATH

## Development

```bash
# Clone
git clone https://github.com/your-org/ZenTree.git
cd ZenTree

# Install dependencies
npm install

# Start dev server (Vite HMR + Electron)
npm run dev

# Build for production
npm run build

# Package as Windows installer
npm run pack
```

## Project Structure

```
ZenTree/
├── electron/              # Electron 主进程（基础设施层）
│   ├── main.ts            # 组合根：装配 settings/git/window/ipc
│   ├── windowManager.ts   # 窗口生命周期 + 尺寸持久化
│   ├── settingsRepository.ts  # 设置 JSON 持久化适配器
│   ├── gitRepository.ts   # simple-git 适配器 + Git Bash 定位
│   ├── ipc.ts             # IPC 通道注册（校验 + 错误包装）
│   └── preload.ts         # contextBridge 安全桥（共享 GitAPI 类型）
├── src/
│   ├── domain/            # 领域层（纯逻辑，无 UI/IPC 依赖）
│   │   ├── graph/         # 提交图谱布局算法、分支配色
│   │   ├── theme/         # 主题预设与 CSS 变量应用
│   │   └── diff/          # 差异解析、hunk 补丁、语法高亮
│   ├── application/       # 应用层：Zustand store（状态 + 用例编排）
│   ├── infrastructure/    # 渲染侧网关：gitBridge
│   ├── components/        # 界面层 React 组件
│   ├── renderer/          # Canvas 图谱渲染器
│   ├── i18n/              # 中英文语言包
│   └── types/             # 跨层共享类型契约
├── CHANGELOG.md
├── package.json
├── vite.config.ts
└── tsconfig.json
```
## License

MIT

---

Built with ❤️ using Electron, React, and Canvas.
