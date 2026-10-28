# ZenTree

轻量级、现代化的 Git 图形化客户端，基于 Electron + React + TypeScript 构建。它把 SourceTree 最核心的工作流——提交图谱、暂存、差异查看——装进一个更快、更安静的桌面应用，视觉风格与 Claude 桌面端 / Claude Code 保持一致。

[English](README.md) · [设计规范](docs/design-spec.md) · [验收记录](docs/verification-1.4.0.md) · [更新日志](CHANGELOG.md)

## 界面截图

| Claude（默认浅色） | Claude Dark |
|---|---|
| ![浅色主界面](docs/screenshots/main-light.png) | ![深色主界面](docs/screenshots/main-dark.png) |

| 欢迎页 | 设置 · 主题 |
|---|---|
| ![欢迎页](docs/screenshots/welcome.png) | ![外观设置](docs/screenshots/settings-appearance.png) |

## 核心特性

### 视觉设计

- **Claude 风格设计系统** —— 温暖纸感底色、发丝级分隔线、单一陶土强调色、克制的圆角与留白，详见 `docs/design-spec.md`
- **4 套主题** —— Claude（默认浅色）、Claude Dark、Claude Code（终端深黑）、Claude Sand
- **内置字体** —— Newsreader（衬线展示）、JetBrains Mono（哈希 / diff / 数字），均为 OFL 授权并随安装包分发，不依赖网络字体
- **无边框窗口** —— 自定义标题栏、标签条与窗口控制按钮，随主题同步

### Git 工作流

- **提交图谱** —— HTML5 Canvas 渲染 DAG，平滑分支泳道、分支标签胶囊、悬停/选中态、缩放、图谱内搜索、视口裁剪与无限滚动（万级提交）
- **暂存与差异** —— 已暂存/未暂存/提交文件三视图、文件树或扁平模式、语法高亮 diff、按 hunk 暂存/取消暂存/回滚（新增、删除、重命名文件同样可用）、词级差异标记
- **提交输入框** —— Claude 风格悬浮 composer，支持草稿保护、Amend、提交模板预填与 `Ctrl+Enter` 提交
- **三栏布局** —— 侧边栏（分支 / 远端 / 标签 / 暂存）· 提交图谱 + 文件列表 · 差异面板
- **仓库标签页** —— 每个仓库一个标签页，可拖拽排序、`Ctrl+P` 搜索、`Ctrl+Tab` 循环；仓库组可作为标签集展示；按仓库缓存实现瞬时切换
- **命令面板（`Ctrl+K`）** —— 搜索仓库、分支或执行命令
- **历史工具** —— 文件历史（跟踪重命名）、逐行 blame 跳转、任意两个引用的对比（领先/落后统计）、回滚 / 拣选 / 交互式变基、reset（soft/mixed/hard）
- **冲突处理** —— 内置三方合并面板（取左/取右/两者都留），二进制或超大文件自动回退到外部合并工具
- **远端操作** —— fetch/pull/push、拉取策略（merge/rebase/ff-only）、上游跟踪与领先落后徽章、远端分支 checkout、清理失效分支、标签与远端管理
- **更多** —— 克隆、子模块、按仓库提交模板、GPG 签名开关、外部 diff 工具、托管平台跳转（GitHub/GitLab/Bitbucket）、Git Bash 启动器
- **国际化** —— 完整中英文词典，键位与占位符有自动对账测试
- **刷新机制** —— `fs.watch` 监听 git 元数据（HEAD / index / refs，含 linked worktree）触发防抖静默刷新；30 秒与窗口聚焦时的轻量指纹轮询兜底，覆盖工作区文件编辑
- **自动更新** —— 在「设置 → 关于」中检查 GitHub Releases（仅安装版）

### 工程质量

- **IPC 加固** —— 启用 context isolation 与 sandbox、关闭 Node 集成；所有写操作通道校验仓库路径；渲染进程发起的 URL 仅允许 http(s)
- **路径约束** —— 工作区文件读写拒绝目录穿越、绝对路径、符号链接逃逸与 `.git` 元数据
- **单实例** —— 二次启动只聚焦已有窗口，避免多个实例争写设置文件
- **类型契约** —— 主进程 / preload / 渲染进程共享同一份 `GitAPI` 接口；渲染层、主进程与测试代码均纳入 `npm run check` 类型门禁
- **测试体系** —— 504 个 Vitest 用例，包含真实 git 的隔离临时仓库集成测试，并隔离全局 git 配置（见[测试](#测试)）
- **视觉验收工具** —— Electron 截图矩阵、演示仓库生成器与 class 覆盖率检查（`npm run qa`）

## 技术栈

| 层级 | 技术 |
|---|---|
| 桌面外壳 | Electron 36 |
| 构建 | Vite 6 + TypeScript 5.7 |
| UI | React 18 + Zustand 5 |
| 样式 | 手写 CSS 设计令牌（`src/theme.css` + `src/styles/*.css`） |
| Git 后端 | simple-git 3.27 |
| 图谱渲染 | HTML5 Canvas（图层 + 交互覆盖层） |
| 国际化 | 轻量 `t()` 词典 + 中英文对账测试 |
| 打包 | electron-builder（NSIS 安装包 + 免安装 exe） |
| 测试 | Vitest 4、Testing Library、Playwright（Electron 截图） |

## 安装

从 [Releases](https://github.com/gongshiyun/ZenTree/releases) 下载最新版本：

- **`ZenTree Setup x.y.z.exe`** —— NSIS 安装包（带桌面快捷方式）
- **`ZenTree x.y.z.exe`** —— 免安装便携版

### 系统要求

- Windows 10 及以上
- 安装 [Git for Windows](https://git-scm.com/download/win) 并确保 `git` 在 `PATH` 中（或在「设置 → 通用」中指定 git 路径）

## 开发

### 环境要求

- **Node.js 18+** 与 npm
- **Git** —— 可用的 `git` 命令（应用与集成测试都需要）

```powershell
git clone https://github.com/your-org/ZenTree.git
cd ZenTree

npm install

# 开发模式（Vite HMR + Electron）
npm run dev

# 提交前完整门禁：渲染层 + 主进程 + 测试类型检查与测试
npm run check

# 生产构建
npm run build

# 打包 Windows 安装包与便携版（输出到 release/）
npm run pack
```

> Windows PowerShell 若禁止运行 `npm.ps1`，请使用 `npm.cmd`。

### 测试

`npm test` 运行 Vitest。多数套件会调用真实 `git`：每个用例在系统临时目录创建独立的临时仓库并在结束后清理。测试环境是隔离的：`tests/setup.ts` 把 git 指向临时 `HOME`/`GIT_CONFIG_GLOBAL`，关闭系统配置并设置 `GIT_CONFIG_NOSYSTEM`、`GIT_TERMINAL_PROMPT`，因此开发者本机的全局 git 配置（hooks、签名、身份）不会影响结果。

| 套件 | 范围 | 需要真实 git |
|---|---|---|
| `tests/domain.test.ts`、`parserEdge`、`highlight`、`graph` | 纯逻辑：diff 解析/高亮/词级差异、hunk 补丁、图谱布局、冲突标记、指纹 | 否 |
| `tests/repoStore.test.ts` | 应用状态迁移、按仓库缓存、刷新竞态、设置恢复 | 否 |
| `tests/ipc.test.ts` | IPC 信封契约、破坏性通道、参数校验 | 是——临时仓库 |
| `tests/gitRepository.test.ts` | `GitRepository` 端到端（checkout、rebase、stash、子模块、对比、worktree 等） | 是——临时仓库 |
| `tests/*.test.tsx` | jsdom 组件测试（canvas 使用桩） | 否 |
| `tests/watcher.test.ts`、`windowManager.test.ts`、`updateManager.test.ts` 等 | 基础设施适配器（使用测试替身） | 部分 |

额外门禁：

```powershell
npm run test:coverage   # v8 覆盖率报告
npm run qa:css          # TSX 中使用的每个 className 都能在样式中找到规则
npm run qa:fixture      # 在 .qa/fixtures 生成可复现的演示仓库
npm run qa:shots        # 启动 Electron 截取 UI 截图矩阵到 .qa/shots
```

## 项目结构

```
ZenTree/
├── electron/                  # 主进程（基础设施层）
│   ├── main.ts                # 组合根：设置/git/窗口/ipc/更新/监视器
│   ├── windowManager.ts       # 无边框窗口、主题背景、导航防护
│   ├── settingsRepository.ts  # 带校验的 JSON 设置持久化
│   ├── gitRepository.ts       # simple-git 适配器 + Git Bash 定位
│   ├── ipc.ts                 # IPC 通道（参数校验 + 错误信封）
│   ├── preload.ts             # contextBridge 安全桥（共享 GitAPI 契约）
│   ├── watcher.ts             # 监听 git 元数据（支持 worktree、防抖）
│   └── updateManager.ts       # electron-updater 状态机
├── src/
│   ├── domain/                # 纯逻辑：图谱布局/配色、diff 解析/高亮/
│   │                          # 词级差异/冲突标记、文件树、指纹、标签页、主题预设
│   ├── application/           # Zustand store（状态 + 用例编排）
│   ├── infrastructure/        # 渲染侧 git 桥网关
│   ├── components/            # React 界面组件
│   ├── renderer/              # 双画布提交图谱引擎
│   ├── styles/                # shell.css · panels.css · dialogs.css
│   ├── assets/fonts/          # 内置 OFL 字体（Newsreader、JetBrains Mono）
│   ├── i18n/                  # 中英文词典
│   ├── theme.css              # 设计令牌 + 全局基础样式
│   └── types/                 # 跨层共享类型契约
├── scripts/                   # QA 工具（演示仓库、截图、CSS 覆盖率）
├── tests/                     # Vitest 套件（含隔离 git 环境）
├── docs/                      # 设计规范、评审记录、截图
└── CHANGELOG.md
```

## 许可证

MIT。内置字体使用 SIL Open Font License（见 `src/assets/fonts/LICENSE-*`）。

---

用 ❤️ 构建：Electron、React 与 Canvas。
