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
