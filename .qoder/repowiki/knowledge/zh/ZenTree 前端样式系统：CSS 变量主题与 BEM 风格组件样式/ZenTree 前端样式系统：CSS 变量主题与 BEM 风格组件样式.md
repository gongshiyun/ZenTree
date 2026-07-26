---
kind: frontend_style
name: ZenTree 前端样式系统：CSS 变量主题与 BEM 风格组件样式
category: frontend_style
scope:
    - '**'
source_files:
    - src/theme.css
    - src/App.css
    - wiki/Theming.md
---

## 样式系统与架构

ZenTree 采用 **纯 CSS + CSS 自定义属性（CSS Variables）** 的轻量级样式方案，未引入任何 CSS 框架（如 Tailwind、Bootstrap）或预处理器（Sass/Less）。样式组织遵循 **BEM 命名约定**（Block__Element--Modifier），通过 `data-theme` 属性实现运行时主题切换。

### 核心设计决策
- **无构建时样式处理**：所有 CSS 文件由 Vite 直接加载，无需编译步骤
- **CSS 变量驱动主题**：16 个语义化变量定义颜色、字体、圆角等设计令牌
- **双主题支持**：默认暗色主题（Catppuccin Mocha）+ 亮色主题，可扩展至 10 种预设主题
- **Electron 原生集成**：使用 `-webkit-app-region` 实现无边框窗口拖拽和原生控制按钮

### 主题系统架构

主题变量在 `src/theme.css` 中定义，通过 `:root` 伪类设置默认值，`[data-theme="light"]` 覆盖亮色模式。主题切换通过 JavaScript 动态修改 `document.documentElement.style.setProperty()` 并同步更新 `data-theme` 属性。

Canvas 渲染器拥有独立的主题适配层，通过 `setTheme("dark" | "light")` 方法调整画布颜色，与 CSS 变量系统解耦。

### 样式组织结构

- **全局样式** (`src/theme.css`)：CSS 变量定义、基础重置、滚动条样式、应用布局容器
- **组件样式** (`src/App.css`)：按功能模块组织的组件样式，包含 TopBar、Sidebar、CommitGraph、DiffPanel、SettingsDialog 等
- **组件内联样式**：部分复杂交互（如 Canvas 绘制）使用内联样式或 JS 动态计算

### 设计令牌规范

| 令牌类别 | 变量前缀 | 用途 |
|----------|----------|------|
| 背景色 | `--bg-primary/secondary/tertiary/hover/active` | 分层背景表面 |
| 文本色 | `--text-primary/secondary/muted/inverse` | 文本层次结构 |
| 状态色 | `--success/warning/danger` | Git 操作反馈 |
| 强调色 | `--accent/accent-hover` | 主要交互元素 |
| 边框色 | `--border-color` | 分隔线和边框 |
| 尺寸 | `--node-size/--radius` | 节点大小和圆角 |
| 字体 | `--font-mono/--font-sans` | 等宽和无衬线字体族 |
| 阴影 | `--shadow` | 通用阴影效果 |

### 响应式策略

项目采用 **固定宽度面板 + 可调整分割线** 的桌面端布局策略：
- Sidebar 固定 200px 宽度，可通过拖拽调整
- DiffPanel 固定 380px 宽度，支持左右分割
- 主内容区域弹性填充剩余空间
- 使用 `min-width/max-width` 约束最小/最大尺寸

### 交互样式约定

- **悬停效果**：统一使用 `var(--bg-hover)` 背景色变化
- **激活状态**：通过 `var(--accent)` 高亮当前选中项
- **禁用状态**：`opacity: 0.35` + `cursor: not-allowed`
- **过渡动画**：统一的 `transition: all 0.15s` 缓动时间
- **焦点管理**：表单元素使用 `outline: none` + `border-color: var(--accent)` 替代默认焦点样式

### Electron 特定样式

- 窗口标题栏使用 `-webkit-app-region: drag` 实现拖拽
- 控制按钮区域使用 `-webkit-app-region: no-drag` 排除拖拽
- 原生窗口控制按钮（关闭/最小化/最大化）保持系统外观
- 右键菜单使用绝对定位 + 高 z-index 实现浮层效果