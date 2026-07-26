# Components

## Component Tree

```
App
├── TopBar              # Frameless title bar + toolbar
├── [Welcome]           # Shown when no repo is open
├── Sidebar             # Branch list (left panel)
├── CommitGraph         # Canvas commit DAG (center-top)
├── FilePanel           # Staged/unstaged files (center-bottom)
├── DiffPanel           # Resizable diff container (right)
│   └── DiffViewer      # Hunk-level diff display
├── CommitBar           # Commit message + amend (bottom)
├── StatusBar           # Loading/error bar (very bottom)
└── SettingsDialog      # Modal settings
```

---

## TopBar

**File:** `src/components/TopBar.tsx`

Custom frameless window title bar with:
- Window title ("ZenTree") — click opens Settings
- Repository selector dropdown with search/filter
- Git action buttons: Fetch, Pull, Push, Refresh, Git Bash
- Right controls: Add repo, theme toggle, language toggle, settings gear
- Native window controls: minimize, maximize/restore, close

Uses `WebkitAppRegion: "drag"` for window dragging; interactive elements use `"no-drag"`.

---

## Sidebar

**File:** `src/components/Sidebar.tsx`

Left panel showing:
- Local branches with current-branch indicator (●/○)
- Collapsible remote branches section
- Double-click to checkout
- Right-click context menu (checkout, copy name)
- Resizable width (140–400px) via drag handle

---

## CommitGraph

**File:** `src/components/CommitGraph.tsx`

React wrapper around the `GraphRenderer` canvas engine:
- Initializes `GraphRenderer` on mount with `ResizeObserver`
- Syncs `graphData`, `selectedCommit`, and theme to the renderer
- Handles click → selects commit + fetches commit detail
- Hover → tooltip with hash, author, email, timestamp, subject/body

---

## FilePanel

**File:** `src/components/FilePanel.tsx`

Center-bottom panel with two modes:

**Working directory mode** (no commit selected):
- Tabs: Unstaged / Staged with file counts
- File status icons: `?` untracked, `M` modified, `A` added, `D` deleted, `R` renamed
- Per-file actions: Stage, Unstage, Discard (with confirmation)
- Click file → opens DiffPanel

**Commit detail mode** (commit selected):
- Lists files changed in selected commit
- Click file → shows commit file diff in DiffPanel

---

## DiffPanel

**File:** `src/components/DiffPanel.tsx`

Resizable right panel (260–700px) that renders `DiffViewer` for the selected file. Only visible when `selectedDiffFile` is set in the store.

---

## DiffViewer

**File:** `src/components/DiffViewer.tsx`

Core diff rendering component:
- Fetches diff via `gitAPI.diffFile()` (working dir) or `gitAPI.commitFileDiff()` (commit)
- Parses unified diff into `DiffHunk[]` with line numbers
- Renders color-coded lines: green (addition), red (deletion), neutral (context)
- Per-hunk action buttons:
  - **Stage** — applies hunk patch to index (`git apply --cached`)
  - **Unstage** — reverse-applies from index (`git apply --cached --reverse`)
  - **Revert** — reverse-applies in working dir (`git apply --reverse`)

---

## CommitBar

**File:** `src/components/CommitBar.tsx`

Bottom commit controls:
- Resizable textarea (54–250px height)
- Amend checkbox — auto-fills last commit message via `gitAPI.lastMessage()`
- Commit button (enabled when staged files > 0 or amend is checked)
- `Ctrl+Enter` keyboard shortcut to commit

---

## StatusBar

**File:** `src/components/StatusBar.tsx`

Minimal bottom bar showing:
- Current repo path + branch name
- Loading spinner with message
- Dismissable error message (click or `Esc`)

---

## SettingsDialog

**File:** `src/components/SettingsDialog.tsx`

Modal dialog with three tabs:

| Tab | Contents |
|-----|----------|
| General | Git executable path, language selector |
| Appearance | 10-theme grid with live preview cards |
| Git Config | user.name, user.email (per-repo) |

Saves to `zentree-settings.json` (app settings) and `git config` (user identity).
