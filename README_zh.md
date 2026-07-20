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

### 系统要求

- Windows 10 及以上
- 已安装 [Git for Windows](https://git-scm.com/download/win) 并配置在 PATH 中

## 开发

```bash
# 克隆仓库
git clone https://github.com/your-org/ZenTree.git
cd ZenTree

# 安装依赖
npm install

# 启动开发服务器（Vite 热更新 + Electron）
npm run dev

# 生产构建
npm run build

# 打包为 Windows 安装程序
npm run pack
```

## 项目结构

```
ZenTree/
├── electron/          # Electron 主进程 + 预加载脚本
│   ├── main.ts        # IPC 处理器、窗口管理
│   └── preload.ts     # contextBridge API
├── src/
│   ├── components/    # React UI 组件
│   ├── stores/        # Zustand 状态管理
│   ├── renderer/      # Canvas 图谱渲染器
│   ├── i18n/          # 中英文语言包
│   └── types/         # TypeScript 类型定义
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 许可证

MIT

---

基于 Electron、React 和 Canvas ❤️ 构建
