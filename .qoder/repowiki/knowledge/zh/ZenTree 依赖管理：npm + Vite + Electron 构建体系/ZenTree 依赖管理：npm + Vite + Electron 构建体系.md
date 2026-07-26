---
kind: dependency_management
name: ZenTree 依赖管理：npm + Vite + Electron 构建体系
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - package-lock.json
    - vite.config.ts
    - tsconfig.json
    - tsconfig.main.json
    - electron/main.ts
    - electron/preload.ts
---

### 1. 使用的系统与工具
- 包管理器：npm（通过 `package.json` 与 `package-lock.json` 锁定版本）
- 运行时框架：Electron（主进程 + 渲染进程）
- 前端构建：Vite + React 插件，TypeScript 编译由 `tsc` 驱动
- 打包分发：electron-builder，输出 Windows (NSIS/Portable)、macOS (dmg/zip)、Linux (AppImage/deb) 多平台安装包
- 开发辅助：concurrently 并行启动主/渲染进程，wait-on 等待 Vite dev server 就绪

### 2. 核心文件与依赖声明
- `package.json`：集中声明应用元信息、scripts、electron-builder 配置以及所有运行时与开发时依赖。
- `package-lock.json`：npm 生成的锁文件，确保依赖树可复现。
- `vite.config.ts`：Vite 构建入口，定义别名 `@` → `src`、端口 5173、输出目录 `dist`。
- `tsconfig.json` / `tsconfig.main.json`：分别控制渲染进程与 Electron 主进程的 TypeScript 编译选项。
- `electron/main.ts`、`electron/preload.ts`：Electron 主进程与预加载脚本源码。

### 3. 架构与约定
- **双进程分离**：渲染进程使用 Vite + React 开发/构建，主进程使用 tsc 编译后由 electron 直接运行，二者通过 IPC 通信。
- **依赖分层清晰**：`dependencies` 仅包含运行时库（simple-git、zustand、react/react-dom），`devDependencies` 包含构建、类型、打包等工具链。
- **版本锁定策略**：生产依赖使用语义化版本范围（如 `^18.3.1`），Electron 主进程版本在 scripts 中硬编码为 `36.3.1`，并通过 `--config.electronVersion=36.3.1` 传递给 electron-builder，保证主/渲染进程 Electron 版本一致。
- **构建产物隔离**：渲染产物输出到 `dist/`，主进程编译产物输出到 `dist-electron/`，electron-builder 打包时同时包含两个目录。
- **路径别名**：通过 Vite 的 `resolve.alias` 将 `@` 映射到 `src`，统一模块导入风格。

### 4. 约定与约束
- **依赖来源**：全部来自 npm 公共仓库，未发现私有 registry 或 vendoring 配置。
- **版本更新方式**：通过 npm 命令升级依赖后提交 `package.json` 与 `package-lock.json`，利用锁文件保证团队一致性。
- **Electron 版本同步**：主进程与打包配置的 Electron 版本必须保持一致（当前均为 36.3.1），否则会导致运行时不兼容。
- **构建环境要求**：Node.js 需支持 ES2020+ 与 bundler 模块解析模式（tsconfig 中已启用 `moduleResolution: "bundler"`）。
- **打包目标固定**：默认仅打包 x64 架构，Windows 生成 NSIS 安装器与 Portable 版，macOS 生成 dmg/zip，Linux 生成 AppImage/deb。

### 5. 关键脚本说明
- `npm run dev`：并行启动主进程与 Vite 渲染进程。
- `npm run build`：先编译主进程 TypeScript，再执行 Vite 构建。
- `npm run pack[/linux|all]`：构建后调用 electron-builder 进行跨平台打包。
- `npm run preview`：预览构建后的渲染产物。

该依赖管理体系结构清晰、职责分离明确，适合中小型 Electron 桌面应用的开发与分发需求。