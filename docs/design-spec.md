# ZenTree 视觉重设计规范 — Claude Desktop / Claude Code 风格

> 本文件是「页面样式完全重做」的唯一权威契约。所有 UI 改动必须遵守本文件；
> 与旧 `src/App.css` 冲突时，以本文件 + `src/theme.css` 为准。

## 0. 目标与原则

把 ZenTree 从「SourceTree 式深色 IDE」改造成 **Claude Desktop / Claude Code 的视觉语言**：

| 原则 | 落地 |
|---|---|
| 温暖的纸感 | 米白/象牙底、暖灰分层、单色陶土强调，禁止冷蓝大面积铺色 |
| 低噪音 | 去重边框、去渐变、去发光；用 1px 暖灰发丝线 + 差分层级 |
| 排版驱动 | 衬线展示字体（Newsreader）只用于品牌/欢迎页/空状态大标题；正文用系统无衬线；哈希、diff、数字用 JetBrains Mono |
| 单强调色 | 陶土色 `--accent` 只用于主操作、选中、焦点、关键状态；其余用中性色 |
| 圆角克制 | 控件 6–8px，卡片 12px，弹层 16px，徽章 pill |
| 留白 | 面板内边距 12–20px，行高 28–30px；宁可少元素也不要挤 |

**硬约束**

1. 零新增运行时依赖、不引入 CSS 框架、不联网加载字体（字体已随包内置于 `src/assets/fonts`）。
2. 只允许引用 `src/theme.css` 中的 token；禁止在组件 CSS 里硬编码颜色（旧色值必须清除）。
3. 不改变任何业务行为：事件处理、store 调用、i18n 文案、DOM 中的 class hook（见 §6）保持。
4. 所有交互控件必须有 hover / active / focus-visible / disabled 四态；键盘焦点用 `box-shadow: var(--focus-ring)`。
5. 动效 110–240ms，`var(--ease-out)`；尊重 `prefers-reduced-motion`（theme.css 已全局处理）。

## 1. Token 契约（`src/theme.css`）

调色板 token 由 `src/domain/theme/presets.ts` 的 4 套主题写入（`claude` 默认浅色、`claude-dark`、`claude-code`、`claude-sand`）。
组件 CSS **只**使用下列 token，不写死色值。

- 表面：`--bg-primary`（应用底）、`--bg-secondary`（卡片/面板）、`--bg-tertiary`（侧栏/凹陷区）、`--bg-elevated`（弹层）、`--bg-input`、`--bg-code`、`--bg-hover`、`--bg-active`
- 分隔：`--border-color`、`--border-strong`、`--separator`
- 文本：`--text-primary` / `--text-secondary` / `--text-muted` / `--text-faint` / `--text-inverse`
- 强调：`--accent`、`--accent-hover`、`--accent-active`、`--accent-strong`（浅底上的可读强调文字）、`--accent-contrast`、`--accent-soft`、`--accent-soft-hover`、`--accent-border`
- 主按钮：`--button-primary-bg` / `--button-primary-bg-hover` / `--button-primary-text`
- 语义：`--success` / `--warning` / `--danger` / `--danger-hover` + `*-bg` / `*-border`
- diff：`--diff-add-bg` / `--diff-add-border` / `--diff-add-text` / `--diff-del-bg` / `--diff-del-border` / `--diff-del-text` / `--diff-hunk-bg` / `--diff-hunk-text`
- 字体：`--font-sans` / `--font-display` / `--font-mono`
- 字号：`--text-xs 11` / `--text-sm 12` / `--text-base 13` / `--text-md 14` / `--text-lg 16` / `--text-xl 20` / `--text-2xl 26` / `--text-display 38`
- 间距：`--space-1..8`（4/8/12/16/20/24/32）
- 圆角：`--radius-xs 4` / `--radius-sm 6` / `--radius 8` / `--radius-lg 12` / `--radius-xl 16` / `--radius-pill`
- 阴影：`--shadow-xs/sm/md/lg/popover`、`--shadow`
- 其他：`--focus-ring`、`--overlay`、`--selection-bg`、`--ease-out`、`--dur*`、`--z-*`

布局变量：`--topbar-height 46`、`--filterbar-height 38`、`--tabbar-height 40`、`--statusbar-height 28`、`--sidebar-width 244`、`--control-height-sm 26` / `--control-height 30` / `--control-height-lg 36`。

## 2. 字体与排版

| 场景 | 字体 / 字号 / 字重 |
|---|---|
| 品牌字标「ZenTree」 | `--font-display` 600，17px，`--text-primary`，字距 -0.01em |
| 欢迎页主标题 | `--font-display` 500，`--text-display`，紧行高（1.1） |
| 空状态标题 | `--font-display` 500，`--text-2xl`；说明文字 `--text-sm` `--text-muted` |
| 面板/区块标题 | `--font-sans` 600，`--text-sm`，字距 `--tracking-wide`，可选大写 |
| 正文/列表 | `--font-sans` 400，`--text-base`（13px） |
| 次要信息 | `--font-sans` 400，`--text-sm`，`--text-muted` |
| 哈希 / 分支名 / 日期 / diff / 行号 / 计数 | `--font-mono`，`--text-xs`–`--text-sm`；`font-variant-ligatures: none` |
| 按钮 | `--font-sans` 500，`--text-sm`（图标按钮仅图标） |

数字使用 `font-variant-numeric: tabular-nums`（计数、ahead/behind、+/- 行数）。

## 3. 布局骨架（`shell.css`）

```
┌──────────────────────────────────────────────────────────────┐
│ TopBar 46px：品牌 + 仓库 chip | 图标工具组 | 主题/语言/设置/窗口控制 │
├──────────────────────────────────────────────────────────────┤
│ FilterBar 38px：搜索输入（带图标）· 作者 · 日期 · 清除（有仓库时）    │
├──────────────────────────────────────────────────────────────┤
│ TabBar 40px：pill 标签 + 右侧动作（分组菜单 / 搜索 / 新标签）        │
├───────────────┬──────────────────────────────┬───────────────┤
│ Sidebar 244px │ Center：CommitGraph + FilePanel│ DiffPanel 可拖拽 │
│ 分支/标签/远程  │                              │ 42% 初始宽度    │
│ /Stash        ├──────────────────────────────┤               │
│               │ CommitBar（悬浮卡片，含输入与提交）             │
├───────────────┴──────────────────────────────┴───────────────┤
│ StatusBar 28px：仓库 · 分支 | 进行中操作/冲突 | spinner/error     │
└──────────────────────────────────────────────────────────────┘
```

- 顶层无外边框、无窗口阴影；区域之间只用 1px `--border-color` 分隔。
- 侧栏使用 `--bg-tertiary`，内容区 `--bg-primary`，卡片/面板 `--bg-secondary`。
- TabBar 与 TopBar 同属窗口 chrome：TopBar 可拖动（`.drag-region`），内部交互元素 `.no-drag`。

## 4. 组件细则

### 4.1 TopBar（`TopBar.tsx` + shell.css）

- 结构：`品牌区（陶土色 ✳ 字标 + 字标文字）` · `仓库 chip（当前仓库名，点击在编辑器中打开? 不新增行为：保持只读 title）` · `+ 按钮` · 工具组（fetch / pull + caret / push / refresh / compare / repo groups / hosting / bash，全部 28px 图标按钮，`title` tooltip）· 右侧（主题切换、语言、设置、窗口控制）。
- 图标：内联 SVG，1.5px stroke，`currentColor`；尺寸 15–16px。文字按钮改为图标按钮时**必须保留 `title`** 与 `disabled`。
- 仓库 chip：pill，`--bg-tertiary` 底、1px 边框，hover `--bg-hover`；内含小圆点表示仓库状态（纯装饰，不做行为）。
- 主题切换按钮：`setThemePreset(isDark ? "claude" : "claude-dark")`（替换旧的 catppuccin 逻辑）。
- 窗口控制：28×28，hover 背景 `--bg-hover`；关闭按钮 hover `--danger` 底 + 白图标。
- 首次无仓库时：品牌区保留，工具组隐藏。

### 4.2 FilterBar（shell.css）

- 一行、38px 高，与 TopBar 用发丝线分隔，背景 `--bg-primary`。
- 搜索输入：左侧 14px 放大镜图标，输入区无边框，focus 时容器显示 `--accent-border` 环；占位符 `--text-faint`。
- 作者输入同款、宽度更窄；日期触发器复用 `.date-picker`（dialogs 负责）。
- 清除按钮为文字按钮，`--text-muted` → hover `--text-primary`。

### 4.3 TabBar（`TabBar.tsx` + shell.css）

- 标签：高 28px、圆角 `--radius`、横向内边距 10px、`--text-sm`；非激活透明底、hover `--bg-hover`；激活 `--bg-secondary` + 1px `--border-color` + `--shadow-xs`，文字 `--text-primary`。
- 关闭按钮：14px，默认 `--text-faint`，hover 圆形 `--bg-active`；激活标签上 hover `--danger`。
- `dragging` 态：opacity .5 + 虚线描边。
- 右侧动作按钮与 `.tab-group-menu` 弹层（弹层由 dialogs.css 的菜单基础样式负责，menu-item 结构不变）。
- 空态 `.tab-empty`：`--text-muted` 12px。

### 4.4 Sidebar（`Sidebar.tsx` + shell.css）

- 背景 `--bg-tertiary`，右发丝线；内边距 10px 8px。
- 分组标题（`.sidebar-subheader`）：11px 600 大写、`--text-muted`、字距 wide；右侧计数 `--font-mono` 11px。
- 列表项：高 28px、圆角 6px、左右 8px；hover `--bg-hover`；active/selected：`--bg-active` + 左侧 2px `--accent` 竖条（用 `::before` 或 inset box-shadow，不改变布局宽度）。
- 分支图标用 12px 内联 SVG（分支=分叉线、远程=云、标签=标签、stash=归档盒），颜色跟随文本层级。
- 本地分支当前分支：`--accent-strong` 文本 + 实心小圆点；ahead/behind 徽章：pill、`--success-bg`/`--warning-bg`、等宽数字。
- 输入（新建分支/重命名）与右键菜单复用 dialogs 的输入/菜单基础类；`RefNameDialog` 弹窗本体由 dialogs 负责。
- Stash 项、section 折叠箭头保持现有 DOM/行为。

### 4.5 Center / CommitGraph（`CommitGraph.tsx` + panels.css + `renderer/canvasRenderer.ts`）

- 画布容器：无边框，顶部 12px 内边距；背景 = `--bg-primary`（canvas 填充同色）。
- 工具栏（搜索/缩放/筛选计数）为悬浮胶囊：`--bg-secondary` + 边框 + `--shadow-sm`，高 28px。
- 提交行：选中态用 `--accent-soft` 背景 + 左侧 2px accent 条；hover 用 `--bg-hover`；文本层级：subject `--text-primary` 13px、author/time `--text-muted` 11px。
- Canvas 渲染：从 CSS 变量读取颜色（现有 `readCssVars`），字体改用 `--font-sans`/`--font-mono` 值拼接（允许 `const font = '12.5px ' + cssVars.fontSans`）；节点半径 7→6.5，节点描边用 `--bg-primary` 2px；连线 1.6px、alpha 0.75；分支标签改成 pill 绘制（圆角矩形 + 10px 600 字体）。
- 分支色板 `src/domain/graph/colors.ts` 替换为 Claude 暖调 12 色（陶土/鼠尾草/赭石/藕荷/灰蓝/橄榄等），保证深浅主题下都可读；保持 `hashToColor` 纯函数签名与测试兼容。
- 右键菜单、tooltip 用 dialogs.css 的基础菜单/浮层样式。

### 4.6 FilePanel（`FilePanel.tsx` + panels.css）

- 背景 `--bg-secondary`，顶部发丝线；头部 36px：分段控件（未暂存/已暂存/提交文件）+ 操作按钮（全部暂存/全部取消暂存）。
- 文件行 28px：左侧状态字母徽章 16×16、圆角 4px，A=success、M=warning、D=danger、R=accent、?=muted（`*-bg` 底 + 对应文字色）；文件名 13px；右侧 +N/-N 等宽 11px。
- hover `--bg-hover`；多选 `--accent-soft`；文件树目录行 26px，箭头 10px。
- 提交详情头：commit hash 等宽 pill（`--bg-tertiary`）、作者/时间 12px muted、文件统计 +N −N。

### 4.7 DiffPanel / DiffViewer（`DiffViewer.tsx`、`DiffPanel.tsx` + panels.css）

- 面板背景 `--bg-secondary`，左侧可拖拽 4px 分隔条（hover/active `--accent-border`）。
- 头部 36px：文件名（等宽 12px）+ 状态徽章 + 操作按钮（暂存/取消暂存/丢弃/历史/Blame/外部 diff），图标按钮 26px。
- 统一 diff 视图：行高 20px、等宽 12px/1.6；行号列 44px、`--text-faint`、右侧发丝线；新增行 `--diff-add-bg` 文本 `--diff-add-text`，删除行 `--diff-del-bg`/`--diff-del-text`；hunk 头 `--diff-hunk-bg`、`--diff-hunk-text`、13px 等宽；hunk 操作按钮在右侧悬浮出现。
- 语法高亮 class（`syn-kw/syn-str/syn-num/syn-cmt/syn-fn`）颜色必须用 token 重定义，且浅/深主题均满足对比度。
- 词级 diff `.word-add/.word-del`：半透明强调底，不得盖过行底色。
- 空态：居中图标 + 标题 + 说明，`--text-muted`。
- 文件历史 / Blame 列表：行高 26px，hash 等宽 accent-strong，作者 muted。

### 4.8 CommitBar（`CommitBar.tsx` + panels.css）

- 仿 Claude 输入框的悬浮 composer：容器 `margin: 10px 14px 12px`、`--bg-secondary`、1px `--border-color`、`--radius-lg`、`--shadow-sm`；focus-within 时边框 `--accent-border` + `--focus-ring`。
- 文本域：透明底、无边框、13px、行高 1.55、内边距 12–14px、`resize: none`（已有自绘 drag handle 保留，顶部 6px 热区 + hover 显示 `--border-strong` 短横线）。
- 底部操作行：左侧 amend 复选框（accent 色）、右侧提交按钮 pill（主按钮 token，高 28px，disabled 用 `--bg-active`+`--text-faint`）。
- 高度随文本域（现有内联 height）自适应，容器不固定死高。

### 4.9 StatusBar（`StatusBar.tsx` + shell.css）

- 高 28px、`--bg-tertiary`、顶部发丝线、12px 文本；仓库路径截断（`direction: rtl` 或 ellipsis），分支名 `--font-mono` + `--accent-strong`。
- ongoing 操作条：`--warning-bg` 胶囊 + Abort（次要按钮）/ Continue（主按钮）。
- 冲突徽章 `.conflict-badge`：`--danger-bg`/`--danger` pill。
- 右侧 spinner + loading 文案；error 用 `--danger` 文本 + hover 背景，点击关闭（保留）。

### 4.10 Welcome（`App.tsx` 内 `Welcome` + shell.css）

- 全屏居中：陶土色 ✳ 标记（28px）→ 「ZenTree」`--font-display` `--text-display` → 一句说明 `--text-md` `--text-muted` → 两个按钮（主：打开仓库；次：克隆仓库，均为高 38px pill）→ 拖拽提示 `--text-xs` `--text-faint`。
- 背景可加极淡的 radial 暖色光晕（仅用 `color-mix(--accent 6%, transparent)`），不得使用图片。
- `.open-btn` / `.open-btn.secondary` / `.welcome-hint` 保留 class。

### 4.11 对话框与浮层（dialogs.css）

- 遮罩：`--overlay` + `backdrop-filter: blur(2px)`（可选，若性能允许）；点击遮罩关闭行为不变。
- 弹窗：`--bg-elevated`、`--radius-xl`、`--shadow-lg`、1px `--border-color`，最小宽 420–560，内边距 20–24。
- 头部：标题 16px 600；关闭按钮 28px 图标；底部 footer 右对齐，按钮间距 8px。
- 输入框：高 32px、`--bg-input` 底、1px `--border-color`、`--radius-sm`；focus `--accent-border` + `--focus-ring`；错误文本 `--danger`。
- 设置弹窗：左侧 tab 列表（宽 168px，`--bg-tertiary`，active 项 `--bg-secondary` + 左侧 accent 条），右侧内容区 padding 24，分区标题 12px 600 muted 大写。
- 主题卡片网格：2 列；卡片 = 预览色块（圆角 8，1px 边框）+ 名称 12px；选中：`--accent-border` 2px + 勾选徽章 `--accent`。
- 通用菜单 `.context-menu` / `.repo-dropdown` / `.pull-menu` / `.palette-*` / `.tab-picker`：`--bg-elevated`、`--radius-lg`、`--shadow-popover`、1px 边框、8px 内边距；item 高 30px、圆角 6、hover `--bg-hover`、危险项 hover `--danger-bg` + `--danger`。
- 命令面板/标签选择器：居中偏上浮层，宽 560，输入区 44px 带底部发丝线，列表项 36px，选中 `--accent-soft` + 左侧 2px accent。
- 日期选择器：popover 结构不变（测试有 hook），`--bg-elevated`、单元格 28px、选中 `--accent` 底、今天描边 `--accent-border`。
- Rebase/Compare/Clone/RepoGroup/Merge/RefName 弹窗遵循同一语言。

## 5. 文件所有权（互斥写域）

| 成员 | 写域 |
|---|---|
| Lead | `src/theme.css`、`src/domain/theme/presets.ts`、`src/application/*`、`electron/*`、`src/types/*`、`tests/*`、`docs/*`、`README*`、`CHANGELOG.md`、`package.json` |
| ui-shell | `src/styles/shell.css`、`src/components/{TopBar,TabBar,Sidebar,StatusBar}.tsx`、`src/App.tsx`（仅 Welcome） |
| ui-panels | `src/styles/panels.css`、`src/components/{CommitGraph,FilePanel,DiffPanel,DiffViewer,MergePanel,CommitBar}.tsx`、`src/renderer/canvasRenderer.ts`、`src/domain/graph/colors.ts` |
| ui-dialogs | `src/styles/dialogs.css`、`src/components/{SettingsDialog,CloneDialog,CompareDialog,RebaseDialog,RepoGroupDialog,RefNameDialog,CommandPalette,TabPicker,DatePicker}.tsx` |
| qa | `scripts/*`、`.qa/*`（截图与验收脚本） |
| reviewer | `docs/review-findings.md`（只读审查） |

旧 `src/App.css` 已从入口移除，仅作为「选择器清单」参考，不得再 import；其所有 class 必须在新 CSS 中有对应规则（QA 脚本会做覆盖核对）。

## 6. 测试依赖的 class hook（不得删除/改名）

`top-bar, tab-bar, tab-list, tab-empty, repo-tab, repo-tab-name, repo-tab-close, tab-group-item, tab-group-item-name, tab-group-empty, tab-picker, sidebar, sidebar-subheader, sidebar-add-btn, branch-item, stash-item, track-count, theme-card, settings-overlay, settings-tab, shortcut-list, spinner, error, conflict-badge, context-menu, context-menu-item, file-action-btn, file-item, file-name, file-tab, filter-clear, filter-query, commit-bar, diff-panel, diff-panel-resize, diff-view-tab, diff-hunk, diff-hunk-actions, diff-hunk-btn, diff-badge, graph-canvas-overlay, graph-search-bar, graph-search-count, graph-zoom-btn, graph-zoom-label, graph-view-ref, graph-view-ref-close, pull-menu-item, repo-dropdown, repo-dropdown-item, repo-add-menu, repo-selector-trigger, palette-empty, palette-hint, palette-input, palette-item, palette-label, picker-item, picker-badge, merge-block, ref-name-input, rebase-action, rebase-row, rebase-reword, rebase-subject, repogroup-remove, repogroup-scan-item, date-picker-cell, date-picker-nav, date-picker-pop, date-picker-trigger, date-picker-weekday, gitignore-editor, tree-dir`

新增结构元素请新增 class，不要复用以上语义 hook 去做纯装饰。

## 7. 验收

1. `npm run typecheck && npm test` 全绿（受影响的组件测试必须保持通过，必要时仅 Lead 可改测试）。
2. `npm run build` 成功；打包后应用可启动。
3. qa 截图（浅色 + 深色 + 关键弹窗）无布局溢出、无未样式化原生控件、无对比度问题；截图存 `.qa/shots/`。
4. CSS 覆盖核对：`src/components` 与 `src/App.tsx` 中出现的 className 必须在新 CSS 中有样式定义（qa 脚本）。
5. 不出现 `#` 硬编码颜色（`theme.css`、`presets.ts` 除外）；`App.css` 不得再被 import。
