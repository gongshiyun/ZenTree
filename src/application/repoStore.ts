import { create } from "zustand";
import type { RepoInfo, CommitLogEntry, GraphData, GitStatusData, CommitDetail, LogFilters, RemoteInfo, TagInfo } from "../types";
import { setGlobalLocale, t } from "../i18n";
import { buildGraphData } from "../domain/graph/layout";
import { getThemePreset, applyTheme } from "../domain/theme/presets";
import { gitApi } from "../infrastructure/gitBridge";

export { THEME_PRESETS } from "../domain/theme/presets";

const PAGE_SIZE = 200;
/** Monotonic token that invalidates in-flight refreshes after a newer one starts. */
let refreshSeq = 0;

interface SelectedDiffFile { path: string; isStaged: boolean; commitHash?: string; fromRef?: string; toRef?: string; }

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
  tags: TagInfo[]; remotes: RemoteInfo[]; logFilters: LogFilters;

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
  setLogFilters: (filters: LogFilters) => void;
  reloadMeta: () => Promise<void>;
}

function graphWithRefs(entries: CommitLogEntry[], branchRefs?: Record<string, string[]>): GraphData {
  return { ...buildGraphData(entries), branchRefs: branchRefs || {} };
}

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
  tags: [], remotes: [], logFilters: {},

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
  },
  setCurrentRepo: (repoPath) => {
    set({ currentRepo: repoPath, selectedCommit: null, commitDetail: null, selectedDiffFile: null, status: null });
    gitApi().setSetting("lastRepo", repoPath);
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

  loadMoreCommits: async () => {
    const state = get();
    if (!state.currentRepo || state.loadingMore || !state.hasMoreCommits) return;
    const seq = refreshSeq;
    set({ loadingMore: true });
    try {
      const result = await gitApi().log(state.currentRepo, state.logSkip, PAGE_SIZE);
      if (seq !== refreshSeq) return;
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
      set({ hasMoreCommits: false });
    } finally {
      if (seq === refreshSeq) set({ loadingMore: false });
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
      const last = settings.lastRepo;
      if (last && get().repos.some((r) => r.path === last)) {
        get().setCurrentRepo(last);
        await get().refreshAll(last);
      }
    } catch { /* settings may be unavailable in non-Electron dev; ignore */ }
  },

  refreshAll: async (repoPath?: string, silent = false) => {
    const state = get();
    const repo = repoPath || state.currentRepo;
    if (!repo) return;
    const seq = ++refreshSeq;
    set({ error: null, logSkip: 0, hasMoreCommits: true, loadingMore: false });
    if (!silent) set({ loading: true, loadingMessage: t("status.refreshing") });
    try {
      const [branchResult, logResult, statusResult, tagsResult, remotesResult] = await Promise.all([
        gitApi().branches(repo),
        gitApi().log(repo, 0, PAGE_SIZE, get().logFilters),
        gitApi().status(repo),
        gitApi().tags(repo),
        gitApi().remotes(repo),
      ]);
      if (seq !== refreshSeq) return;

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
        set({ branches: localBranches, remoteBranches, currentBranch: branchResult.data.current });

        if (logResult.success && logResult.data) {
          const entries = logResult.data;
          set({
            logEntries: entries,
            graphData: graphWithRefs(entries, branchRefs),
            logSkip: entries.length,
            hasMoreCommits: entries.length >= PAGE_SIZE,
          });
        } else if (logResult.error) {
          set({ error: logResult.error });
        }

        if (statusResult.success && statusResult.data) set({ status: statusResult.data });
        set({
          tags: tagsResult.success && tagsResult.data ? tagsResult.data : [],
          remotes: remotesResult.success && remotesResult.data ? remotesResult.data : [],
        });
      } else if (branchResult.error) {
        set({ error: branchResult.error });
      }
    } catch (err: any) {
      if (seq === refreshSeq) set({ error: err.message || t("error.opFailed") });
    } finally {
      if (seq === refreshSeq) set({ loading: false, loadingMessage: "" });
    }
  },
}));
