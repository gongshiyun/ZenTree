# ZenTree 改进设计方案 v1.1

> 状态：二次评审后定稿（第一轮修订见附录 B，二次评审发现与修订见附录 C）
> 依据：《ZenTree vs SourceTree 全面对比分析报告》
> 约束：所有方案必须满足轻量级定位 —— 零新增运行时第三方依赖、不引入插件体系、单功能实现不超过既定工程量。

***

## 0. 背景与目标

ZenTree 功能完成度约为 SourceTree 核心场景的 70%，且在万级提交图谱渲染上具备架构优势（Canvas + 视口裁剪 + 懒加载）。本方案聚焦三个最大短板：

1. **交互落差** — 图谱节点右键菜单仅 4 项（reset ×3 + 复制 hash）；
2. **刷新感知** — 30 秒盲目轮询 + 7 路并行 git 全量刷新，无变化时也重绘；
3. **冲突自助化** — 冲突只能转发外部 mergetool，新手劝退点。

验收总目标：`npm run check` 全绿；每项功能附带集成测试（沿用临时仓库隔离模式）。

## 1. 设计原则

| 原则      | 落地要求                                                                                                           |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| 契约一致    | 所有新 IPC 通道走 `safeHandler`，返回 `{ success, data?, error? }` 信封（`electron/ipc.ts`）                                |
| 五层穿透    | 每个新能力必须同时修改：`gitRepository.ts` → `ipc.ts` → `types/index.ts`（GitAPI）→ `preload.ts` → 组件层，并同步 `wiki/IPC-API.md` |
| i18n 对账 | 新文案键必须成对加入 `en.ts` / `zh.ts`，占位符数量一致（`tests/i18n.test.ts` 的键位/占位符对账测试会自动拦截漏配）                                  |
| 零新依赖    | 窗口化列表、命令面板、文件监视均自实现；监视用 Node 原生 `fs.watch`                                                                     |
| 可测试性    | 主进程能力在 `tests/gitRepository.test.ts` 用真实 git 验证；纯逻辑进 `tests/domain.test.ts`；UI 走 jsdom 组件测试                    |

## 2. P0 详细设计

### 2.1 扩充图谱右键菜单

**现状**：`src/components/CommitGraph.tsx` 的 `ctxMenu` 仅含 reset soft/mixed/hard 与复制 hash。所需后端能力（cherry-pick / revert / createBranch / createTag / compare）的 IPC 通道**已全部存在**，本项为纯前端接线。

**改动文件**：仅 `src/components/CommitGraph.tsx`、`src/i18n/{en,zh}.ts`、`src/App.css`。

**菜单结构**（分隔线分组）：

```
从此提交创建分支…        (createBranchAt)
在此提交创建标签…        (createTagAt)
────────────────────────
签出此提交（detached）    (checkout hash，脏工作区走 batch-checkout)
从此提交开始比较          (setCompareBase → 打开 CompareDialog)
────────────────────────
Cherry-pick 此提交       (cherryPick + confirm)
Revert 此提交            (revertCommit + confirm)
────────────────────────
Reset soft / mixed / hard （现有）
────────────────────────
复制 hash                （现有）
```

**实现要点**：

```tsx
// CommitGraph.tsx：统一动作分发，替代逐项内联 async
const handleNodeAction = useCallback(async (action: NodeAction) => {
  if (!ctxMenu || !currentRepo) return;
  const hash = ctxMenu.node.hash;
  setCtxMenu(null);
  // cherry-pick / revert / checkout 均需 window.confirm 二次确认，文案走 i18n
  const op = ACTIONS[action];            // 映射到 gitApi() 对应方法
  await runOp(() => op(currentRepo, hash), opLabel[action]);
}, [ctxMenu, currentRepo]);
```

* 「创建分支/标签」复用 Sidebar 中已有的输入对话框组件逻辑，抽取为共享的 `RefNameDialog.tsx`（新组件，props：`title/placeholder/onSubmit/onClose`），Sidebar 同步切换使用，避免复制粘贴。

* 「从此提交开始比较」：在 repoStore 增加 `compareBase: string | null` 状态，CompareDialog 打开时若 `compareBase` 非空则预填 from 端。

* 注：FilePanel 已有针对「当前选中提交」的 cherry-pick / revert 按钮（含 `commit.confirmCherryPick` / `commit.confirmRevert` 文案），图谱菜单为同一能力的另一入口，**必须复用同一组确认文案与 runOp 流程**，不得另起一套。

* **签出安全约束（二次评审补）**：工作区有未提交改动时直接 `git checkout <hash>` 可能失败或丢失改动。该项必须走已有的 `git:batch-checkout` 通道（`BatchCheckoutOptions` 支持自动 stash/restore），而非裸 `git:checkout`。

**新增 i18n 键**：`graph.createBranchHere`、`graph.createTagHere`、`graph.checkoutHere`、`graph.compareFromHere`、`graph.cherryPick`、`graph.revertCommit` 及对应确认文案（各 2 语言，共 16 键）。

**测试（二次评审定案，不再保留降级选项）**：jsdom 中 `HTMLCanvasElement.prototype.getContext` 默认返回 null，`GraphRenderer` 构造会抛错被 CommitGraph 吞掉，导致无法经由 UI 触发右键菜单。解法：新建共享测试夹具 `tests/helpers/canvasStub.ts`，在组件测试 setup 阶段桩 `HTMLCanvasElement.prototype.getContext` 返回记录式 fake ctx（复用 canvasRenderer.test.ts 的 ctx 实现），并在渲染后 flush rAF；随后断言右键菜单项数量与点击动作对 gitAPI 的调用。

***

### 2.2 节点渲染缓存（文本度量 + 日期格式化）

**现状**：`canvasRenderer.ts` 的 `drawNodes` 对每个可见节点每帧调用 2 次 `measureText` + 现场构造日期字符串；`drawBranchLabels` 另有 1 次 `measureText`。悬停每次移动触发整画布重绘，成本被反复支付。

**改动（二次评审修订：日期格式化是展示关注点，不得下沉到 domain 层与共享类型）**：

1. `GraphNode` / `layout.ts` **保持不变**；
2. `canvasRenderer.ts` 增加两个渲染端缓存（按节点 hash 键控，`setData` 时清空）：

```ts
private dateStrCache = new Map<string, string>();   // hash -> 预格式化日期
private textWidthCache = new Map<string, number>(); // font\0text -> 宽度

private cachedMeasure(text: string, font: string): number {
  const key = font + "\u0000" + text;
  let w = this.textWidthCache.get(key);
  if (w === undefined) {
    this.ctx.font = font;
    w = this.ctx.measureText(text).width;
    // 超限淘汰最早插入的一半（Map 迭代序 = 插入序），避免 clear() 全量颠簸
    if (this.textWidthCache.size > 2000) {
      const it = this.textWidthCache.keys();
      for (let i = 0; i < 1000; i++) this.textWidthCache.delete(it.next().value!);
    }
    this.textWidthCache.set(key, w);
  }
  return w;
}
```

3. 缓存失效时机：仅 `setData` 时清空两缓存；主题切换不影响度量结果，无需失效。

**测试**：`tests/canvasRenderer.test.ts` 断言两次渲染同一文本时 fake ctx 的 `measureText` 仅被底层调用一次、同一节点日期字符串仅构造一次（扩展 fake ctx 记录调用次数）；`tests/graph.test.ts` 无新增断言（domain 层未变）。

***

### 2.3 文件级 checkout（恢复单文件到任意版本）

**现状**：`git:discard` 只能恢复工作区改动到 HEAD，无法把文件恢复到历史提交版本。

**新通道**：`git:checkout-file`

| 层                  | 变更                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gitRepository.ts` | `async checkoutFile(repoPath: string, ref: string, filePath: string): Promise<boolean>` → `this.git(repoPath).raw(["checkout", ref, "--", filePath])`              |
| `ipc.ts`           | `handle("git:checkout-file", async (repoPath, ref, filePath) => git.checkoutFile(String(repoPath), String(ref), String(filePath)))`                                |
| `types/index.ts`   | `checkoutFile: (repoPath: string, ref: string, filePath: string) => Promise<{ success: boolean; error?: string }>;`                                                |
| `preload.ts`       | 一行转发                                                                                                                                                               |
| UI 入口              | ① FilePanel 文件右键增加「恢复到 HEAD 版本」（等价 discard 但文案更明确，内部仍走 discard）；② CommitDetail 文件列表右键增加「检出此版本」（ref = 当前查看的 commit hash），执行后 `window.confirm` 提示「该文件工作区与暂存区内容都会被覆盖」 |

**安全约束**：`filePath` 直接作为 git 参数，不做路径拼接，天然规避目录穿越（与 `readWorkingFile` 的 `path.join` 用法不同，需在代码评审中显式标注该差异）。

**测试**：`tests/gitRepository.test.ts` 临时仓库用例——提交 v1/v2 两个版本后 `checkoutFile(repo, v1Hash, f)`，断言工作区与 index 均为 v1 内容；`tests/ipc.test.ts` 增加该通道的失败信封用例（不存在的 hash）。

***

### 2.4 快捷键补全

**新增键位**（在 `App.tsx` 的 `handleKeyDown` 扩展，注意忽略输入框聚焦态）：

| 键位             | 动作                | 实现                                                            |
| -------------- | ----------------- | ------------------------------------------------------------- |
| `Ctrl+Shift+S` | 全部暂存              | `gitApi().stageAll` + refreshAll                              |
| `Ctrl+Shift+U` | 全部取消暂存            | `gitApi().unstageAll`                                         |
| `Delete`       | 丢弃选中文件（需 confirm） | FilePanel 需把选中文件提升到 store：`repoStore.selectedFiles: string[]` |
| `Ctrl+K`       | 命令面板（见 3.3）       | 预留                                                            |

**输入框豁免**：

```ts
const tag = (e.target as HTMLElement)?.tagName;
if (tag === "INPUT" || tag === "TEXTAREA") return; // 仅 Esc/F5 例外保持现状
```

**交付物**：SettingsDialog 新增「快捷键」只读列表区块（i18n 键 `settings.shortcuts*`），作为文档化第一步；可配置键位明确不做（见第 5 节非目标）。

***

## 3. P1 详细设计

### 3.1 fs.watch 增量刷新（消灭盲目轮询）

**架构**：

```
主进程 watcher.ts ──fs.watch(.git/HEAD|.git/index|refs 目录)──▶ 去抖 500ms
        │ ipcMain.handle("repo:watch", ...)  返回订阅 id
        ▼
渲染端 repoStore.watchCurrentRepo() ──"repo:changed" 事件──▶ silentDiffRefresh()
```

**主进程新文件 `electron/watcher.ts`**：

```ts
import * as fs from "fs";
import * as path from "path";

export class RepoWatcher {
  private watchers: fs.FSWatcher[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** 监视目标：HEAD、index、packed-refs、refs 目录（覆盖 commit/branch/tag 变化）。 */
  start(repoPath: string, onChange: () => void): void {
    this.stop();
    const gitDir = path.join(repoPath, ".git");
    const targets = [
      path.join(gitDir, "HEAD"),
      path.join(gitDir, "index"),
      path.join(gitDir, "packed-refs"), // 二次评审补：分支被 pack 后 refs 目录不再变化
      path.join(gitDir, "refs"),
    ].filter((t) => fs.existsSync(t));
    for (const t of targets) {
      try {
        this.watchers.push(fs.watch(t, { recursive: t.endsWith("refs") }, () => this.schedule(onChange)));
      } catch { /* 单个目标失败不阻塞其余 */ }
    }
  }

  private schedule(onChange: () => void) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(onChange, 500); // 去抖：批量 git 操作只触发一次
  }

  stop() {
    this.watchers.forEach((w) => w.close());
    this.watchers = [];
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }
}
```

**自评审修订点（关键）**：部分 git 操作会**原子替换** `.git/index` 文件（删除后重建），导致文件级 watch 句柄失效。缓解：监听失败或 `error` 事件时自动重挂（`watcher.on("error", () => this.start(...))`），并**保留 30 秒轮询作为兜底**，但改为「静默 + 短路」（见下）。

**平台兼容性（二次评审补）**：`fs.watch` 的 `recursive` 选项在 Linux 需 Node ≥ 19.1；Electron 36 内置 Node 22，`pack:linux` 构建不受影响，但需在 Linux 上实测 refs 目录事件（watcher.test.ts 在三平台 CI 均可运行）。

**IPC 通道与主进程装配（二次评审补全装配层）**：

* `repo:watch (repoPath) → { success }`：主进程开始监视，事件经 `getWindow()?.webContents.send("repo:changed", repoPath)` 推送；

* `repo:unwatch () → { success }`：切换仓库/关闭时调用；

* **装配**：`IpcDeps` 增加 `watcher: RepoWatcher` 字段，`electron/main.ts` 组合根负责实例化并在窗口关闭时 `stop()`；`electron/main.ts` 列入受影响文件（第 8 节已补）。

**生命周期（二次评审补）**：渲染端在 `setCurrentRepo` 后调用 `repo:watch(新仓库)` 并 `repo:unwatch` 旧仓库；`silentDiffRefresh` 额外守卫 `get().ongoing !== null` 时跳过（rebase/merge 进行中事件密集，由完成后 refreshAll 统一收敛）。

**渲染端短路逻辑（repoStore.ts 新增 `silentDiffRefresh`）**：

```ts
silentDiffRefresh: async () => {
  const repo = get().currentRepo;
  if (!repo || get().loading) return;
  // 两个廉价调用并行：status + 单提交 log（取 HEAD hash）
  const [r, head] = await Promise.all([gitApi().status(repo), gitApi().log(repo, 0, 1)]);
  if (!r.success) return;
  // 指纹 = status 指纹 + HEAD hash；完全一致则直接返回，不触碰 graphData，图谱零重绘
  const fp = statusFingerprint(r.data) + "@" + (head.success ? head.data?.[0]?.hash ?? "" : "");
  if (fp === get().lastStatusFingerprint) return;
  set({ lastStatusFingerprint: fp });
  await get().refreshAll(repo, true); // 有变化才全量静默刷新
},
```

`statusFingerprint` 为纯函数（放入 `src/domain/`）：对 `GitStatusData` 的 staged/modified/created/deleted/renamed/not\_added/conflicted/current 排序后 `JSON.stringify`。调用点再拼接 HEAD hash，以覆盖 **detached HEAD 下新提交不改变分支名** 的边界场景（此时 status 指纹可能不变，但 HEAD hash 必变）。两次廉价调用（status + 单条 log）的成本远低于 7 路 `refreshAll`。

**指纹同步约束（二次评审补，缺失将导致短路失效）**：`refreshAll` 成功后必须用同一公式写回 `lastStatusFingerprint`；否则每次手动/轮询刷新后的第一个 watch 事件都会因指纹过期而触发一次冗余 `refreshAll`。同理 `setCurrentRepo` 时置 `lastStatusFingerprint = ""` 强制首次全量。

**测试**：`silentDiffRefresh` 的状态迁移进 `tests/repoStore.test.ts`（mock gitAPI：第一次 status 返回 A 触发刷新、第二次返回相同 A 不再刷新）；`statusFingerprint` 纯函数用例进 `tests/domain.test.ts`；`RepoWatcher` 在 `tests/watcher.test.ts` 用临时目录真实 `fs.watch` 验证去抖与重挂。

***

### 3.2 双画布分层渲染

**动机**：悬停/选区等交互态变化目前触发全量重绘（含所有可见边/节点/文本）。分层后交互帧成本从 O(可见节点) 降为 O(1)。

**改动**：

1. `CommitGraph.tsx` 渲染两个绝对定位堆叠的 `<canvas>`：`graph-canvas-base`（静态层）与 `graph-canvas-overlay`（交互层）；
2. `GraphRenderer` 构造函数改为 `constructor(base: HTMLCanvasElement, overlay: HTMLCanvasElement)`；
3. 职责划分：

| 层       | 内容                      | 重绘触发                                                |
| ------- | ----------------------- | --------------------------------------------------- |
| base    | 背景、边、节点圆、提交文本、分支标签、计数信息 | `setData` / 滚轮 / 缩放 / resize / 主题切换                 |
| overlay | 悬停环、选区环、搜索高亮环           | `handleMouseMove` / `setSelected` / `setHighlights` |

4. overlay 重绘前 `clearRect` 全清，仅绘制至多 1 个悬停环 + 1 个选区环 + N 个可见高亮环；
5. **事件层归属（二次评审补）**：overlay 位于顶层，所有指针事件监听（wheel/mousedown/mousemove/mouseup/mouseleave/contextmenu）改挂在 overlay 上；base 不设 `pointer-events`。两 canvas 均 `position: absolute; inset: 0`，`handleResize` 需同时同步两层的 backing store 与 transform；
6. 近底检测（`onNearBottom`）保留在 base 渲染流程中；
7. **自评审修订点**：主题切换通过 CSS 变量影响两层配色，`setTheme` 必须同时触发 base 全量重绘与 overlay 重绘（原方案遗漏 overlay，已补）。

**兼容性**：`tests/canvasRenderer.test.ts` 的 fake canvas 工厂扩展为双 canvas；构造失败（任一 context 为 null）仍抛同一错误契约。

***

### 3.3 命令面板（Ctrl+K）

**新组件 `src/components/CommandPalette.tsx`**（约 150 行，无依赖）：

* 触发：`Ctrl+K`（App.tsx 全局键位），模态浮层，输入框自动聚焦；

* 数据源（扁平化合并为 `CommandItem { id, label, hint?, run }`）：

  1. 仓库列表（`repos`）→ 切换当前仓库；
  2. 本地分支（`branches`）→ checkout（**二次评审更正**：repoStore 现有 action 仅 `checkoutRemote`，不存在 `checkoutBranch`；本项需在 store 新增 `checkoutBranch(branch)` action，仿照 `checkoutRemote` 的 loading/error/refreshAll 编排，底层走 `gitApi().checkout`，供命令面板与 Sidebar 共用）；
  3. 固定命令：刷新、全部暂存、全部取消暂存、打开设置、切换主题、切换语言；

* 过滤：`label.toLowerCase().includes(q)`，上限渲染 50 条（无需虚拟化）；

* 键盘：`↑/↓` 移动、`Enter` 执行、`Esc` 关闭；

* 与图谱 `Ctrl+F` 搜索不冲突（作用域不同）。

**测试**：jsdom 组件测试——注入 store 状态后断言过滤结果与 Enter 执行回调。

***

### 3.4 内置轻量三向合并器

**定位**：只做「逐块取左/取右/手工编辑」的最小合并器，不做语法树级合并。

**数据流**：

```
冲突文件 ──readWorkingFile──▶ 解析冲突标记（新 domain 模块 conflictMarker.ts）
        ──git show :2:file──▶ ours 版本        ┐
        ──git show :3:file──▶ theirs 版本      ├─▶ MergePanel 三栏
        ──git show :1:file──▶ base 版本（可选） ┘
完成 ──git:write-file（新通道）──▶ 写回工作区 ──stage──▶ refreshAll
```

**新增**：

1. `src/domain/diff/conflictMarker.ts`（纯函数）：

```ts
export interface ConflictBlock {
  before: string[];               // 冲突块之前的普通行
  ours: string[]; theirs: string[]; base?: string[];
}
/** 解析带 <<<<<<< / ======= / >>>>>>> 标记的文件内容；diff3 风格时含 ||||||| 段。 */
export function parseConflictMarkers(content: string): { blocks: ConflictBlock[]; hasConflicts: boolean }
```

需同时支持 `merge.conflictStyle = merge | diff3`（`|||||||` 段可选）。

2. `gitRepository.ts`：

   * `async showStage(repoPath, stage: 1|2|3, filePath)` → `git show :{stage}:{filePath}`（stage 2 = ours，3 = theirs，1 = base）；

   * `async writeWorkingFile(repoPath, filePath, content)`：`fs.writeFileSync(path.join(repoPath, filePath), content)`，**前置校验 filePath 不含 `..` 段且解析后仍在 repoPath 内**（与 `readWorkingFile` 对齐并强化）；
3. IPC：`git:show-stage`、`git:write-file`；GitAPI/preload 同步；
4. UI：`src/components/MergePanel.tsx`——三栏（base 可折叠），每个冲突块提供「取左/取右/两者都留」按钮，底部「保存并标记已解决」（write + stage）；FilePanel 冲突文件的「解决」按钮改为：内置面板优先，面板打开失败（二进制/超大文件 > 512KB）时回退现有 mergetool 入口。
5. **二进制/体积检测机制（二次评审补，原方案只定义了阈值未定义检测手段）**：`readWorkingFile` 返回前增加 `fs.statSync` 体积检查（> 512KB 抛特定错误码）与首 8KB NUL 字节探测（二进制直接拒绝），MergePanel 捕获后回退 mergetool；不新增通道。
6. **行尾保留（二次评审补）**：`writeWorkingFile` 写入前探测原文件的换行风格（CRLF/LF），按原风格序列化，避免解决冲突后引入整文件行尾变更的脏 diff。

**测试**：`parseConflictMarkers` 的 merge/diff3/无冲突/嵌套假标记用例进 `tests/domain.test.ts`；`showStage`/`writeWorkingFile` 真实 git 冲突场景进 `tests/gitRepository.test.ts`（复用现有「制造冲突」测试夹具）；路径穿越用例（`../../etc/passwd`）断言抛错。

***

### 3.5 Stash 内容预览

**现状**：Sidebar 的 stash 列表仅有 pop/drop，无法查看内容。

**实现**：`gitRepository.ts` 新增

```ts
async stashDiff(repoPath: string, ref: string): Promise<string> {
  // ref 形如 stash@{0}；--root 兼容首提交仓库
  return this.git(repoPath).raw(["diff", `${ref}^`, ref, "--"]);
}
```

> 自评审修订：初稿写作 `git diff ref^1 ref`，对仅含 untracked 的 stash（`-u`）不完整；改为 `stash show -p` 语义等价形式并补充 untracked 场景说明——untracked 部分存于 `stash@{n}^3`，首版预览只覆盖 tracked 变更并在 UI 标注「不含未跟踪文件」，避免过度承诺。

**UI**：Sidebar stash 条目点击后展示 diff。现有 `DiffPanel` 的 readOnly 模式由 `selectedDiffFile.commitHash/fromRef` 派生（见 `DiffPanel.tsx#L47`），而 stash 预览需要直接消费一段现成的 diff 文本，因此需小改：`selectedDiffFile` 类型增加可选 `rawDiff?: string` 字段，`DiffViewer` 在 `rawDiff` 存在时优先渲染它、跳过 IPC 取 diff 的分支，readOnly 自动生效。解析仍走现有 `parseDiff`。新 IPC：`git:stash-diff`。

***

## 4. P2 候选池（按需启动，仅定义边界）

| 项        | 边界定义                                                                                                               | 启动条件          |
| -------- | ------------------------------------------------------------------------------------------------------------------ | ------------- |
| Worktree | `worktree add/list/remove` 三通道 + Sidebar 区块；不做跨 worktree 状态聚合                                                      | 出现真实用户需求      |
| 补丁导出     | `git format-patch -o <tmp>` 包装 + 系统保存对话框；导入走 `git am`                                                              | 有 review 流转诉求 |
| LFS 最小支持 | 仅识别 pointer 文件（首行 `version https://git-lfs...`），DiffPanel 显示「LFS 对象（size）」占位；不做拉取/推送管理                             | 用户报告 LFS 仓库乱码 |
| 增量布局     | `buildGraphData(entries, frozenLanes: Map<hash, lane>)` append 模式，先在 `tests/graph.test.ts` 固化「追加分页不改变既有节点 lane」不变量 | 出现 5 万+提交仓库   |
| 文件列表虚拟化  | FilePanel 自实现窗口化（按 scrollTop 计算可见区间，约 40 行），不引入库                                                                   | 变更文件 > 500 卡顿 |

## 5. 非目标（明确不做）

1. Jira / PR 深度集成 —— 现有托管平台链接（`hostingUrl`）兜底；
2. 可配置快捷键系统 —— 固定键位 + 只读速查表；
3. 插件体系、Mercurial 支持、多窗口多标签页；
4. 任何新的运行时第三方依赖（图表库、虚拟列表库、chokidar）；
5. 完整 Git LFS 生命周期管理。

## 6. 测试与验收标准

| 层级   | 新增测试                                                                        | 归属文件                             |
| ---- | --------------------------------------------------------------------------- | -------------------------------- |
| 域逻辑  | `statusFingerprint`、`parseConflictMarkers`                                  | `tests/domain.test.ts`           |
| 主进程  | `checkoutFile`、`showStage`、`writeWorkingFile`（含路径穿越/二进制拒绝/行尾保留）、`stashDiff` | `tests/gitRepository.test.ts`    |
| IPC  | 各新 git 通道 + `repo:watch`/`repo:unwatch` 成功/失败信封（watcher 注入 fake）            | `tests/ipc.test.ts`              |
| 应用层  | `silentDiffRefresh` 短路语义、`refreshAll` 后指纹同步、`checkoutBranch` action         | `tests/repoStore.test.ts`        |
| 组件   | 右键菜单项（经 canvasStub 触发）、命令面板过滤/执行、MergePanel 块操作                             | `tests/components.test.tsx`      |
| 渲染   | measureText/日期缓存命中、双画布分层重绘边界                                                | `tests/canvasRenderer.test.ts`   |
| 共享夹具 | jsdom canvas 桩（`HTMLCanvasElement.prototype.getContext`）                    | `tests/helpers/canvasStub.ts`（新） |
| 监视   | `RepoWatcher` 去抖/重挂（真实 fs.watch，临时目录）                                       | `tests/watcher.test.ts`（新）       |

**性能验收指标（二次评审补，原方案缺失量化门槛）**：

| 指标                      | 门槛                          | 验证方式                                     |
| ----------------------- | --------------------------- | ---------------------------------------- |
| 空闲仓库（无外部变更）每分钟全量刷新次数    | 0（仅廉价 status+log 探测）        | watcher 集成测试 + 手工验证                      |
| 悬停单帧 overlay 重绘         | < 5ms（1k 节点仓库）              | Performance API 手工 profile，写入验收记录        |
| 外部提交到图谱更新延迟             | < 1.5s（watch 500ms 去抖 + 刷新） | 手工验证                                     |
| 10k 提交 `buildGraphData` | 不回归（相对基线 ±10%）              | tests/graph.test.ts 可选基准用例（宽松阈值避免 CI 抖动） |

验收门槛：`npm run check` 全绿；`tests/preload.test.ts` 的通道抽查清单补入全部新通道；`wiki/IPC-API.md`、README/README\_zh 功能列表、CHANGELOG.md 同步。

## 7. 里程碑与工作量估算

| 里程碑      | 内容                         | 估算    |
| -------- | -------------------------- | ----- |
| M1（P0）   | 右键菜单、渲染缓存、checkoutFile、快捷键 | 2–3 周 |
| M2（P1-a） | fs.watch 增量刷新、双画布、命令面板     | 3–4 周 |
| M3（P1-b） | 三向合并器、stash 预览             | 3 周   |
| P2       | 按启动条件滚动排期                  | —     |

依赖关系：M2 的 `silentDiffRefresh` 是 M3 合并器「保存后刷新」路径的受益方，但两者无强依赖；2.1 的 `RefNameDialog` 抽取须先于命令面板的分支操作复用。

## 8. 受影响文件总览

```
electron/   main.ts（watcher 装配）  gitRepository.ts  ipc.ts（IpcDeps+watcher）
            preload.ts（镜像新通道）  watcher.ts(新)
src/types/  index.ts（GitAPI + compareBase + selectedDiffFile.rawDiff）
src/domain/ files/fingerprint.ts(新)  diff/conflictMarker.ts(新)
src/application/ repoStore.ts（compareBase / selectedFiles / checkoutBranch /
                silentDiffRefresh / lastStatusFingerprint / watch 接线）
src/renderer/ canvasRenderer.ts（双缓存 + 双画布）
src/components/ CommitGraph.tsx  FilePanel.tsx  Sidebar.tsx  SettingsDialog.tsx
                RefNameDialog.tsx(新)  CommandPalette.tsx(新)  MergePanel.tsx(新)
src/i18n/   en.ts  zh.ts（成对新增，约 45 键：菜单 16 + 面板/合并器/快捷键约 29）
tests/      上述 7 个测试文件扩展 + watcher.test.ts(新) + helpers/canvasStub.ts(新)
wiki/       IPC-API.md  Canvas-Renderer.md  Components.md
根目录      CHANGELOG.md  README.md  README_zh.md
```

***

## 附录 A：关键决策记录（ADR 摘要）

| # | 决策                                                    | 理由                                                            | 被否替代                        |
| - | ----------------------------------------------------- | ------------------------------------------------------------- | --------------------------- |
| 1 | 文件监视用原生 `fs.watch` + 30s 轮询兜底，不用 chokidar             | 零依赖；watch 句柄失效有兜底                                             | chokidar（新依赖）               |
| 2 | 刷新短路用「status 指纹 + HEAD hash」而非单一 rev-parse HEAD       | 指纹覆盖 index/工作区变化维度，HEAD hash 覆盖 detached 提交；单一 hash 会漏掉纯工作区改动 | rev-parse HEAD 比较           |
| 3 | 合并器只支持「取左/取右/都留」                                      | 覆盖 80% 冲突场景，避免自研 diff3 算法                                     | 完整三向自动合并                    |
| 4 | 双画布而非 OffscreenCanvas/Worker                          | 兼容性好（无需降级路径），改造面小                                             | OffscreenCanvas + worker 渲染 |
| 5 | 命令面板不做模糊匹配算法                                          | 子串匹配已够用，避免引入 fzf 类库                                           | fuse.js                     |
| 6 | 日期/度量缓存放渲染端而非 `GraphNode.dateStr`（二次评审改判）             | 日期格式化是展示关注点，下沉会污染 domain 层与共享类型契约                             | 初稿的 domain 预计算方案            |
| 7 | 图谱菜单「签出此提交」走 `git:batch-checkout` 而非裸 checkout（二次评审补） | 脏工作区直接 checkout 会失败或丢改动；batch 通道已有自动 stash/restore            | 裸 `git:checkout`            |

## 附录 B：自评审修订记录（第 1 轮）

| #  | 发现的问题                                                                                            | 修订                                                                             |
| -- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1  | 初稿 fs.watch 方案只监视 `.git/HEAD` 与 `.git/index`，遗漏 refs 目录，且未处理 index 文件被原子替换导致句柄失效                 | 增加 refs 目录递归监视；增加 error 事件重挂；保留 30s 轮询兜底（见 3.1）                                |
| 2  | 初稿 stash 预览用 `git diff ref^1 ref`，对含 untracked 的 stash（`-u`）不完整                                  | 改为明确的 tracked-only 语义并在 UI 标注边界（见 3.5）                                         |
| 3  | 初稿双画布方案未定义主题切换时 overlay 的重绘时机                                                                    | 补充 `setTheme` 双层重绘约束（见 3.2 修订点 6）                                              |
| 4  | 初稿 `checkoutFile` 未说明与 `readWorkingFile` 在路径安全处理上的差异                                             | 补充「不做路径拼接、参数直传 git」的安全标注（见 2.3）                                                |
| 5  | 初稿 `writeWorkingFile` 未定义路径穿越防护                                                                  | 补充 `..` 段与解析边界校验（见 3.4）                                                        |
| 6  | 初稿 i18n 键数未量化、受影响文件未列全                                                                           | 补第 8 节文件总览与各节键数（约 40 键）                                                        |
| 7  | 初稿未说明 `statusFingerprint` 对「HEAD 变了但 status 相同」场景是否漏刷；初稿结论「分支名必变」在 detached HEAD 下不成立            | 指纹改为 status 指纹 + HEAD hash 拼接（多一个单提交 log 廉价调用），彻底覆盖 detached HEAD 新提交场景（见 3.1） |
| 8  | 第 8 节文件总览误写 `preload.ts` 无需改动；实际每个新 IPC 通道都需在 preload 增加镜像转发                                     | 更正为「镜像新通道」（见第 8 节）                                                             |
| 9  | 初稿 stash 预览声称「复用 DiffPanel readOnly 模式」，但 readOnly 实际由 `commitHash/fromRef` 派生，stash diff 场景无法触发 | 改为 `selectedDiffFile.rawDiff` 字段扩展方案（见 3.5）                                    |
| 10 | 初稿未指出 FilePanel 已存在 cherry-pick/revert 入口，存在两套确认文案重复实现的风险                                        | 2.1 补充「复用同一组确认文案与 runOp 流程」约束                                                  |

## 附录 C：二次评审修订记录（第 2 轮）

> 二次评审维度：技术可行性与风险 / 需求完整性与一致性 / 测试策略充分性 / 性能影响合理性 / 架构兼容性。以下每条均经代码核对。

| #  | 维度  | 发现的问题                                                                                                                          | 修订                                                                                                     |
| -- | --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1  | 可行性 | §3.3 引用「store 已有 `checkoutBranch` 流程」，但核对 `repoStore.ts` 确认该 action **不存在**（仅有 `checkoutRemote`），本地分支切换目前分散在组件内直调 gitApi       | 更正为「新增 `checkoutBranch` action」，并指明仿照 `checkoutRemote` 编排（见 3.3、§6）                                    |
| 2  | 测试  | §2.1 测试方案含「若桩成本过高则降级」的模糊分支；且 jsdom 中 canvas 2d context 为 null，CommitGraph 会吞掉构造错误，右键菜单无法经 UI 触发                                | 定案为共享夹具 `tests/helpers/canvasStub.ts` 桩 `getContext`，删除降级选项（见 2.1、§6）                                  |
| 3  | 完整性 | §3.1 未要求 `refreshAll` 成功后回写指纹——缺失将导致每次刷新后的首个 watch 事件触发冗余全量刷新，短路机制实际失效                                                         | 新增「指纹同步约束」：refreshAll 成功回写、setCurrentRepo 置空（见 3.1）                                                    |
| 4  | 完整性 | watcher 目标遗漏 `.git/packed-refs`（分支被 pack 后 refs 目录无事件）；未说明 Linux 对 recursive watch 的 Node 版本要求；未定义 IpcDeps/main.ts 装配与仓库切换生命周期 | 监视目标补 packed-refs；补平台兼容性说明（Electron 36 内置 Node 22 满足）；补装配与 `setCurrentRepo` watch/unwatch 时序（见 3.1、§8） |
| 5  | 可行性 | §2.1「签出此提交」用裸 `git checkout <hash>`，脏工作区下会失败或丢失未提交改动                                                                           | 改为强制走已有 `git:batch-checkout`（自动 stash/restore），新增 ADR #7（见 2.1）                                        |
| 6  | 架构  | §2.2 将 `dateStr` 写入 `GraphNode`/domain 层，属展示关注点下沉，污染共享类型契约                                                                     | 改判为渲染端双缓存（dateStrCache + textWidthCache），domain 层不动，新增 ADR #6（见 2.2）                                   |
| 7  | 性能  | textWidthCache 超限 `clear()` 会造成缓存全量颠簸                                                                                          | 改为按插入序淘汰最早一半（见 2.2）                                                                                    |
| 8  | 可行性 | §3.4 只定义了二进制/>512KB 回退阈值，未定义检测手段；`writeWorkingFile` 未考虑 CRLF 行尾保留，可能引入整文件脏 diff                                                | 补 stat + NUL 探测机制（复用 readWorkingFile，不新增通道）与行尾保留约束（见 3.4）                                              |
| 9  | 测试  | §6 缺 `repo:watch/unwatch` 通道测试、`checkoutBranch` action 测试、`refreshAll` 指纹同步测试；验收无量化性能指标；文档同步遗漏 CHANGELOG                       | 测试矩阵补齐三行 + 性能指标表（空闲零全刷/悬停<5ms/延迟<1.5s/布局不回归）+ CHANGELOG（见 §6）                                          |
| 10 | 完整性 | §3.2 未定义双画布的事件归属与层叠细节（overlay 顶层接收指针事件、两 canvas 绝对定位、resize 需同步双层 backing store）                                               | 补事件层归属条款（见 3.2 条款 5）                                                                                   |

