---
kind: configuration_system
name: ZenTree 配置系统：Electron 应用设置与 Git 配置管理
category: configuration_system
scope:
    - '**'
source_files:
    - electron/main.ts
    - electron/preload.ts
    - src/components/SettingsDialog.tsx
    - src/stores/repoStore.ts
    - vite.config.ts
    - package.json
---

## 配置系统概述

ZenTree 采用分层配置架构，将应用级设置（持久化存储）与 Git 仓库级配置分离处理，通过 Electron IPC 机制在渲染进程与主进程之间安全传递。

## 核心架构

### 1. 应用设置存储层（Settings Storage）
- **存储位置**：`app.getPath("userData")` + `"zentree-settings.json"`
- **读写方式**：JSON 文件直接读写，使用 try-catch 确保容错
- **关键函数**：`loadSettings()`、`saveSettings()` 位于 `electron/main.ts`
- **IPC 接口**：`settings:get`、`settings:set`、`settings:get-all`

### 2. Git 配置管理
- **读取接口**：`git:get-config` - 获取 user.name 和 user.email
- **写入接口**：`git:set-config` - 设置任意 git config 键值对
- **实现方式**：通过 simple-git 调用 `git config` 命令

### 3. 配置项分类
- **通用设置**：gitPath（Git 可执行文件路径）、language（语言偏好）、themePreset（主题预设）
- **窗口状态**：windowWidth、windowHeight（自动保存窗口大小）
- **Git 用户信息**：userName、userEmail（按仓库隔离）

## 配置加载流程

### 启动阶段
1. Electron 主进程启动时加载 `zentree-settings.json`
2. 创建 BrowserWindow 时应用窗口尺寸设置
3. 渲染进程 App 组件初始化时通过 `getSettings()` 恢复语言设置

### 运行时更新
1. 用户通过 SettingsDialog 修改配置
2. 前端调用 `setSetting(key, value)` 持久化到 JSON 文件
3. 同时更新 Zustand store 中的内存状态
4. 对于 themePreset 和 language，立即应用到 UI

## 配置发现机制

### Git Bash 自动发现（四层策略）
```typescript
// Tier 1: 从用户配置的 gitPath 推导
// Tier 2: 硬编码路径 + 环境变量
// Tier 3: git --exec-path 动态查找
// Tier 4: 扫描 Program Files 目录
```

### Git 二进制路径解析
- 支持 Windows 路径替换规则（`\bin\git.exe` → `\git-bash.exe`）
- 兼容多种安装路径格式
- 失败时抛出明确错误提示

## 配置验证与安全

### 路径验证
- Git 仓库路径必须存在且包含 `.git` 目录
- 所有文件系统操作都经过 `validateRepo()` 检查

### IPC 安全模式
- 所有 IPC 处理器使用 `safeHandler()` 包装
- 统一返回 `{ success: boolean, data?: any, error?: string }` 格式
- 渲染进程禁用 Node.js 集成，仅通过 contextBridge 暴露必要 API

## 配置数据结构

### settings.json 结构示例
```json
{
  "gitPath": "C:\\Program Files\\Git\\cmd\\git.exe",
  "language": "zh",
  "themePreset": "catppuccin-mocha",
  "windowWidth": 1400,
  "windowHeight": 900
}
```

### Git 配置项
- `user.name` - 提交者姓名
- `user.email` - 提交者邮箱
- 支持任意 `git config` 键值对

## 开发环境配置

### Vite 开发服务器
- 端口：5173
- 根目录：项目根目录
- 输出目录：`dist/`
- 别名：`@` → `src/`

### TypeScript 编译配置
- 渲染进程：ES2020 + React JSX
- 主进程：CommonJS + Node.js 模块
- 独立 tsconfig：`tsconfig.json` 和 `tsconfig.main.json`

### 构建脚本
- `dev`: 并行启动 Vite 和 Electron
- `build`: 编译 TypeScript 并构建前端资源
- `pack`: electron-builder 打包多平台安装包

## 配置热更新

### 主题切换
- 通过 CSS 变量动态更新 `document.documentElement.style`
- 同时设置 `data-theme` 属性用于样式选择器
- 无需重新加载页面即可生效

### 语言切换
- 通过 `setGlobalLocale()` 实时更新 i18n 状态
- 配合 Zustand store 实现响应式更新

## 约束与限制

### 强制约束
- 所有 IPC 调用必须通过预加载脚本暴露的 API
- 配置文件损坏时自动回退到空对象
- Git 路径未找到时抛出明确错误消息

### 设计约束
- 不支持命令行参数配置
- 无环境变量注入机制
- 无配置文件版本迁移逻辑
- 无配置导入/导出功能