# Changelog

All notable changes to ZenTree are documented in this file.

## [1.3.9] - 2026-09-10

### Fixed

- Discarding staged modifications, new files and renames now restores both the index and working tree instead of leaving the staged change behind
- The file panel classifies staged, partially staged and renamed files from per-file index/worktree state, preventing duplicate unstaged rows and missing staged renames
- The diff panel ignores stale responses after switching files, so a slow request can no longer display the wrong diff or apply a hunk to the wrong path
- Working-tree file reads and writes now reject traversal, absolute paths and symlink escapes outside the repository
- Automatic refresh now uses a repository fingerprint covering HEAD, refs, index/worktree changes and untracked file content, so repeated edits and external branch/tag updates are detected
- Commit-graph lane allocation keeps merged branches separate until their common ancestor instead of overlapping them on one lane
- Cancelling Amend restores the user's draft and prevents a late commit-message response from overwriting it
- Hunk stage/unstage/revert patches preserve no-newline markers, fixing operations on files without a trailing newline
- Git Bash discovery correctly resolves `bin\git.exe` and `cmd\git.exe` configurations without returning `git.exe` as the shell

### Testing

- 427 -> 445 tests: staged discard, file-state classification, stale diff responses, path/symlink confinement, repository fingerprints, merge-lane layout, Amend races, no-newline hunks and Git Bash discovery

## [1.3.8] - 2026-09-04

### Features

- **Repository tabs** — a tab strip below the top bar, one tab per repository: click to switch, `×` or middle-click to close, drag to reorder, wheel to scroll the overflow
  - Tabs are decoupled from the saved repository list and their labels are derived (saved name, else the path's last segment), so repo-group members that were never "opened" still display correctly
  - The tab set is persisted (new `tabs` setting) and restored on startup together with the last active tab
- **Tab picker** — `Ctrl+P` searches open tabs and known repositories in one overlay with open tabs ranked first; `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle tabs, `Ctrl+Shift+W` closes the current one
  - `Ctrl+W` is deliberately not bound: Electron's default application menu assigns it to window close, and a renderer `preventDefault` cannot win that race
- **Repo group as tabs** — "Show as tabs" in the repo group dialog replaces the whole tab set with a snapshot of the group's members; the tab bar's back button returns to your own tabs, and edits made while the group is showing are discarded with the snapshot
- **Per-repository data cache** — switching tabs paints the cached snapshot instantly and refreshes silently in the background; the refresh race token is now tracked per repository, so a slow answer can no longer overwrite the repository now on screen

### Changed

- Top bar repository dropdown simplified: the searchable repository list moved to the `Ctrl+P` picker, the trigger is now a read-only repository name, and its `+` menu offers "Open local repository" / "Clone"
- Switching repository now blanks the previous repository's data instead of leaving it on screen until git answers

### Fixed

- The commit message box wiped itself on every keystroke: the amend effect listed `message` as a dependency, so its "unchecking amend clears the box" branch ran on each change. It now runs on the amend toggle and on repository switch only — which also drops a draft when you switch tab, so a message written for one repository can never be committed into another

### Testing

- 335 -> 427 tests: tab domain helpers (`repoDisplayName`, `filterTabs`), tab set / group view / snapshot cache / per-repository sequencing store transitions, `TabBar` and `TabPicker` components, the new App-level shortcuts, and commit-message typing / draft-on-switch regressions

## [1.3.7] - 2026-08-13

### Fixed

- Bitbucket hosting links now use the correct `/commits/<hash>` and `/src/<branch>` paths
- Application-level keyboard shortcuts (`F5`, `Esc`, `Ctrl+K`, `Ctrl+Shift+S/U`, `Delete`) were defined but never attached; they are now wired to the window

### Testing

- 216 -> 335 tests: comprehensive syntax-highlight and diff-parser edge cases, Sidebar/TopBar/RepoGroup/Settings/FilePanel/DiffViewer/CommitGraph interactions, App keyboard shortcuts, and full IPC/preload surface + channel-registration checks
- Added `@vitest/coverage-v8`; statement coverage raised to ~77%, line coverage to ~83%

## [1.3.6] - 2026-08-06

### Features

- **Graph context menu** - right-click a commit for create branch/tag at commit, checkout commit (auto stash & restore), compare from commit, cherry-pick, revert, reset (soft/mixed/hard) and copy hash
- **Command palette** - `Ctrl+K` to search and run repositories, branches and commands
- **Built-in three-way merge panel** - resolve conflicts in-app (take ours / take theirs / keep both), with external mergetool fallback for binary or oversized files
- **Stash preview** - click a stash entry to preview its diff
- **File-level checkout** - restore a single file to any commit from the commit file list
- **Incremental refresh** - an `fs.watch` on git metadata drives silent short-circuited refreshes (status fingerprint + HEAD hash) instead of blind 30s polling
- **New shortcuts** - `Ctrl+Shift+S` / `Ctrl+Shift+U` (stage / unstage all), `Ctrl+click` multi-select + `Delete` (discard selected), shortcut reference in Settings

### Performance

- **Dual-canvas graph renderer** - interaction rings (hover / selection / search highlight) render on a separate overlay layer; text-measure and date-format caches cut per-frame work

### Build

- Fixed Windows packaging: upgraded rcedit to v2.0.0 and added delayed retries so the app icon and version resources are written reliably

### Testing

- 173 -> 216 tests: status fingerprint, conflict-marker parser, checkoutFile / showStage / writeWorkingFile / stashDiff, repo watcher (real `fs.watch`), dual-canvas renderer, command palette, merge panel and graph context menu

## [1.3.5] - 2026-08-02

### Features

- **Repo groups** - create named groups of repositories and switch them all to the same branch in one click
  - Add repositories manually, from the known-repo list, or by scanning a folder for Git repositories (with a native folder picker)
  - Per-run options: fetch, pull after checkout, stash & restore uncommitted changes
  - Per-repo results report (OK / skipped / failed) without blocking the rest of the group
- **Folder browser** - the repo path and scan-folder fields open the native directory picker

### Testing

- 4 new tests (75 total): folder scan discovery, batch branch switch, stash & restore, missing-branch skip

## [1.3.4] - 2026-08-02

### Features

- **Branch rename & upstream tracking** - rename a branch from the context menu; set / unset upstream; branches show their upstream with ahead/behind counts
- **Targeted stash** - stash a single file from the file panel, or stash everything with a message
- **File tree view** - browse changed files by directory (tree / flat toggle, collapsible folders)
- **Conflict operations** - the status bar offers Abort / Continue for in-progress merge, rebase or cherry-pick
- **Pull strategies** - choose merge, rebase or fast-forward-only from the pull menu
- **Submodule management** - list, add, update and remove submodules from Settings
- **Commit template & GPG signing** - edit a per-repo commit template (prefilled in the commit box) and toggle GPG signing
- **External diff tool & word-level diff** - configure a difftool and launch it per file; changed words are highlighted inside diff lines
- **View remote branches** - click a remote branch to show its commit tree in the graph (with a "Viewing" indicator and back button)

### Fixes

- **Commit view crash** - fixed a React hooks ordering bug (error #300) that blanked the UI when opening a commit's file list

### Testing

- 20 new tests (71 total): file tree builder, word diff, branch rename/upstream/ahead-behind, targeted stash, merge abort, rebase continue, pull strategies, submodules, commit template, GPG signing, diff tool config, log by ref

## [1.3.3] - 2026-08-02

### Features

- **Stage / unstage all** - one-click buttons in the file panel (including untracked files)
- **Interactive rebase** - right-click a branch, then pick / reword / squash / fixup / drop commits and reorder them with up/down controls
- **Commit file stats** - each file in a commit shows its +add / -delete line counts
- **Remote branch operations** - push current branch, pull a specific remote branch, delete a remote branch, prune stale branches

### Testing

- 9 new integration tests (51 total): stage/unstage all, commit stats, interactive rebase (squash/drop/reword/reorder), remote push/fetch/pull/delete/prune

## [1.3.2] - 2026-08-01

### Fixes

- **Commit log filters now work** - the IPC bridge dropped filter params, so message/author/since filtering never applied; paged loading also keeps filters active
- **Untracked files show their content** - clicking a new file renders its content as additions instead of an empty diff
- **Renamed files show their diff** - renames pass both old and new paths so git can pair them
- **Diff panel opens at max width** - the content pane defaults to the widest supported size
- **Sidebar remote sections merged** - one "Remotes" section (config + remote branches) instead of two confusingly labelled sections
- **Date/time search fully localized** - a built-in i18n date picker replaces the OS control (year/month/day, weekdays, Today/Clear)
- **Welcome screen** - plain background, no decorative glow

### UI / UX

- **Commit graph** - graph column pinned to the left, no drag-panning; wheel scrolls, Ctrl+wheel zooms, on-canvas zoom controls (- / % / + / 1:1), no blank space above the first commit
- **Commit bar** - "Amend last commit" moved above the commit button (top-right, flush with the bar); unchecking amend clears the message box
- **Settings icon** - proper gear icon
- **New app icon** - black rounded-square with a white Git branch glyph on a transparent background
- Apple-style polish across toolbar, sidebar, dialogs, tooltips and diff view

## [1.3.1] - 2026-08-01

### Changes

- Refresh app icon with Git branch design

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
