# ZenTree

轻量级、现代化的 Git 图形化客户端，基于 Electron + React + TypeScript 构建。对标 SourceTree 的核心交互，但更轻量流畅。

[English](README.md)

## 功能特性

- **提交节点树** — HTML5 Canvas 渲染的 DAG 图谱，平滑贝塞尔曲线连线，支持缩放/拖拽，视口裁剪适配万级提交仓库
- **分支标签** — 图谱上的彩色分支标签，类似 SourceTree 的视觉效果
- **文件差异查看器** — 点击文件在右侧面板展示变更内容，支持分块（hunk）级别的暂存/取消暂存/回滚
- **三栏布局** — 分支侧边栏 | 提交图谱 + 文件列表 | 差异面板
- **10 套色彩主题** — Catppuccin、Dracula、Nord、One Dark Pro、Tokyo Night、Monokai、GitHub Dark、Solarized 等
- **国际化** — 完整的中英文双语支持，实时切换
- **无边框窗口** — 自定义标题栏，窗口控制按钮与应用风格一体化
- **Amend 提交** — 勾选后自动填入上一次提交信息
- **Git Bash 启动器** — 一键在当前仓库目录打开 Git Bash
- **仓库搜索** — 下拉框中筛选已添加的仓库
- **远端分支** — 展示并 checkout 远端分支（自动创建跟踪分支）
- **懒加载** — 提交日志按 200 条分页，无限滚动加载
- **键盘快捷键** — `F5` 刷新、`Ctrl+Enter` 提交、`Esc` 关闭错误提示
- **拖拽添加** — 拖拽文件夹到欢迎页即可添加仓库
- **自动更新** — 在「设置 > 关于」中检查 GitHub Releases 新版本，支持下载并安装更新
- **克隆仓库** — 通过 URL 克隆远程仓库，可选指定分支
- **文件历史与追溯** — 单文件提交历史与逐行 blame，点击即可跳转到对应提交
- **回滚 / 拣选 / 变基** — 安全回滚提交、拣选提交、分支变基（支持中止）
- **对比** — 对比分支/标签/提交，展示领先落后数量与文件差异
- **标签与远端** — 在侧边栏管理标签与远端
- **提交过滤** — 按提交信息、作者、日期过滤图谱
- **冲突解决** — 冲突文件一键启动合并工具，状态栏显示冲突数
- **托管平台跳转** — 在 GitHub/GitLab/Bitbucket 打开仓库、分支或提交
- **自动刷新** — 每 30 秒及窗口聚焦时静默检测外部变更

## 技术栈

| 层级 | 技术 |
|---|---|
| 桌面壳 | Electron 36 |
| 构建工具 | Vite 6 + TypeScript 5.7 |
| UI 框架 | React 18 + Zustand 5 |
| Git 后端 | simple-git 3.27 |
| 图谱渲染 | HTML5 Canvas（无第三方图表库） |
| 打包 | electron-builder（NSIS 安装程序） |

## 截图

*(即将添加)*

## 安装

从 [Releases](../../releases) 下载最新版本：

- **`ZenTree Setup x.x.x.exe`** — NSIS 安装程序（含桌面快捷方式）
- **`win-unpacked/ZenTree.exe`** — 绿色免安装版

完整发布记录见 [CHANGELOG.md](CHANGELOG.md)。

### 系统要求

- Windows 10 及以上
- 已安装 [Git for Windows](https://git-scm.com/download/win) 并配置在 PATH 中

## 开发

### 环境前置

- **Node.js** 18+ 与 npm
- **Git** — 系统 `PATH` 中须存在可用的 `git` 二进制（应用运行与测试套件均依赖）

```bash
# 克隆仓库
git clone https://github.com/your-org/ZenTree.git
cd ZenTree

# 安装依赖
npm install

# 启动开发服务器（Vite 热更新 + Electron）
npm run dev

# 运行完整提交前检查（类型检查 + 测试）
npm run check

# 生产构建
npm run build

# 打包为 Windows 安装程序
npm run pack
```

### 测试

`npm test` 运行 Vitest 测试套件。其中大部分是**依赖真实 `git` 二进制的集成测试**：每个用例会在系统临时目录下创建相互隔离的一次性仓库（`zentree-test-*` / `zentree-ipc-test-*`），结束后自动清理。运行前请确认 `git --version` 可正常执行——若 `PATH` 中缺少 git，测试将失败。

| 测试文件 | 覆盖范围 | 是否依赖真实 git |
|---|---|---|
| `tests/domain.test.ts` | 纯领域逻辑（diff 解析/高亮、文件树、图谱布局） | 否 |
| `tests/repoStore.test.ts` | 应用层 store 核心状态迁移（IPC 桥已 mock） | 否 |
| `tests/ipc.test.ts` | IPC 通道，含破坏性操作（discard / reset / 删除分支） | 是——隔离临时仓库 |
| `tests/gitRepository.test.ts` | `GitRepository` 适配器端到端 | 是——隔离临时仓库 |

## 项目结构

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
## 许可证

MIT

---

基于 Electron、React 和 Canvas ❤️ 构建
