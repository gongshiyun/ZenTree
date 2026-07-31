# Changelog

All notable changes to ZenTree are documented in this file.

## [1.3.0] - 2026-08-01

### Features

- **Clone Repository** - Clone a remote repo by URL (Settings > Clone / Welcome screen), with optional branch and live status
- **File History & Blame** - Diff panel tabs: Diff / History / Blame for any file; click a history entry or blame line to open that commit's diff
- **Revert / Cherry-pick / Rebase** - Commit actions in the file panel; rebase current branch onto another branch from the sidebar context menu (with abort support)
- **Compare** - Compare any two branches/tags/commits (ahead/behind counts, per-file add/delete stats, click a file to open its diff)
- **Tags & Remotes** - Create/list/delete tags and add/remove/edit remotes in the sidebar
- **Commit Log Filters** - Filter by message, author and since-date from the top bar
- **Conflict Resolution** - Conflicted files surface in the file panel with a Resolve (mergetool) action; conflict count shown in the status bar
- **Hosting Platform Jump** - Open the repo, branch or commit on GitHub/GitLab/Bitbucket
- **.gitignore Editor** - Edit the repository ignore file from Settings > Git
- **Auto Refresh** - Quiet background refresh every 30s and on window focus

### Testing

- Added Vitest test framework with 35 tests:
  - Git integration tests (real git binary): clone, file history, blame, revert, compare, cherry-pick, rebase + abort, tags, remotes, log filters, conflicts, mergetool, gitignore, core regression
  - Pure unit tests: hosting-URL parsing, diff parser, hunk patch builder, syntax highlight, graph layout
## [1.2.0] - 2026-08-01

### Features

- Added auto-update support (Settings > About > Check for Updates):
  - Checks GitHub Releases for newer versions via `electron-updater`
  - Downloads the new installer with live progress reporting
  - Restart-and-install flow for NSIS builds (Settings > About > Install)
  - Silent update check on startup (packaged builds only)
  - Dev-mode and portable builds are detected and guided to the Releases page
- New `UpdateManager` infrastructure service (`electron/updateManager.ts`) with
  renderer-friendly state snapshots over IPC (`update:*` channels + `update:event`)

### Packaging

- Added `publish` (GitHub provider) configuration for auto-update feed
- Rebuilt release artifacts (NSIS installer + portable exe) for v1.2.0


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