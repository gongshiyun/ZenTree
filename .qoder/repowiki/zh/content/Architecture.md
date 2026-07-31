# 架构

<cite>
**本文引用的文件**   
- [electron/main.ts](file://electron/main.ts)
- [electron/preload.ts](file://electron/preload.ts)
- [src/renderer/canvasRenderer.ts](file://src/renderer/canvasRenderer.ts)
- [src/application/repoStore.ts](file://src/application/repoStore.ts)
- [src/components/CommitGraph.tsx](file://src/components/CommitGraph.tsx)
- [src/components/DiffPanel.tsx](file://src/components/DiffPanel.tsx)
- [src/components/FilePanel.tsx](file://src/components/FilePanel.tsx)
- [src/App.tsx](file://src/App.tsx)
- [src/main.tsx](file://src/main.tsx)
- [package.json](file://package.json)
- [wiki/IPC-API.md](file://wiki/IPC-API.md)
- [wiki/Canvas-Renderer.md](file://wiki/Canvas-Renderer.md)
- [wiki/State-Management.md](file://wiki/State-Management.md)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能考量](#性能考量)
8. [故障排查指南](#故障排查指南)
9. [结论](#结论)

## 简介
本文件面向“高层系统设计”，聚焦双进程架构、IPC 数据流、模块边界与关键设计决策（Canvas 替代 SVG、Zustand 替代 Redux、simple-git 替代 nodegit），并阐述安全模型。文档以仓库现有实现为依据，结合 wiki 中的说明进行系统化梳理，帮助读者快速把握整体结构与运行方式。

## 项目结构
- Electron 主进程：负责系统级能力与 Git 操作，通过 preload 暴露安全的 IPC API。
- React 渲染进程：基于 Vite + TypeScript 构建，使用 Zustand 管理状态，Canvas 2D 绘制提交图，组件化 UI。
- Wiki 文档：包含 IPC、Canvas 渲染、状态管理等专题说明。

```mermaid
graph TB
subgraph "Electron 主进程"
Main["main.ts"]
Preload["preload.ts"]
end
subgraph "渲染进程React"
App["App.tsx"]
MainTSX["main.tsx"]
RepoStore["repoStore.ts"]
CommitGraph["CommitGraph.tsx"]
DiffPanel["DiffPanel.tsx"]
FilePanel["FilePanel.tsx"]
CanvasRenderer["canvasRenderer.ts"]
end
subgraph "外部库"
SimpleGit["simple-git"]
Zustand["Zustand"]
Vite["Vite"]
end
Main --> Preload
Preload --> |contextBridge| RepoStore
App --> RepoStore
CommitGraph --> CanvasRenderer
DiffPanel --> RepoStore
FilePanel --> RepoStore
RepoStore --> |调用| Main
RepoStore --> SimpleGit
App --> Zustand
MainTSX --> App
```

**图表来源**
- [electron/main.ts](file://electron/main.ts)
- [electron/preload.ts](file://electron/preload.ts)
- [src/App.tsx](file://src/App.tsx)
- [src/main.tsx](file://src/main.tsx)
- [src/application/repoStore.ts](file://src/application/repoStore.ts)
- [src/components/CommitGraph.tsx](file://src/components/CommitGraph.tsx)
- [src/components/DiffPanel.tsx](file://src/components/DiffPanel.tsx)
- [src/components/FilePanel.tsx](file://src/components/FilePanel.tsx)
- [src/renderer/canvasRenderer.ts](file://src/renderer/canvasRenderer.ts)
- [package.json](file://package.json)

**章节来源**
- [package.json](file://package.json)
- [wiki/IPC-API.md](file://wiki/IPC-API.md)
- [wiki/Canvas-Renderer.md](file://wiki/Canvas-Renderer.md)
- [wiki/State-Management.md](file://wiki/State-Management.md)

## 核心组件
- 主进程（main.ts）
  - 职责：启动应用窗口、注册 IPC 通道、封装 simple-git 调用、处理文件系统与 Git 命令。
  - 关键点：仅暴露必要方法；错误统一返回；避免直接暴露 Node 原生 API。
- 预加载脚本（preload.ts）
  - 职责：通过 contextBridge 暴露 window.gitAPI，限定可访问的 IPC 方法与参数类型。
  - 关键点：最小权限原则，白名单式暴露。
- 状态管理（repoStore.ts）
  - 职责：维护仓库元信息、提交列表、选中文件、差异结果等；协调 UI 更新。
  - 关键点：使用 Zustand 订阅/派发；将 Git 操作与 UI 解耦；提供持久化或缓存策略接口。
- 渲染器（canvasRenderer.ts）
  - 职责：在 Canvas 2D 上绘制提交图，支持视口裁剪、缩放、滚动。
  - 关键点：批量绘制、离屏缓冲、按需重绘，保障万级提交流畅度。
- 组件层（CommitGraph.tsx、DiffPanel.tsx、FilePanel.tsx）
  - 职责：分别展示提交图、差异面板、文件树；读取 Zustand 状态并触发用户交互。
  - 关键点：受控组件模式；事件回调回写 store；懒加载大文本差异。

**章节来源**
- [electron/main.ts](file://electron/main.ts)
- [electron/preload.ts](file://electron/preload.ts)
- [src/application/repoStore.ts](file://src/application/repoStore.ts)
- [src/renderer/canvasRenderer.ts](file://src/renderer/canvasRenderer.ts)
- [src/components/CommitGraph.tsx](file://src/components/CommitGraph.tsx)
- [src/components/DiffPanel.tsx](file://src/components/DiffPanel.tsx)
- [src/components/FilePanel.tsx](file://src/components/FilePanel.tsx)

## 架构总览
双进程架构与安全边界：
- 渲染进程无 nodeIntegration，启用 contextIsolation，禁止直接访问 Node/Git。
- 所有 Git 操作经 preload 暴露的 window.gitAPI 转发至主进程，由 main.ts 调用 simple-git。
- 数据流单向：UI → Store → IPC → Main → Git → IPC → Store → UI。

```mermaid
sequenceDiagram
participant UI as "React 组件"
participant Store as "Zustand Store"
participant Bridge as "contextBridge (preload)"
participant Main as "Electron 主进程"
participant Git as "simple-git"
UI->>Store : 用户操作打开仓库/选择提交
Store->>Bridge : 调用 window.gitAPI.<method>(params)
Bridge->>Main : ipcRenderer.invoke("git : <method>", params)
Main->>Git : 执行 Git 命令
Git-->>Main : 返回结果/错误
Main-->>Bridge : 响应结果
Bridge-->>Store : resolve 返回值
Store-->>UI : 状态更新，触发重绘
```

**图表来源**
- [electron/preload.ts](file://electron/preload.ts)
- [electron/main.ts](file://electron/main.ts)
- [src/application/repoStore.ts](file://src/application/repoStore.ts)
- [src/components/CommitGraph.tsx](file://src/components/CommitGraph.tsx)
- [src/components/DiffPanel.tsx](file://src/components/DiffPanel.tsx)
- [src/components/FilePanel.tsx](file://src/components/FilePanel.tsx)

## 详细组件分析

### 双进程与 IPC 数据流
- 入口与初始化
  - 渲染进程入口：main.tsx 挂载 React 应用。
  - 主进程入口：main.ts 创建 BrowserWindow 并加载 preload。
- IPC 契约
  - preload 暴露 window.gitAPI，限定方法名与参数结构。
  - 主进程监听对应 channel，路由到具体 Git 服务函数。
- 错误与日志
  - 主进程捕获异常并返回结构化错误对象；渲染进程统一处理提示。

```mermaid
flowchart TD
Start(["应用启动"]) --> InitMain["主进程初始化<br/>创建窗口/加载 preload"]
InitMain --> InitRender["渲染进程初始化<br/>挂载 React"]
InitRender --> BindStore["绑定 Zustand Store"]
BindStore --> UserAction{"用户操作？"}
UserAction --> |是| CallAPI["调用 window.gitAPI"]
CallAPI --> IPCInvoke["ipcRenderer.invoke(channel, payload)"]
IPCInvoke --> MainHandler["主进程处理器<br/>校验参数/权限"]
MainHandler --> GitCall["simple-git 调用"]
GitCall --> Result{"成功？"}
Result --> |否| ReturnErr["返回错误对象"]
Result --> |是| ReturnData["返回数据"]
ReturnErr --> StoreUpdate["Store 更新错误态"]
ReturnData --> StoreUpdate
StoreUpdate --> UIUpdate["UI 刷新"]
UIUpdate --> End(["结束"])
```

**图表来源**
- [src/main.tsx](file://src/main.tsx)
- [electron/main.ts](file://electron/main.ts)
- [electron/preload.ts](file://electron/preload.ts)
- [src/application/repoStore.ts](file://src/application/repoStore.ts)

**章节来源**
- [wiki/IPC-API.md](file://wiki/IPC-API.md)
- [electron/preload.ts](file://electron/preload.ts)
- [electron/main.ts](file://electron/main.ts)
- [src/application/repoStore.ts](file://src/application/repoStore.ts)

### 模块边界与职责划分
- 渲染进程
  - App.tsx：应用壳、主题与 i18n 配置、全局布局。
  - 组件：CommitGraph.tsx（提交图）、DiffPanel.tsx（差异）、FilePanel.tsx（文件树）。
  - 渲染器：canvasRenderer.ts（Canvas 2D 绘制逻辑）。
  - 状态：repoStore.ts（仓库状态、异步流程编排）。
- 主进程
  - main.ts：IPC 路由、Git 封装、资源路径与打包产物处理。
- 外部依赖
  - simple-git：Git 操作。
  - Zustand：轻量状态管理。
  - Vite：构建与开发体验。

```mermaid
classDiagram
class App {
+初始化主题/i18n
+路由与布局
}
class CommitGraph {
+监听状态变化
+触发 Canvas 重绘
}
class DiffPanel {
+显示差异内容
+分页/懒加载
}
class FilePanel {
+文件树展示
+选择与过滤
}
class CanvasRenderer {
+绘制提交图
+视口裁剪
+缩放/平移
}
class RepoStore {
+仓库元信息
+提交列表
+差异缓存
+IPC 调用封装
}
class MainProcess {
+IPC 路由
+Git 命令封装
}
App --> RepoStore : "订阅状态"
CommitGraph --> CanvasRenderer : "调用绘制"
DiffPanel --> RepoStore : "读取差异"
FilePanel --> RepoStore : "读取文件树"
RepoStore --> MainProcess : "IPC 调用"
```

**图表来源**
- [src/App.tsx](file://src/App.tsx)
- [src/components/CommitGraph.tsx](file://src/components/CommitGraph.tsx)
- [src/components/DiffPanel.tsx](file://src/components/DiffPanel.tsx)
- [src/components/FilePanel.tsx](file://src/components/FilePanel.tsx)
- [src/renderer/canvasRenderer.ts](file://src/renderer/canvasRenderer.ts)
- [src/application/repoStore.ts](file://src/application/repoStore.ts)
- [electron/main.ts](file://electron/main.ts)

**章节来源**
- [src/App.tsx](file://src/App.tsx)
- [src/components/CommitGraph.tsx](file://src/components/CommitGraph.tsx)
- [src/components/DiffPanel.tsx](file://src/components/DiffPanel.tsx)
- [src/components/FilePanel.tsx](file://src/components/FilePanel.tsx)
- [src/renderer/canvasRenderer.ts](file://src/renderer/canvasRenderer.ts)
- [src/application/repoStore.ts](file://src/application/repoStore.ts)
- [electron/main.ts](file://electron/main.ts)

### 关键设计决策

#### Canvas 替代 SVG
- 动机：提交图节点与连线规模可达万级，SVG DOM 开销过大导致卡顿。
- 方案：Canvas 2D 批量绘制、视口裁剪、离屏缓冲、按需重绘。
- 收益：帧率稳定、内存占用可控、交互延迟低。

```mermaid
flowchart TD
A["计算可见区域"] --> B["筛选可见提交节点"]
B --> C["批量绘制连线"]
C --> D["批量绘制节点/标签"]
D --> E["合成最终帧"]
E --> F{"需要更新？"}
F --> |是| A
F --> |否| G["等待下一帧"]
```

**图表来源**
- [src/renderer/canvasRenderer.ts](file://src/renderer/canvasRenderer.ts)
- [wiki/Canvas-Renderer.md](file://wiki/Canvas-Renderer.md)

**章节来源**
- [wiki/Canvas-Renderer.md](file://wiki/Canvas-Renderer.md)
- [src/renderer/canvasRenderer.ts](file://src/renderer/canvasRenderer.ts)

#### Zustand 替代 Redux
- 动机：Redux 样板代码多、学习成本高；Zustand 更简洁、订阅粒度细。
- 方案：单一 store 管理仓库状态，按字段拆分 selector，减少不必要重渲染。
- 收益：开发效率提升、运行时开销更低、调试更直观。

```mermaid
sequenceDiagram
participant UI as "组件"
participant Store as "Zustand Store"
participant Selector as "Selector/派生状态"
UI->>Store : setState / dispatch
Store->>Selector : 计算派生状态
Selector-->>UI : 订阅变更，触发重渲染
```

**图表来源**
- [src/application/repoStore.ts](file://src/application/repoStore.ts)
- [wiki/State-Management.md](file://wiki/State-Management.md)

**章节来源**
- [wiki/State-Management.md](file://wiki/State-Management.md)
- [src/application/repoStore.ts](file://src/application/repoStore.ts)

#### simple-git 替代 nodegit
- 动机：nodegit 编译复杂、体积大；simple-git 轻量、易集成、生态成熟。
- 方案：在主进程封装常用 Git 命令，统一错误码与日志。
- 收益：构建更快、部署更简单、维护成本更低。

```mermaid
flowchart TD
Start(["调用 Git 命令"]) --> Validate["参数校验"]
Validate --> Exec["simple-git 执行"]
Exec --> Ok{"成功？"}
Ok --> |是| Parse["解析输出"]
Ok --> |否| Err["构造错误对象"]
Parse --> Return["返回数据"]
Err --> Return
```

**图表来源**
- [electron/main.ts](file://electron/main.ts)

**章节来源**
- [electron/main.ts](file://electron/main.ts)

### 安全模型
- 渲染进程隔离：nodeIntegration:false、contextIsolation:true，禁止直接访问 Node/Git。
- 最小权限暴露：preload 仅暴露 window.gitAPI 白名单方法，严格参数校验。
- 主进程守卫：对每个 IPC 通道做权限与输入校验，拒绝非法请求。
- 资源访问控制：限制文件系统访问范围，避免越权读取。

```mermaid
sequenceDiagram
participant Renderer as "渲染进程"
participant Preload as "preload.ts"
participant Main as "main.ts"
participant FS as "文件系统/Git"
Renderer->>Preload : window.gitAPI.method(params)
Preload->>Main : ipcRenderer.invoke("git : method", params)
Main->>Main : 校验方法/参数/权限
Main->>FS : 受限访问
FS-->>Main : 结果/错误
Main-->>Preload : 响应
Preload-->>Renderer : 返回结果
```

**图表来源**
- [electron/preload.ts](file://electron/preload.ts)
- [electron/main.ts](file://electron/main.ts)

**章节来源**
- [electron/preload.ts](file://electron/preload.ts)
- [electron/main.ts](file://electron/main.ts)

## 依赖关系分析
- 构建与运行
  - Vite：开发与构建。
  - Electron：双进程框架。
  - React + TypeScript：前端栈。
  - Zustand：状态管理。
  - simple-git：Git 操作。
- 模块耦合
  - 渲染进程与主进程通过 IPC 松耦合。
  - 组件仅依赖 Store，不直接依赖 IPC。
  - Canvas 渲染器独立于 UI 组件，便于复用与测试。

```mermaid
graph LR
Vite["Vite"] --> Build["构建产物"]
Electron["Electron"] --> Runtime["运行时"]
React["React + TS"] --> UI["UI 组件"]
Zustand["Zustand"] --> Store["状态存储"]
SimpleGit["simple-git"] --> GitOps["Git 操作"]
UI --> Store
Store --> IPC["IPC 桥接"]
IPC --> GitOps
```

**图表来源**
- [package.json](file://package.json)
- [src/application/repoStore.ts](file://src/application/repoStore.ts)
- [electron/main.ts](file://electron/main.ts)

**章节来源**
- [package.json](file://package.json)
- [src/application/repoStore.ts](file://src/application/repoStore.ts)
- [electron/main.ts](file://electron/main.ts)

## 性能考量
- 提交图渲染
  - 视口裁剪：仅绘制可见区域，降低绘制量。
  - 批量绘制：合并绘制指令，减少上下文切换。
  - 离屏缓冲：复杂场景下使用离屏 Canvas 缓存。
- 状态更新
  - 细粒度订阅：仅更新受影响组件。
  - 差异缓存：避免重复计算与网络/磁盘 IO。
- I/O 与并发
  - 主进程串行化 Git 命令，避免竞争条件。
  - 大文件差异懒加载与分页。

[本节为通用指导，无需特定文件引用]

## 故障排查指南
- IPC 调用失败
  - 检查 preload 是否暴露对应方法；确认主进程是否监听该 channel。
  - 查看主进程日志与错误对象结构。
- 提交图卡顿
  - 确认视口裁剪逻辑生效；检查是否频繁全量重绘。
  - 评估节点数量与层级深度，必要时增加分页或简化样式。
- 状态不同步
  - 检查 Store 订阅是否正确；确认异步流程未丢失状态更新。
- 权限与安全问题
  - 复核 preload 白名单；验证主进程参数校验与路径限制。

**章节来源**
- [electron/preload.ts](file://electron/preload.ts)
- [electron/main.ts](file://electron/main.ts)
- [src/application/repoStore.ts](file://src/application/repoStore.ts)
- [src/renderer/canvasRenderer.ts](file://src/renderer/canvasRenderer.ts)

## 结论
本系统采用清晰的双进程架构与严格的 IPC 边界，确保安全性与可维护性。通过 Canvas 2D 渲染提交图、Zustand 管理状态、simple-git 封装 Git 操作，实现了高性能与低复杂度的平衡。模块边界明确、数据流单向，便于扩展与优化。建议持续完善错误处理、日志与监控，进一步提升稳定性与可观测性。