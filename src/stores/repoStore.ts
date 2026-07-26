import { create } from "zustand";
import type { RepoInfo, CommitLogEntry, GraphData, GraphNode, GraphEdge, GitStatusData, CommitDetail, ThemePreset } from "../types";
import { setGlobalLocale } from "../i18n";

// Branch colors
const BRANCH_COLORS = [
  "#e06c75", "#61afef", "#98c379", "#d19a66", "#c678dd",
  "#56b6c2", "#e5c07b", "#be5046", "#7ec8e3", "#c3e88d",
  "#ff79c6", "#bd93f9", "#8be9fd", "#f1fa8c", "#ffb86c",
  "#50fa7b", "#ff5555", "#f8f8f2", "#6272a4", "#44475a",
];

function hashToColor(hash: string, colors: string[]): string {
  let sum = 0;
  for (let i = 0; i < hash.length; i++) sum = (sum * 31 + hash.charCodeAt(i)) | 0;
  return colors[Math.abs(sum) % colors.length];
}

// Theme presets
export const THEME_PRESETS: ThemePreset[] = [
  {
    name: "catppuccin-mocha", label: "Catppuccin Mocha", isDark: true,
    colors: {
      "--bg-primary": "#1a1b26", "--bg-secondary": "#1e1e2e", "--bg-tertiary": "#2a2a3c",
      "--bg-hover": "#313147", "--bg-active": "#3b3b54", "--border-color": "#2e2e42",
      "--text-primary": "#cdd6f4", "--text-secondary": "#a6adc8", "--text-muted": "#6c7086",
      "--text-inverse": "#1e1e2e", "--accent": "#89b4fa", "--accent-hover": "#74c7ec",
      "--success": "#a6e3a1", "--warning": "#f9e2af", "--danger": "#f38ba8", "--danger-hover": "#eba0ac",
    },
  },
  {
    name: "dracula", label: "Dracula", isDark: true,
    colors: {
      "--bg-primary": "#282a36", "--bg-secondary": "#21222c", "--bg-tertiary": "#343746",
      "--bg-hover": "#3c3e52", "--bg-active": "#44475a", "--border-color": "#3e3f55",
      "--text-primary": "#f8f8f2", "--text-secondary": "#cfcfc2", "--text-muted": "#6272a4",
      "--text-inverse": "#282a36", "--accent": "#bd93f9", "--accent-hover": "#ff79c6",
      "--success": "#50fa7b", "--warning": "#f1fa8c", "--danger": "#ff5555", "--danger-hover": "#ff6e67",
    },
  },
  {
    name: "nord", label: "Nord", isDark: true,
    colors: {
      "--bg-primary": "#2e3440", "--bg-secondary": "#3b4252", "--bg-tertiary": "#434c5e",
      "--bg-hover": "#4c566a", "--bg-active": "#545f73", "--border-color": "#434c5e",
      "--text-primary": "#eceff4", "--text-secondary": "#d8dee9", "--text-muted": "#81a1c1",
      "--text-inverse": "#2e3440", "--accent": "#88c0d0", "--accent-hover": "#8fbcbb",
      "--success": "#a3be8c", "--warning": "#ebcb8b", "--danger": "#bf616a", "--danger-hover": "#d06b74",
    },
  },
  {
    name: "one-dark", label: "One Dark Pro", isDark: true,
    colors: {
      "--bg-primary": "#1e2127", "--bg-secondary": "#21252b", "--bg-tertiary": "#2c313a",
      "--bg-hover": "#363b45", "--bg-active": "#404754", "--border-color": "#2c313a",
      "--text-primary": "#abb2bf", "--text-secondary": "#9ba5b3", "--text-muted": "#5c6370",
      "--text-inverse": "#1e2127", "--accent": "#61afef", "--accent-hover": "#56b6c2",
      "--success": "#98c379", "--warning": "#e5c07b", "--danger": "#e06c75", "--danger-hover": "#e3808a",
    },
  },
  {
    name: "tokyo-night", label: "Tokyo Night", isDark: true,
    colors: {
      "--bg-primary": "#1a1b26", "--bg-secondary": "#1f2335", "--bg-tertiary": "#292e42",
      "--bg-hover": "#343b55", "--bg-active": "#3b4261", "--border-color": "#292e42",
      "--text-primary": "#c0caf5", "--text-secondary": "#a9b1d6", "--text-muted": "#565f89",
      "--text-inverse": "#1a1b26", "--accent": "#7aa2f7", "--accent-hover": "#89b4fa",
      "--success": "#9ece6a", "--warning": "#e0af68", "--danger": "#f7768e", "--danger-hover": "#f88da0",
    },
  },
  {
    name: "monokai", label: "Monokai", isDark: true,
    colors: {
      "--bg-primary": "#1e1f1c", "--bg-secondary": "#272822", "--bg-tertiary": "#3e3d32",
      "--bg-hover": "#4c4b3e", "--bg-active": "#57564a", "--border-color": "#3e3d32",
      "--text-primary": "#f8f8f2", "--text-secondary": "#cfcfc2", "--text-muted": "#75715e",
      "--text-inverse": "#272822", "--accent": "#a6e22e", "--accent-hover": "#b6f23e",
      "--success": "#a6e22e", "--warning": "#e6db74", "--danger": "#f92672", "--danger-hover": "#fd3f83",
    },
  },
  {
    name: "github-dark", label: "GitHub Dark", isDark: true,
    colors: {
      "--bg-primary": "#0d1117", "--bg-secondary": "#161b22", "--bg-tertiary": "#21262d",
      "--bg-hover": "#2a313b", "--bg-active": "#30363d", "--border-color": "#30363d",
      "--text-primary": "#e6edf3", "--text-secondary": "#bdc4cc", "--text-muted": "#6e7681",
      "--text-inverse": "#0d1117", "--accent": "#58a6ff", "--accent-hover": "#79c0ff",
      "--success": "#3fb950", "--warning": "#d29922", "--danger": "#f85149", "--danger-hover": "#fd6a63",
    },
  },
  {
    name: "solarized-dark", label: "Solarized Dark", isDark: true,
    colors: {
      "--bg-primary": "#002b36", "--bg-secondary": "#073642", "--bg-tertiary": "#0a4958",
      "--bg-hover": "#115566", "--bg-active": "#196070", "--border-color": "#0a4958",
      "--text-primary": "#eee8d5", "--text-secondary": "#93a1a1", "--text-muted": "#586e75",
      "--text-inverse": "#002b36", "--accent": "#268bd2", "--accent-hover": "#379ee5",
      "--success": "#859900", "--warning": "#b58900", "--danger": "#dc322f", "--danger-hover": "#e64545",
    },
  },
  {
    name: "catppuccin-latte", label: "Catppuccin Latte", isDark: false,
    colors: {
      "--bg-primary": "#f5f5f5", "--bg-secondary": "#ffffff", "--bg-tertiary": "#e8e8e8",
      "--bg-hover": "#e0e0e0", "--bg-active": "#d0d0d0", "--border-color": "#d4d4d4",
      "--text-primary": "#1e1e2e", "--text-secondary": "#585b70", "--text-muted": "#9399b2",
      "--text-inverse": "#f5f5f5", "--accent": "#1e66f5", "--accent-hover": "#2e7af5",
      "--success": "#40a02b", "--warning": "#df8e1d", "--danger": "#d20f39", "--danger-hover": "#e64553",
    },
  },
  {
    name: "solarized-light", label: "Solarized Light", isDark: false,
    colors: {
      "--bg-primary": "#fdf6e3", "--bg-secondary": "#eee8d5", "--bg-tertiary": "#e0dcc3",
      "--bg-hover": "#d5cfb5", "--bg-active": "#cac4aa", "--border-color": "#d3ceb5",
      "--text-primary": "#002b36", "--text-secondary": "#586e75", "--text-muted": "#93a1a1",
      "--text-inverse": "#fdf6e3", "--accent": "#268bd2", "--accent-hover": "#2a94e0",
      "--success": "#859900", "--warning": "#b58900", "--danger": "#dc322f", "--danger-hover": "#e64545",
    },
  },
];

// Lane assignment — O(n) via pre-built child map
function buildGraphData(logEntries: CommitLogEntry[]): GraphData {
  if (logEntries.length === 0) return { nodes: [], edges: [], maxLane: 0 };
  const n = logEntries.length;
  const hashToIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) hashToIndex.set(logEntries[i].hash, i);

  // Pre-build parent→children map (O(n) total)
  const childMap = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    for (const p of logEntries[i].parents) {
      let arr = childMap.get(p);
      if (!arr) { arr = []; childMap.set(p, arr); }
      arr.push(i);
    }
  }

  const activeColumns: (string | null)[] = [];
  const nodeLanes: number[] = new Array(n).fill(-1);
  const ROW_HEIGHT = 28, LANE_WIDTH = 22;
  for (let i = 0; i < n; i++) {
    const commit = logEntries[i];
    let lane = -1;
    const childIndices = childMap.get(commit.hash);
    if (!childIndices || childIndices.length === 0) {
      lane = activeColumns.indexOf(null);
      if (lane === -1) { lane = activeColumns.length; activeColumns.push(null); }
    } else {
      for (const childIdx of childIndices) {
        if (nodeLanes[childIdx] !== -1) { lane = nodeLanes[childIdx]; break; }
      }
      if (lane === -1) {
        lane = activeColumns.indexOf(null);
        if (lane === -1) { lane = activeColumns.length; activeColumns.push(null); }
      }
    }
    nodeLanes[i] = lane;
    activeColumns[lane] = commit.hash;
  }
  const nodes: GraphNode[] = logEntries.map((entry, i) => ({
    hash: entry.hash, shortHash: entry.shortHash, parents: entry.parents,
    author: entry.author, email: entry.email, timestamp: entry.timestamp, subject: entry.subject, body: entry.body || '',
    x: nodeLanes[i] * LANE_WIDTH + LANE_WIDTH, y: i * ROW_HEIGHT + ROW_HEIGHT / 2,
    color: hashToColor(entry.hash, BRANCH_COLORS), lane: nodeLanes[i], isSelected: false,
  }));
  const finalEdges: GraphEdge[] = [];
  for (let i = 0; i < n; i++) {
    const node = logEntries[i];
    for (const parentHash of node.parents) {
      const parentIdx = hashToIndex.get(parentHash);
      if (parentIdx !== undefined) {
        finalEdges.push({
          fromX: nodeLanes[i] * LANE_WIDTH + LANE_WIDTH, fromY: nodes[i].y,
          toX: nodeLanes[parentIdx] * LANE_WIDTH + LANE_WIDTH, toY: nodes[parentIdx].y,
          color: nodes[i].color,
        });
      }
    }
  }
  return { nodes, edges: finalEdges, maxLane: Math.max(0, ...nodeLanes) + 1 };
}

interface AppState {
  repos: RepoInfo[]; currentRepo: string | null; repoError: string | null;
  branches: string[]; remoteBranches: string[]; currentBranch: string;
  logEntries: CommitLogEntry[]; graphData: GraphData;
  logSkip: number; hasMoreCommits: boolean; loadingMore: boolean;
  selectedCommit: string | null; commitDetail: CommitDetail | null;
    selectedDiffFile: { path: string; isStaged: boolean; commitHash?: string } | null;
  status: GitStatusData | null;
  themePreset: string; isDark: boolean; language: string;
  loading: boolean; loadingMessage: string; error: string | null;
  showSettings: boolean;

  addRepo: (path: string, name: string) => void;
  removeRepo: (path: string) => void;
  setCurrentRepo: (path: string | null) => void;
  setRepoError: (error: string | null) => void;
  setBranches: (branches: string[], current: string) => void;
  setLogEntries: (entries: CommitLogEntry[]) => void;
  appendLogEntries: (entries: CommitLogEntry[]) => void;
  setGraphData: (data: GraphData) => void;
  loadMoreCommits: () => Promise<void>;
  selectCommit: (hash: string | null) => void;
  setCommitDetail: (detail: CommitDetail | null) => void;
    setSelectedDiffFile: (file: { path: string; isStaged: boolean; commitHash?: string } | null) => void;
  checkoutRemote: (remoteBranch: string) => Promise<void>;
  setStatus: (status: GitStatusData | null) => void;
  setThemePreset: (presetName: string) => void;
  setLanguage: (lang: "en" | "zh") => void;
  setShowSettings: (show: boolean) => void;
  setLoading: (loading: boolean, message?: string) => void;
  setError: (error: string | null) => void;
  refreshAll: (repoPath?: string) => Promise<void>;
}

function applyTheme(preset: ThemePreset) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(preset.colors)) {
    root.style.setProperty(key, value);
  }
  root.setAttribute("data-theme", preset.isDark ? "dark" : "light");
}

export const useRepoStore = create<AppState>((set, get) => ({
  repos: [], currentRepo: null, repoError: null,
  branches: [], remoteBranches: [], currentBranch: "",
  logEntries: [], graphData: { nodes: [], edges: [], maxLane: 0, branchRefs: {} },
  logSkip: 0, hasMoreCommits: true, loadingMore: false,
  selectedCommit: null, commitDetail: null, selectedDiffFile: null, status: null,
  themePreset: "catppuccin-mocha", isDark: true, language: "en",
  loading: false, loadingMessage: "", error: null,
  showSettings: false,

  addRepo: (repoPath, name) => {
    const state = get();
    if (!state.repos.find((r) => r.path === repoPath)) {
      const repos = [...state.repos, { path: repoPath, name }];
      set({ repos });
      window.gitAPI?.setSetting("repos", repos);
    }
  },
  removeRepo: (repoPath) => {
    const state = get();
    const repos = state.repos.filter((r) => r.path !== repoPath);
    set({ repos, currentRepo: state.currentRepo === repoPath ? null : state.currentRepo });
    window.gitAPI?.setSetting("repos", repos);
  },
  setCurrentRepo: (repoPath) => set({ currentRepo: repoPath, selectedCommit: null, commitDetail: null }),
  setRepoError: (error) => set({ repoError: error }),
  setBranches: (branches, current) => set({ branches, currentBranch: current }),
  setLogEntries: (entries) => set({ logEntries: entries, graphData: buildGraphData(entries), logSkip: entries.length, hasMoreCommits: entries.length >= 200 }),
  appendLogEntries: (newEntries) => {
    const state = get();
    const merged = [...state.logEntries, ...newEntries];
    const newSkip = merged.length;
    set({ logEntries: merged, graphData: buildGraphData(merged), logSkip: newSkip, hasMoreCommits: newEntries.length >= 200, loadingMore: false });
  },
  loadMoreCommits: async () => {
    const state = get();
    if (!state.currentRepo || state.loadingMore || !state.hasMoreCommits) return;
    set({ loadingMore: true });
    const api = window.gitAPI;
    if (!api) { set({ loadingMore: false }); return; }
    try {
      const result = await api.log(state.currentRepo, state.logSkip, 200);
      if (result.success && result.data && result.data.length > 0) {
        const newEntries = result.data;
        const merged = [...state.logEntries, ...newEntries];
        const newSkip = merged.length;
        set({ logEntries: merged, graphData: buildGraphData(merged), logSkip: newSkip, hasMoreCommits: newEntries.length >= 200, loadingMore: false });
      } else {
        set({ hasMoreCommits: false, loadingMore: false });
      }
    } catch {
      set({ loadingMore: false });
    }
  },
  setGraphData: (data) => set({ graphData: data }),
  selectCommit: (hash) => set({ selectedCommit: hash, commitDetail: null }),
  setSelectedDiffFile: (file) => set({ selectedDiffFile: file }),
  setCommitDetail: (detail) => set({ commitDetail: detail }),
  checkoutRemote: async (remoteBranch: string) => {
    const state = get();
    if (!state.currentRepo) return;
    const api = window.gitAPI;
    if (!api) return;
    set({ loading: true, loadingMessage: `Checking out ${remoteBranch}...` });
    try {
      const result = await api.checkoutRemote(state.currentRepo, remoteBranch);
      if (result.success) await state.refreshAll();
      else set({ error: result.error || "Checkout failed" });
    } catch (err: any) { set({ error: err.message }); }
    finally { set({ loading: false, loadingMessage: "" }); }
  },
  setStatus: (status) => set({ status }),
  setThemePreset: (presetName) => {
    const preset = THEME_PRESETS.find((p) => p.name === presetName);
    if (preset) {
      applyTheme(preset);
      set({ themePreset: presetName, isDark: preset.isDark });
      window.gitAPI?.setSetting("themePreset", presetName);
    }
  },
  setShowSettings: (show) => set({ showSettings: show }),
  setLanguage: (lang) => { set({ language: lang }); setGlobalLocale(lang as "en" | "zh"); window.gitAPI?.setSetting('language', lang); },
  setLoading: (loading, message = "") => set({ loading, loadingMessage: message }),
  setError: (error) => set({ error }),

  refreshAll: async (repoPath?: string) => {
    const state = get();
    const repo = repoPath || state.currentRepo;
    if (!repo) return;
    const api = window.gitAPI;
    if (!api) return;
    set({ loading: true, loadingMessage: "Refreshing...", error: null, logSkip: 0, hasMoreCommits: true, loadingMore: false });
    try {
      const branchResult = await api.branches(repo);
      if (branchResult.success && branchResult.data) {
        const localBranches = branchResult.data.all.filter((b: string) => !b.startsWith("remotes/"));
        const remoteBranches = branchResult.data.all.filter((b: string) => b.startsWith("remotes/"));
  const branchRefs: Record<string, string[]> = {};
          if (branchResult.data.branches) { for (const [name, info] of Object.entries(branchResult.data.branches)) { if (info.commit) { if (!branchRefs[info.commit]) branchRefs[info.commit] = []; branchRefs[info.commit].push(name); } } }
          set({ branches: localBranches, remoteBranches, currentBranch: branchResult.data.current, graphData: { ...get().graphData, branchRefs } });
      }
      const logResult = await api.log(repo, 0, 200);
      if (logResult.success && logResult.data) {
        const entries = logResult.data;
        set({ logEntries: entries, graphData: buildGraphData(entries), logSkip: entries.length, hasMoreCommits: entries.length >= 200 });
      } else if (logResult.error) { set({ error: logResult.error }); }
      const statusResult = await api.status(repo);
      if (statusResult.success && statusResult.data) { set({ status: statusResult.data }); }
    } catch (err: any) { set({ error: err.message || "Refresh failed" }); }
    finally { set({ loading: false, loadingMessage: "" }); }
  },
}));
