---
kind: build_system
name: Electron + Vite 构建与打包系统
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - vite.config.ts
    - tsconfig.json
    - tsconfig.main.json
    - electron/main.ts
    - electron/preload.ts
---

ZenTree 采用 Electron + Vite React 的混合架构，通过 npm scripts 串联 TypeScript 编译、Vite 前端构建与 electron-builder 打包流程。