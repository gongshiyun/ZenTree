import { create } from "zustand";
import type { RepoInfo, CommitLogEntry, GraphData, GitStatusData, CommitDetail, LogFilters, RemoteInfo, TagInfo, BranchTracking, RepoGroup, RepoSnapshot, GroupTabView } from "../types";
import { setGlobalLocale, t } from "../i18n";
import { buildGraphData } from "../domain/graph/layout";
import { getThemePreset, applyTheme } from "../domain/theme/presets";
import { statusFingerprint } from "../domain/files/fingerprint";
import { gitApi } from "../infrastructure/gitBridge";

export { THEME_PRESETS } from "../domain/theme/presets";

const PAGE_SIZE = 200;
/** Upper bound on cached repositories; the stalest snapshots are evicted past it. */
const MAX_CACHED_REPOS = 32;

interface SelectedDiffFile { path: string; isStaged: boolean; status?: string; fromPath?: string; commitHash?: string; fromRef?: string; toRef?: string; rawDiff?: string; }

interface AppState {
  repos: RepoInfo[]; currentRepo: string | null;
  branches: string[]; remoteBranches: string[]; currentBranch: string;
  logEntries: CommitLogEntry[]; graphData: GraphData;
  logSkip: number; hasMoreCommits: boolean; loadingMore: boolean;
  selectedCommit: string | null; commitDetail: CommitDetail | null;
  selectedDiffFile: SelectedDiffFile | null;
  status: GitStatusData | null;
  themePreset: string; isDark: boolean; language: string;
  loading: boolean; loadingMessage: string; error: string | null;
  showSettings: boolean;
  showClone: boolean;
  showCompare: boolean;
  showRebase: string | null;
  tags: TagInfo[]; remotes: RemoteInfo[]; logFilters: LogFilters;
  branchTracking: BranchTracking[];
  ongoing: "merge" | "rebase" | "cherry-pick" | null;
  viewRef: string | null;
  repoGroups: RepoGroup[];
  showRepoGroups: boolean;
  compareBase: string | null;
  selectedFiles: string[];
  lastStatusFingerprint: string;
  showCommandPalette: boolean;
  /** The user's own tab set (repository paths), persisted to the "tabs" setting. */
  customTabs: string[];
  /** A repo group opened as tabs; in-memory only, discarded on exit. */
  groupView: GroupTabView | null;
  showTabPicker: boolean;
  /** Per-repository snapshot cache, so a tab switch paints before git answers. */
  repoCache: Record<string, RepoSnapshot>;
  /** Monotonic refresh token per repository: invalidates in-flight refreshes of that repo only. */
  refreshSeqByRepo: Record<string, number>;

  addRepo: (path: string, name: string) => void;
  removeRepo: (path: string) => void;
  setCurrentRepo: (path: string | null) => void;
  setSelectedDiffFile: (file: SelectedDiffFile | null) => void;
  selectCommit: (hash: string | null) => void;
  setCommitDetail: (detail: CommitDetail | null) => void;
  checkoutRemote: (remoteBranch: string) => Promise<void>;
  setThemePreset: (presetName: string) => void;
  setLanguage: (lang: "en" | "zh") => void;
  setShowSettings: (show: boolean) => void;
  setLoading: (loading: boolean, message?: string) => void;
  setError: (error: string | null) => void;
  loadMoreCommits: () => Promise<void>;
  initFromSettings: () => Promise<void>;
  refreshAll: (repoPath?: string, silent?: boolean) => Promise<void>;
  setShowClone: (show: boolean) => void;
  setShowCompare: (show: boolean) => void;
  setShowRebase: (base: string | null) => void;
  setViewRef: (ref: string | null) => void;
  setShowRepoGroups: (show: boolean) => void;
  addRepoGroup: (name: string, repos: string[]) => void;
  removeRepoGroup: (name: string) => void;
  updateRepoGroupRepos: (name: string, repos: string[]) => void;
  setLogFilters: (filters: LogFilters) => void;
  reloadMeta: () => Promise<void>;
  refreshOngoing: () => Promise<void>;
  setCompareBase: (hash: string | null) => void;
  setSelectedFiles: (files: string[]) => void;
  checkoutBranch: (branch: string) => Promise<void>;
  silentDiffRefresh: () => Promise<void>;
  setShowCommandPalette: (show: boolean) => void;
  openTab: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
  activateTab: (path: string | null) => Promise<void>;
  cycleTab: (delta: number) => Promise<void>;
  reorderTabs: (from: number, to: number) => void;
  enterGroupView: (name: string) => Promise<void>;
  exitGroupView: () => Promise<void>;
  setShowTabPicker: (show: boolean) => void;
}

function graphWithRefs(entries: CommitLogEntry[], branchRefs?: Record<string, string[]>): GraphData {
  return { ...buildGraphData(entries), branchRefs: branchRefs || {} };
}

/** The tab set on screen: the group snapshot while in group view, else the user's own tabs. */
export function visibleTabs(state: { groupView: GroupTabView | null; customTabs: string[] }): string[] {
  return state.groupView ? state.groupView.tabs : state.customTabs;
}

/**
 * The AppState slices a snapshot owns. Spelled out so `fetchedAt` (pure cache
 * bookkeeping) never leaks into the store.
 */
function snapshotSlices(s: RepoSnapshot) {
  return {
    branches: s.branches, remoteBranches: s.remoteBranches, currentBranch: s.currentBranch,
    logEntries: s.logEntries, graphData: s.graphData, logSkip: s.logSkip, hasMoreCommits: s.hasMoreCommits,
    tags: s.tags, remotes: s.remotes, branchTracking: s.branchTracking, ongoing: s.ongoing, status: s.status,
  };
}

/** Insert a snapshot, evicting the stalest ones once the cache grows past the cap. */
function withSnapshot(cache: Record<string, RepoSnapshot>, repo: string, snapshot: RepoSnapshot): Record<string, RepoSnapshot> {
  const next: Record<string, RepoSnapshot> = { ...cache, [repo]: snapshot };
  const keys = Object.keys(next);
  if (keys.length <= MAX_CACHED_REPOS) return next;
  keys.sort((a, b) => next[a].fetchedAt - next[b].fetchedAt);
  for (let i = 0; i < keys.length - MAX_CACHED_REPOS; i++) delete next[keys[i]];
  return next;
}

/**
 * Blank data slices, painted when a tab has no cached snapshot yet — showing the
 * previous repository's commits for a few hundred milliseconds is worse than an
 * empty list behind a spinner.
 */
const EMPTY_SLICES = {
  branches: [] as string[],
  remoteBranches: [] as string[],
  currentBranch: "",
  logEntries: [] as CommitLogEntry[],
  graphData: { nodes: [], edges: [], maxLane: 0, branchRefs: {} } as GraphData,
  logSkip: 0,
  hasMoreCommits: true,
  tags: [] as TagInfo[],
  remotes: [] as RemoteInfo[],
  branchTracking: [] as BranchTracking[],
  ongoing: null as "merge" | "rebase" | "cherry-pick" | null,
  status: null as GitStatusData | null,
};

export const useRepoStore = create<AppState>((set, get) => ({
  repos: [], currentRepo: null,
  branches: [], remoteBranches: [], currentBranch: "",
  logEntries: [], graphData: { nodes: [], edges: [], maxLane: 0, branchRefs: {} },
  logSkip: 0, hasMoreCommits: true, loadingMore: false,
  selectedCommit: null, commitDetail: null, selectedDiffFile: null, status: null,
  themePreset: "catppuccin-mocha", isDark: true, language: "en",
  loading: false, loadingMessage: "", error: null,
  showSettings: false,
  showClone: false,
  showCompare: false,
  showRebase: null,
  tags: [], remotes: [], logFilters: {}, branchTracking: [], ongoing: null, viewRef: null,
  repoGroups: [], showRepoGroups: false,
  compareBase: null, selectedFiles: [], lastStatusFingerprint: "", showCommandPalette: false,
  customTabs: [], groupView: null, showTabPicker: false, repoCache: {}, refreshSeqByRepo: {},

  addRepo: (repoPath, name) => {
    const state = get();
    if (!state.repos.find((r) => r.path === repoPath)) {
      const repos = [...state.repos, { path: repoPath, name }];
      set({ repos });
      gitApi().setSetting("repos", repos);
    }
  },
  removeRepo: (repoPath) => {
    const state = get();
    const repos = state.repos.filter((r) => r.path !== repoPath);
    set({ repos, currentRepo: state.currentRepo === repoPath ? null : state.currentRepo });
    gitApi().setSetting("repos", repos);
    // A repository dropped from the known list must not linger as a tab.
    if (state.customTabs.includes(repoPath)) get().closeTab(repoPath);
  },
  setCurrentRepo: (repoPath) => {
    set({ currentRepo: repoPath, selectedCommit: null, commitDetail: null, selectedDiffFile: null, status: null, selectedFiles: [], lastStatusFingerprint: "" });
    gitApi().setSetting("lastRepo", repoPath);
    // Hook the incremental watcher: starting a new watch stops the previous one.
    if (repoPath) gitApi().watchRepo(repoPath).catch(() => {});
    else gitApi().unwatchRepo().catch(() => {});
  },
  setSelectedDiffFile: (file) => set({ selectedDiffFile: file }),
  selectCommit: (hash) => set({ selectedCommit: hash, commitDetail: null }),
  setCommitDetail: (detail) => set({ commitDetail: detail }),
  checkoutRemote: async (remoteBranch: string) => {
    const state = get();
    if (!state.currentRepo) return;
    set({ loading: true, loadingMessage: t("status.checkingOut").replace("{0}", remoteBranch) });
    try {
      const result = await gitApi().checkoutRemote(state.currentRepo, remoteBranch);
      if (result.success) await state.refreshAll();
      else set({ error: result.error || t("error.opFailed") });
    } catch (err: any) { set({ error: err.message }); }
    finally { set({ loading: false, loadingMessage: "" }); }
  },
  setThemePreset: (presetName) => {
    const preset = getThemePreset(presetName);
    if (!preset) return;
    applyTheme(preset);
    set({ themePreset: presetName, isDark: preset.isDark });
    gitApi().setSetting("themePreset", presetName);
  },
  setLanguage: (lang) => {
    set({ language: lang });
    setGlobalLocale(lang);
    gitApi().setSetting("language", lang);
  },
  setShowSettings: (show) => set({ showSettings: show }),
  setShowClone: (show) => set({ showClone: show }),
  setShowCompare: (show) => set({ showCompare: show }),
  setShowRebase: (base) => set({ showRebase: base }),
  setViewRef: (ref) => {
    set({ viewRef: ref, selectedCommit: null, commitDetail: null });
    get().refreshAll(undefined, true);
  },
  setShowRepoGroups: (show) => set({ showRepoGroups: show }),
  setCompareBase: (hash) => set({ compareBase: hash }),
  setSelectedFiles: (files) => set({ selectedFiles: files }),
  setShowCommandPalette: (show) => set({ showCommandPalette: show }),
  setShowTabPicker: (show) => set({ showTabPicker: show }),

  /* ---------- Repository tabs ----------
     Tabs are decoupled from the known-repository list: a tab is just a path and
     its label is derived at render time. Group view swaps the whole tab set for
     a snapshot of one group's members and is exactly one level deep — edits made
     while it is active are discarded together with the snapshot. */

  openTab: (path) => {
    const state = get();
    if (!visibleTabs(state).includes(path)) {
      if (state.groupView) {
        set({ groupView: { name: state.groupView.name, tabs: [...state.groupView.tabs, path] } });
      } else {
        const customTabs = [...state.customTabs, path];
        set({ customTabs });
        gitApi().setSetting("tabs", customTabs);
      }
    }
    return get().activateTab(path);
  },
  closeTab: (path) => {
    const state = get();
    const tabs = visibleTabs(state);
    const index = tabs.indexOf(path);
    if (index < 0) return;
    const rest = tabs.filter((p) => p !== path);
    if (state.groupView) {
      set({ groupView: { name: state.groupView.name, tabs: rest } });
    } else {
      set({ customTabs: rest });
      gitApi().setSetting("tabs", rest);
    }
    // Drop the cache too: reopening the tab must not resurrect stale data.
    if (state.repoCache[path]) {
      const repoCache = { ...state.repoCache };
      delete repoCache[path];
      set({ repoCache });
    }
    // Activate the neighbour sliding into the closed slot, else the one before
    // it, else fall back to the welcome screen.
    if (get().currentRepo === path) get().activateTab(rest[index] ?? rest[index - 1] ?? null);
  },
  activateTab: (path) => {
    const state = get();
    if (path === null) {
      state.setCurrentRepo(null);
      return Promise.resolve();
    }
    // Re-activating the current tab must not throw away the user's selection.
    if (path === state.currentRepo) return Promise.resolve();
    // Clears selection state, persists lastRepo and re-hooks the singleton watcher.
    state.setCurrentRepo(path);
    // Per-repo navigation state must not survive a switch: a ref filter would
    // make the next log query fail with "unknown revision", and a stale
    // ongoing-operation banner would claim a rebase is running where there is none.
    set({ viewRef: null, ...EMPTY_SLICES });
    const snapshot = get().repoCache[path];
    if (snapshot) set(snapshotSlices(snapshot));
    // Silent when the cache already painted something: no spinner over good data.
    return get().refreshAll(path, Boolean(snapshot));
  },
  cycleTab: (delta) => {
    const state = get();
    const tabs = visibleTabs(state);
    if (tabs.length === 0) return Promise.resolve();
    const index = state.currentRepo ? tabs.indexOf(state.currentRepo) : -1;
    if (index < 0 || tabs.length === 1) return get().activateTab(tabs[0]);
    return get().activateTab(tabs[(index + delta + tabs.length) % tabs.length]);
  },
  reorderTabs: (from, to) => {
    const state = get();
    const tabs = visibleTabs(state);
    if (from === to || from < 0 || to < 0 || from >= tabs.length || to >= tabs.length) return;
    const next = [...tabs];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    if (state.groupView) {
      set({ groupView: { name: state.groupView.name, tabs: next } });
    } else {
      set({ customTabs: next });
      gitApi().setSetting("tabs", next);
    }
  },
  enterGroupView: (name) => {
    const state = get();
    const group = state.repoGroups.find((g) => g.name === name);
    if (!group) return Promise.resolve();
    // Members are copied on entry, so editing the group afterwards does not
    // shift the tab bar under the user's feet; it applies on the next entry.
    set({ groupView: { name, tabs: [...group.repos] } });
    if (group.repos.length === 0) return get().activateTab(null);
    const current = state.currentRepo;
    if (current && group.repos.includes(current)) return Promise.resolve();
    return get().activateTab(group.repos[0]);
  },
  exitGroupView: () => {
    const state = get();
    if (!state.groupView) return Promise.resolve();
    set({ groupView: null });
    const current = state.currentRepo;
    if (current && state.customTabs.includes(current)) return Promise.resolve();
    return get().activateTab(state.customTabs[0] ?? null);
  },
  checkoutBranch: async (branch: string) => {
    const state = get();
    if (!state.currentRepo || branch === state.currentBranch) return;
    set({ loading: true, loadingMessage: t("status.checkingOut").replace("{0}", branch) });
    try {
      const result = await gitApi().checkout(state.currentRepo, branch);
      if (result.success) await get().refreshAll();
      else set({ error: result.error || t("error.checkoutFailed") });
    } catch (err: any) { set({ error: err.message || t("error.checkoutFailed") }); }
    finally { set({ loading: false, loadingMessage: "" }); }
  },
  silentDiffRefresh: async () => {
    const state = get();
    const repo = state.currentRepo;
    if (!repo || state.loading || state.ongoing) return;
    // Status carries a repository-wide fingerprint covering HEAD, refs, staged
    // and unstaged diffs, and untracked file content.
    const r = await gitApi().status(repo);
    if (!r.success) return;
    // The user may have switched tab while those two calls were in flight, and
    // the fingerprint belongs to the repository it was computed from.
    if (get().currentRepo !== repo) return;
    const fp = r.data?.fingerprint ?? statusFingerprint(r.data);
    if (fp === state.lastStatusFingerprint) return;
    set({ lastStatusFingerprint: fp });
    await get().refreshAll(repo, true);
  },
  addRepoGroup: (name, repos) => {
    const state = get();
    if (state.repoGroups.some((g) => g.name === name)) return;
    const groups = [...state.repoGroups, { name, repos }];
    set({ repoGroups: groups });
    gitApi().setSetting("repoGroups", groups);
  },
  removeRepoGroup: (name) => {
    const groups = get().repoGroups.filter((g) => g.name !== name);
    set({ repoGroups: groups });
    gitApi().setSetting("repoGroups", groups);
    // Never leave the tab bar showing a group that no longer exists.
    if (get().groupView?.name === name) get().exitGroupView();
  },
  updateRepoGroupRepos: (name, repos) => {
    const groups = get().repoGroups.map((g) => (g.name === name ? { ...g, repos } : g));
    set({ repoGroups: groups });
    gitApi().setSetting("repoGroups", groups);
  },
  setLoading: (loading, message = "") => set({ loading, loadingMessage: message }),
  setError: (error) => set({ error }),
  setLogFilters: (filters) => {
    set({ logFilters: filters, logSkip: 0, hasMoreCommits: true });
    get().refreshAll(undefined, true);
  },
  reloadMeta: async () => {
    const state = get();
    const repo = state.currentRepo;
    if (!repo) return;
    try {
      const [tagsRes, remotesRes] = await Promise.all([gitApi().tags(repo), gitApi().remotes(repo)]);
      set({
        tags: tagsRes.success && tagsRes.data ? tagsRes.data : [],
        remotes: remotesRes.success && remotesRes.data ? remotesRes.data : [],
      });
    } catch { /* keep previous values */ }
  },

  refreshOngoing: async () => {
    const repo = get().currentRepo;
    if (!repo) return;
    try {
      const r = await gitApi().getOngoingOperation(repo);
      if (r.success) set({ ongoing: r.data ?? null });
    } catch { /* keep previous */ }
  },

  loadMoreCommits: async () => {
    const state = get();
    const repo = state.currentRepo;
    if (!repo || state.loadingMore || !state.hasMoreCommits) return;
    const seq = state.refreshSeqByRepo[repo] ?? 0;
    set({ loadingMore: true });
    try {
      const result = await gitApi().log(repo, state.logSkip, PAGE_SIZE, get().logFilters, get().viewRef || undefined);
      // Drop the page when a refresh superseded it or the user switched tabs.
      if (seq !== (get().refreshSeqByRepo[repo] ?? 0) || get().currentRepo !== repo) return;
      if (result.success && result.data && result.data.length > 0) {
        const merged = [...state.logEntries, ...result.data];
        set({
          logEntries: merged,
          graphData: graphWithRefs(merged, get().graphData.branchRefs),
          logSkip: merged.length,
          hasMoreCommits: result.data.length >= PAGE_SIZE,
        });
      } else {
        set({ hasMoreCommits: false });
      }
    } catch {
      if (get().currentRepo === repo) set({ hasMoreCommits: false });
    } finally {
      if (seq === (get().refreshSeqByRepo[repo] ?? 0) && get().currentRepo === repo) set({ loadingMore: false });
    }
  },

  initFromSettings: async () => {
    try {
      const settings = await gitApi().getSettings();
      if (!settings) return;
      if (settings.language) get().setLanguage(settings.language);
      if (settings.themePreset) get().setThemePreset(settings.themePreset);
      const repos = Array.isArray(settings.repos) ? settings.repos : [];
      for (const r of repos) {
        if (r && typeof r.path === "string" && typeof r.name === "string") get().addRepo(r.path, r.name);
      }
      if (Array.isArray(settings.repoGroups)) {
        const groups = settings.repoGroups.filter((g: RepoGroup) => g && typeof g.name === "string" && Array.isArray(g.repos));
        if (groups.length > 0) set({ repoGroups: groups });
      }
      const tabs = Array.isArray(settings.tabs) ? settings.tabs.filter((p: unknown): p is string => typeof p === "string") : [];
      if (tabs.length > 0) set({ customTabs: tabs });
      const last = typeof settings.lastRepo === "string" ? settings.lastRepo : null;
      const restored = get().customTabs;
      // The last active tab wins, then the head of the tab set, then the pre-tabs
      // behaviour of reopening lastRepo — which also seeds the very first tab.
      const target = (last && restored.includes(last) ? last : null)
        ?? restored[0]
        ?? (last && get().repos.some((r) => r.path === last) ? last : null);
      if (target) await get().openTab(target);
    } catch { /* settings may be unavailable in non-Electron dev; ignore */ }
  },

  refreshAll: async (repoPath?: string, silent = false) => {
    const state = get();
    const repo = repoPath || state.currentRepo;
    if (!repo) return;
    // Per-repository token: with tabs in play a slow response for one repository
    // must not be allowed to overwrite the data of the one now on screen, which
    // a single module-level counter could not tell apart.
    const seq = (state.refreshSeqByRepo[repo] ?? 0) + 1;
    set({ refreshSeqByRepo: { ...get().refreshSeqByRepo, [repo]: seq } });
    const stale = () => seq !== (get().refreshSeqByRepo[repo] ?? 0);
    // Only the active tab's slices may be touched; any other repository refresh
    // just feeds the cache.
    const isActive = () => get().currentRepo === repo;
    if (isActive()) set({ error: null, logSkip: 0, hasMoreCommits: true, loadingMore: false });
    if (!silent && isActive()) set({ loading: true, loadingMessage: t("status.refreshing") });
    try {
      const [branchResult, logResult, statusResult, tagsResult, remotesResult, trackingResult, ongoingResult] = await Promise.all([
        gitApi().branches(repo),
        gitApi().log(repo, 0, PAGE_SIZE, get().logFilters, get().viewRef || undefined),
        gitApi().status(repo),
        gitApi().tags(repo),
        gitApi().remotes(repo),
        gitApi().branchTracking(repo),
        gitApi().getOngoingOperation(repo),
      ]);
      if (stale()) return;

      if (branchResult.success && branchResult.data) {
        const localBranches = branchResult.data.all.filter((b: string) => !b.startsWith("remotes/"));
        const remoteBranches = branchResult.data.all.filter((b: string) => b.startsWith("remotes/"));
        const branchRefs: Record<string, string[]> = {};
        if (branchResult.data.branches) {
          for (const [name, info] of Object.entries(branchResult.data.branches)) {
            if (info && info.commit) {
              if (!branchRefs[info.commit]) branchRefs[info.commit] = [];
              branchRefs[info.commit].push(name);
            }
          }
        }
        const entries = logResult.success && logResult.data ? logResult.data : [];
        const snapshot: RepoSnapshot = {
          branches: localBranches,
          remoteBranches,
          currentBranch: branchResult.data.current,
          logEntries: entries,
          graphData: graphWithRefs(entries, branchRefs),
          logSkip: entries.length,
          hasMoreCommits: entries.length >= PAGE_SIZE,
          tags: tagsResult.success && tagsResult.data ? tagsResult.data : [],
          remotes: remotesResult.success && remotesResult.data ? remotesResult.data : [],
          branchTracking: trackingResult.success && trackingResult.data ? trackingResult.data : [],
          ongoing: ongoingResult.success ? (ongoingResult.data ?? null) : get().ongoing,
          // A failed status call keeps whatever is on screen (the restored
          // snapshot on a tab switch) instead of blanking the file panel.
          status: statusResult.success && statusResult.data ? statusResult.data : get().status,
          fetchedAt: Date.now(),
        };
        set({ repoCache: withSnapshot(get().repoCache, repo, snapshot) });

        if (isActive()) {
          set(snapshotSlices(snapshot));
          if (logResult.error) set({ error: logResult.error });
          // Keep the silent-refresh fingerprint in sync so the first watch event
          // after a manual refresh does not trigger a redundant full refresh.
          const headHash = entries.length > 0 ? entries[0].hash : undefined;
          const fingerprint = snapshot.status?.fingerprint
            ?? statusFingerprint(snapshot.status ?? undefined) + "@" + (headHash ?? "");
          set({ lastStatusFingerprint: fingerprint });
        }
      } else if (branchResult.error && isActive()) {
        set({ error: branchResult.error });
      }
    } catch (err: any) {
      if (!stale() && isActive()) set({ error: err.message || t("error.opFailed") });
    } finally {
      if (!stale() && isActive()) set({ loading: false, loadingMessage: "" });
    }
  },
}));
