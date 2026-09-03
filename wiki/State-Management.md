# State Management

## Overview

ZenTree uses **Zustand 5** for global state management. A single store (`useRepoStore`) holds all application state and actions, defined in `src/application/repoStore.ts`.

## Store Shape

```typescript
interface AppState {
  // Repository management
  repos: RepoInfo[];              // All added repositories
  currentRepo: string | null;     // Active repo path
  repoError: string | null;

  // Tabs
  customTabs: string[];           // The user's own tab set (repo paths), persisted as "tabs"
  groupView: GroupTabView | null; // A repo group shown as tabs; in-memory only
  showTabPicker: boolean;         // Ctrl+P overlay
  repoCache: Record<string, RepoSnapshot>;  // Per-repo data, painted on switch
  refreshSeqByRepo: Record<string, number>; // Per-repo in-flight refresh token

  // Branch state
  branches: string[];             // Local branches
  remoteBranches: string[];       // Remote branches (remotes/...)
  currentBranch: string;

  // Commit log & graph
  logEntries: CommitLogEntry[];   // Loaded commit entries
  graphData: GraphData;           // Computed graph (nodes, edges, lanes)
  logSkip: number;                // Pagination offset
  hasMoreCommits: boolean;        // Whether more pages exist
  loadingMore: boolean;

  // Selection
  selectedCommit: string | null;
  commitDetail: CommitDetail | null;
  selectedDiffFile: { path: string; isStaged: boolean; commitHash?: string } | null;

  // Working directory
  status: GitStatusData | null;

  // UI state
  themePreset: string;
  isDark: boolean;
  language: string;
  loading: boolean;
  loadingMessage: string;
  error: string | null;
  showSettings: boolean;

  // Actions (see below)
  ...
}
```

## Key Actions

| Action | Description |
|--------|-------------|
| `addRepo(path, name)` | Add a repository to the list (deduplicates) |
| `removeRepo(path)` | Remove repo; clears `currentRepo` if it was active |
| `setCurrentRepo(path)` | Switch active repository |
| `setLogEntries(entries)` | Replace log + rebuild graph data |
| `appendLogEntries(entries)` | Append page + rebuild graph (lazy load) |
| `loadMoreCommits()` | Fetch next 200 commits from IPC |
| `selectCommit(hash)` | Set selected commit, clear detail |
| `setThemePreset(name)` | Apply theme CSS vars + persist setting |
| `checkoutRemote(branch)` | Checkout remote branch with tracking |
| `refreshAll(repoPath?)` | Full refresh: branches + log + status |
| `openTab(path)` | Make a repository a tab (if it is not one) and activate it |
| `closeTab(path)` | Remove a tab and activate its neighbour |
| `activateTab(path)` | Switch to an existing tab, painting the cache first |
| `cycleTab(delta)` | Move to the next/previous tab, wrapping around |
| `reorderTabs(from, to)` | Move a tab within the visible tab set |
| `enterGroupView(name)` | Replace the tab set with a snapshot of a group's members |
| `exitGroupView()` | Return to `customTabs` |

## Repository Tabs

Tabs are **decoupled from the repository list**: a tab is a bare path, and its label is derived at render time (`RepoInfo.name` when the repository is known, otherwise the path's last segment via `repoDisplayName`). That is what lets repo-group members — which are stored as raw paths and need not be known repositories — appear as tabs.

Two tab sets exist, and exactly one is visible:

```
visibleTabs = groupView ? groupView.tabs : customTabs
```

- `customTabs` is persisted to the `tabs` setting on every change and restored on startup.
- `groupView` is a **snapshot** taken when the group is opened: editing the group afterwards does not move the tab bar, and opening/closing/reordering tabs while a group is showing is discarded on exit. Group view is one level deep — there is no nesting.

`activateTab(path)` is the single switch point:

1. `setCurrentRepo(path)` — clears selection state, persists `lastRepo`, re-hooks the singleton file watcher;
2. clears per-repository navigation state (`viewRef`, and every data slice) so the previous repository never stays on screen;
3. restores `repoCache[path]` when present — the UI paints before git answers;
4. `refreshAll(path, silent = hasCache)` — a silent refresh when something is already painted.

Selection state (`selectedCommit`, `commitDetail`, `selectedDiffFile`, `selectedFiles`) is deliberately **not** cached: it is cleared on every switch, because caching it would mean caching diff contents too.

`refreshAll` writes its result into `repoCache[repo]` and only touches the visible slices while `repo` is the active tab, so refreshing a background repository can never overwrite what is on screen. Its race token is per repository (`refreshSeqByRepo`): a slow answer for tab A still lands in A's cache after the user moved to tab B, instead of being dropped or misapplied.

## Graph Data Construction

The `buildGraphData()` function converts flat `CommitLogEntry[]` into renderable `GraphData`:

```
CommitLogEntry[] → Lane Assignment → GraphNode[] + GraphEdge[]
```

**Algorithm:**
1. Build a `hash → index` map for O(1) parent lookup
2. For each commit, find its lane by checking if any child already occupies a lane
3. If no child lane found, allocate the first free column (or a new one)
4. Compute `(x, y)` coordinates from lane index and row index
5. Assign color via deterministic hash → palette mapping
6. Build edges from each commit to its parents using node positions

**Constants:**
- `ROW_HEIGHT = 28` px between commits
- `LANE_WIDTH = 22` px between parallel branches

## Theme Application

`applyTheme(preset)` sets CSS custom properties on `document.documentElement`:

```typescript
for (const [key, value] of Object.entries(preset.colors)) {
  root.style.setProperty(key, value);  // e.g. --bg-primary: #1a1b26
}
root.setAttribute("data-theme", preset.isDark ? "dark" : "light");
```

## Usage Pattern

Components subscribe to specific slices for minimal re-renders:

```typescript
const currentRepo = useRepoStore((s) => s.currentRepo);
const branches = useRepoStore((s) => s.branches);
```

Non-React code (e.g., canvas callbacks) accesses the store imperatively:

```typescript
useRepoStore.getState().selectCommit(hash);
```
