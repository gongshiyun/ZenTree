---
kind: error_handling
name: ZenTree 错误处理体系：IPC 安全包装与前端状态化错误展示
category: error_handling
scope:
    - '**'
source_files:
    - electron/main.ts
    - src/stores/repoStore.ts
    - src/components/CommitBar.tsx
    - src/components/DiffViewer.tsx
    - src/App.tsx
---

## 1. 系统/方法概述
- Electron 主进程通过 `safeHandler` 高阶函数统一包裹所有 IPC 处理器，将异常捕获并转换为 `{ success: boolean, data?: any, error?: string }` 的统一响应结构，避免未捕获异常直接抛给渲染进程。
- 渲染进程组件通过 Zustand store（`repoStore.ts`）集中管理 `error`、`loading`、`fetchError` 等状态字段，以字符串形式向 UI 呈现错误信息，并通过国际化键（如 `"error.commitFailed"`、`"diff.fetchFailed"`）进行多语言提示。
- 文件系统 I/O（settings 读写、临时 patch 文件清理）使用 try/catch 包裹并以空 catch 体忽略非关键错误，保证核心流程不因可恢复的 IO 失败而中断。

## 2. 关键文件与位置
- `electron/main.ts`：定义 `safeHandler`、Git IPC 处理器、设置存储 I/O 的错误处理逻辑。
- `src/stores/repoStore.ts`：集中式状态管理，包含 `error`、`loading`、`loadingMessage` 等错误相关状态及 `setError`、`setLoading` 等 setter。
- `src/components/CommitBar.tsx`、`src/components/DiffViewer.tsx`：调用 `window.gitAPI` 后根据 `result.success` 分支设置错误到 store 或本地 state。
- `src/App.tsx`：拖拽打开仓库时调用 `setError` 展示无效路径错误。

## 3. 架构与约定
- **IPC 层**：每个 `ipcMain.handle` 的回调都通过 `safeHandler` 包装，成功返回 `{ success: true, data }`，失败返回 `{ success: false, error: err.message || String(err) }`。这保证了渲染进程无需 try/catch 也能获得结构化结果。
- **验证层**：`validateRepo(repoPath)` 对路径存在性与 `.git` 目录进行检查，返回人类可读的错误消息字符串，由调用方决定是否抛出或转为业务错误。
- **资源清理**：涉及临时文件的 IPC（stage/unstage/revert hunk）使用 `try { ... } finally { fs.unlinkSync(tmpFile); }` 模式，并在 finally 内部再次 try/catch 忽略删除失败，确保即使操作失败也不会泄漏临时文件。
- **前端错误传播**：组件在 await 调用 `window.gitAPI.*` 后检查 `result.success`，若为 false 则读取 `result.error` 并通过 `setError` 写入全局 store；若发生未捕获异常则取 `err.message` 作为错误文本。
- **用户反馈**：错误信息同时支持硬编码英文与 i18n 键（如 `t("error.commitFailed")`），UI 通过颜色（如 `var(--danger)`）和布局区分加载态、错误态与正常态。

## 4. 约定与约束
- **IPC 响应契约**：所有 Git 相关 IPC 必须遵循 `{ success: boolean, data?: any, error?: string }` 格式，这是由 `safeHandler` 强制保证的。
- **错误类型**：当前代码库未定义自定义 Error 类或错误码枚举，错误以字符串形式传递（`err.message` 或 `String(err)`），并在 UI 层直接显示。
- **异常策略**：不使用 `throw new Error(...)` 向上冒泡至渲染进程（除 `shell:open-git-bash` 中找不到 Git Bash 时主动抛出，由 `safeHandler` 捕获），而是通过 `success: false` + `error` 字段返回。
- **I/O 容错**：settings 读写、临时文件删除等操作采用“静默失败”策略（catch 体为空注释 `/* ignore */`），表明这些失败不应阻断主流程。
- **状态集中化**：错误状态统一存放在 Zustand store 的 `error` 字段，组件通过 `useRepoStore((s) => s.setError)` 获取 setter，避免分散的 `useState` 错误管理。
- **国际化约束**：用户可见错误文案优先使用 `t("...")` 国际化键，其次 fallback 到英文硬编码字符串，确保多语言一致性。
