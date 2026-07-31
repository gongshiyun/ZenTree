# Changelog

All notable changes to ZenTree are documented in this file.

## [1.1.0] - 2026-08-01

### Architecture

- Restructured the codebase into DDD (Domain-Driven Design) layers:
  - `src/domain/` — pure domain logic (graph layout, diff parsing, theme presets)
  - `src/application/` — application layer (Zustand store + use-case orchestration)
  - `src/infrastructure/` — renderer-side gateway (`gitBridge`)
  - `src/components/` + `src/renderer/` — interface layer
  - `electron/` — main-process infrastructure (Git repository, settings, IPC)
- Tightened module boundaries and dependency direction for maintainability and testability.

### Bug Fixes

- Fixed commit-log infinite scroll not triggering.
- Fixed O(n²) performance issue in staged-file diff computation.
- Fixed deleted files missing from the file tree.
- Fixed renamed files losing their path.
- Fixed untracked files being treated as clean.
- Fixed commit-detail diff viewer display issues.
- Fixed session settings not restored on startup.
- Added race-condition guards around async Git operations.

### Packaging

- Rebuilt release artifacts (NSIS installer + portable exe) for v1.1.0.

## [1.0.0] - 2026-07-27

Initial release:

- Canvas-rendered commit graph with branch labels, zoom/pan and viewport culling
- Hunk-level diff viewer with stage / unstage / revert
- 10 color themes and full English/Chinese i18n with real-time switching
- Repository management, remote branches, Git Bash launcher, drag & drop
- NSIS installer and portable builds