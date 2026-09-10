import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CommitLogEntry, GitStatusData, RepoSnapshot } from "../src/types";

/**
 * Unit tests for the application store (src/application/repoStore.ts).
 * The Electron IPC bridge (window.gitAPI) is replaced by an in-memory mock,
 * so this suite has no dependency on a real git binary.
 */

const emptyStatus: GitStatusData = {
  staged: [], modified: [], created: [], deleted: [],
  renamed: [], not_added: [], conflicted: [], files: [], current: "main",
};

function makeApi() {
  return {
    setSetting: vi.fn(),
    getSettings: vi.fn(async () => null),
    branches: vi.fn(async (_repo: string) => ({ success: true, data: { current: "main", all: ["main"], branches: {} } })),
    log: vi.fn(async () => ({ success: true, data: [] as CommitLogEntry[] })),
    status: vi.fn(async () => ({ success: true, data: { ...emptyStatus, fingerprint: "status-default" } })),
    tags: vi.fn(async () => ({ success: true, data: [] })),
    remotes: vi.fn(async () => ({ success: true, data: [] })),
    branchTracking: vi.fn(async () => ({ success: true, data: [] })),
    getOngoingOperation: vi.fn(async () => ({ success: true, data: null })),
    checkoutRemote: vi.fn(async () => ({ success: true })),
    checkout: vi.fn(async () => ({ success: true })),
    watchRepo: vi.fn(async () => ({ success: true })),
    unwatchRepo: vi.fn(async () => ({ success: true })),
    discard: vi.fn(async () => ({ success: true })),
    stageAll: vi.fn(async () => ({ success: true })),
    unstageAll: vi.fn(async () => ({ success: true })),
  };
}

let api = makeApi();
(globalThis as any).window = { gitAPI: api };

import { useRepoStore } from "../src/application/repoStore";

/** Snapshot of the store's initial state (data + actions) for per-test reset. */
const initialState = useRepoStore.getState();

function entry(hash: string, subject: string, parents: string[] = []): CommitLogEntry {
  return { hash, shortHash: hash.slice(0, 7), parents, author: "T", email: "t@example.com", timestamp: 1, subject };
}

/** A minimal cached snapshot, for tests that seed the cache by hand. */
function snapshot(overrides: Partial<RepoSnapshot> = {}): RepoSnapshot {
  return {
    branches: ["main"], remoteBranches: [], currentBranch: "main",
    logEntries: [], graphData: { nodes: [], edges: [], maxLane: 0, branchRefs: {} },
    logSkip: 0, hasMoreCommits: false, tags: [], remotes: [], branchTracking: [],
    ongoing: null, status: emptyStatus, fetchedAt: 1, ...overrides,
  };
}

/** Stalls a mocked git call forever, so the refresh it belongs to never lands. */
function stall(): Promise<never> {
  return new Promise(() => {});
}

const s = () => useRepoStore.getState();

beforeEach(() => {
  api = makeApi();
  (globalThis as any).window = { gitAPI: api };
  useRepoStore.setState(initialState, true);
});

describe("repository list transitions", () => {
  it("addRepo appends and persists, ignoring duplicates", () => {
    s().addRepo("/r/a", "A");
    expect(s().repos).toEqual([{ path: "/r/a", name: "A" }]);
    expect(api.setSetting).toHaveBeenCalledWith("repos", [{ path: "/r/a", name: "A" }]);

    s().addRepo("/r/a", "A-dup");
    expect(s().repos).toHaveLength(1);
    expect(api.setSetting).toHaveBeenCalledTimes(1);
  });

  it("removeRepo clears currentRepo when the active repo is removed", () => {
    useRepoStore.setState({ repos: [{ path: "/r/a", name: "A" }], currentRepo: "/r/a" });
    s().removeRepo("/r/a");
    expect(s().repos).toEqual([]);
    expect(s().currentRepo).toBeNull();
    expect(api.setSetting).toHaveBeenCalledWith("repos", []);
  });

  it("setCurrentRepo resets all selection state and persists lastRepo", () => {
    useRepoStore.setState({
      selectedCommit: "abc",
      commitDetail: { hash: "abc", author: "T", email: "t", timestamp: 1, subject: "s", files: [] },
      selectedDiffFile: { path: "f.txt", isStaged: false },
      status: emptyStatus,
    });
    s().setCurrentRepo("/r/a");
    expect(s().currentRepo).toBe("/r/a");
    expect(s().selectedCommit).toBeNull();
    expect(s().commitDetail).toBeNull();
    expect(s().selectedDiffFile).toBeNull();
    expect(s().status).toBeNull();
    expect(api.setSetting).toHaveBeenCalledWith("lastRepo", "/r/a");
  });
});

describe("commit selection transitions", () => {
  it("selectCommit clears the cached commit detail", () => {
    useRepoStore.setState({ commitDetail: { hash: "old", author: "T", email: "t", timestamp: 1, subject: "s", files: [] } });
    s().selectCommit("abc");
    expect(s().selectedCommit).toBe("abc");
    expect(s().commitDetail).toBeNull();
  });
});

describe("refresh triggers", () => {
  it("setViewRef clears selection and refreshes silently with the new ref", async () => {
    useRepoStore.setState({ currentRepo: "/r/a", selectedCommit: "abc" });
    s().setViewRef("feature");
    expect(s().viewRef).toBe("feature");
    expect(s().selectedCommit).toBeNull();
    await vi.waitFor(() => expect(api.branches).toHaveBeenCalledWith("/r/a"));
    expect(api.log).toHaveBeenCalledWith("/r/a", 0, 200, {}, "feature");
    // silent refresh must not flip the loading flag on
    expect(s().loading).toBe(false);
  });

  it("setLogFilters resets pagination and refreshes with the filters", async () => {
    useRepoStore.setState({ currentRepo: "/r/a", logSkip: 400, hasMoreCommits: false });
    s().setLogFilters({ query: "fix" });
    expect(s().logSkip).toBe(0);
    expect(s().hasMoreCommits).toBe(true);
    await vi.waitFor(() => expect(api.log).toHaveBeenCalledWith("/r/a", 0, 200, { query: "fix" }, undefined));
  });
});

describe("refreshAll", () => {
  it("populates branches, log, status and graph refs on success", async () => {
    useRepoStore.setState({ currentRepo: "/r/a" });
    const e1 = entry("h1", "c1");
    const e2 = entry("h2", "c2", ["h1"]);
    api.branches.mockResolvedValue({
      success: true,
      data: {
        current: "main",
        all: ["main", "dev", "remotes/origin/main"],
        branches: { main: { commit: "h2" }, dev: { commit: "h1" } },
      },
    });
    api.log.mockResolvedValue({ success: true, data: [e2, e1] });

    await s().refreshAll();

    expect(s().branches).toEqual(["main", "dev"]);
    expect(s().remoteBranches).toEqual(["remotes/origin/main"]);
    expect(s().currentBranch).toBe("main");
    expect(s().logEntries).toEqual([e2, e1]);
    expect(s().logSkip).toBe(2);
    expect(s().hasMoreCommits).toBe(false);
    expect(s().graphData.branchRefs).toEqual({ h2: ["main"], h1: ["dev"] });
    expect(s().status).toMatchObject(emptyStatus);
    expect(s().ongoing).toBeNull();
    expect(s().loading).toBe(false);
    expect(s().error).toBeNull();
  });

  it("surfaces the branch error and stops loading on failure", async () => {
    useRepoStore.setState({ currentRepo: "/r/a" });
    api.branches.mockResolvedValue({ success: false, error: "not a git repository" });

    await s().refreshAll();

    expect(s().error).toBe("not a git repository");
    expect(s().loading).toBe(false);
    expect(s().logEntries).toEqual([]);
  });

  it("is a no-op without a current repo", async () => {
    await s().refreshAll();
    expect(api.branches).not.toHaveBeenCalled();
  });
});

describe("loadMoreCommits", () => {
  it("appends the next page and stops when a short page arrives", async () => {
    const e1 = entry("h1", "c1");
    const e2 = entry("h2", "c2", ["h1"]);
    useRepoStore.setState({ currentRepo: "/r/a", logEntries: [e1], logSkip: 1, hasMoreCommits: true });
    api.log.mockResolvedValue({ success: true, data: [e2] });

    await s().loadMoreCommits();

    expect(api.log).toHaveBeenCalledWith("/r/a", 1, 200, {}, undefined);
    expect(s().logEntries).toEqual([e1, e2]);
    expect(s().logSkip).toBe(2);
    expect(s().hasMoreCommits).toBe(false);
    expect(s().loadingMore).toBe(false);
  });

  it("does nothing without a current repo", async () => {
    await s().loadMoreCommits();
    expect(api.log).not.toHaveBeenCalled();
  });
});

describe("checkoutRemote", () => {
  it("sets the error from the failed result and clears loading", async () => {
    useRepoStore.setState({ currentRepo: "/r/a" });
    api.checkoutRemote.mockResolvedValue({ success: false, error: "branch exists" });
    await s().checkoutRemote("origin/feat");
    expect(s().error).toBe("branch exists");
    expect(s().loading).toBe(false);
  });
});

describe("incremental watch wiring", () => {
  it("starts the watcher when a repo is selected and stops it when cleared", async () => {
    s().setCurrentRepo("/r/a");
    expect(api.watchRepo).toHaveBeenCalledWith("/r/a");
    s().setCurrentRepo(null);
    expect(api.unwatchRepo).toHaveBeenCalled();
  });

  it("resets the fingerprint on repo switch so the first refresh is full", () => {
    useRepoStore.setState({ currentRepo: "/r/a", lastStatusFingerprint: "stale" });
    s().setCurrentRepo("/r/b");
    expect(s().lastStatusFingerprint).toBe("");
    expect(s().selectedFiles).toEqual([]);
  });
});

describe("silentDiffRefresh", () => {
  it("short-circuits when nothing changed (same fingerprint)", async () => {
    const statusA = { ...emptyStatus, modified: ["a.txt"], fingerprint: "fp-1" };
    api.status.mockResolvedValue({ success: true, data: statusA });
    api.log.mockResolvedValue({ success: true, data: [entry("h1", "c1")] });
    useRepoStore.setState({ currentRepo: "/r/a", lastStatusFingerprint: "seed" });
    // First call: fingerprint differs from seed -> full refresh runs.
    await s().silentDiffRefresh();
    expect(api.branches).toHaveBeenCalledTimes(1);
    const fpAfter = s().lastStatusFingerprint;
    expect(fpAfter).not.toBe("seed");

    // Second call: identical fingerprint -> no full refresh.
    api.branches.mockClear();
    await s().silentDiffRefresh();
    expect(api.branches).not.toHaveBeenCalled();
  });

  it("detects content changes through the repository fingerprint", async () => {
    api.status.mockResolvedValue({ success: true, data: { ...emptyStatus, fingerprint: "fp-1" } });
    useRepoStore.setState({ currentRepo: "/r/a", lastStatusFingerprint: "seed" });
    await s().silentDiffRefresh();
    api.branches.mockClear();

    api.status.mockResolvedValue({ success: true, data: { ...emptyStatus, fingerprint: "fp-2" } });
    await s().silentDiffRefresh();
    expect(api.branches).toHaveBeenCalledTimes(1);
  });

  it("skips while an operation is ongoing or loading", async () => {
    useRepoStore.setState({ currentRepo: "/r/a", ongoing: "rebase" });
    await s().silentDiffRefresh();
    expect(api.status).not.toHaveBeenCalled();
  });
});

describe("checkoutBranch", () => {
  it("switches via gitApi().checkout and refreshes", async () => {
    useRepoStore.setState({ currentRepo: "/r/a", currentBranch: "main" });
    await s().checkoutBranch("feat");
    expect(api.checkout).toHaveBeenCalledWith("/r/a", "feat");
    expect(api.branches).toHaveBeenCalled(); // refreshAll ran
    expect(s().loading).toBe(false);
  });

  it("is a no-op for the current branch", async () => {
    useRepoStore.setState({ currentRepo: "/r/a", currentBranch: "main" });
    await s().checkoutBranch("main");
    expect(api.checkout).not.toHaveBeenCalled();
  });

  it("surfaces checkout errors", async () => {
    api.checkout.mockResolvedValue({ success: false, error: "dirty tree" });
    useRepoStore.setState({ currentRepo: "/r/a", currentBranch: "main" });
    await s().checkoutBranch("feat");
    expect(s().error).toBe("dirty tree");
  });
});

describe("refreshAll fingerprint sync", () => {
  it("writes the fingerprint after a successful refresh", async () => {
    api.log.mockResolvedValue({ success: true, data: [entry("h1", "c1")] });
    api.status.mockResolvedValue({ success: true, data: { ...emptyStatus, fingerprint: "fp-1" } });
    useRepoStore.setState({ currentRepo: "/r/a" });
    await s().refreshAll();
    expect(s().lastStatusFingerprint).toBe("fp-1");
  });
});

describe("repo group transitions", () => {
  it("adds, updates and removes groups with persistence, ignoring name duplicates", () => {
    s().addRepoGroup("team", ["/r/a"]);
    expect(s().repoGroups).toEqual([{ name: "team", repos: ["/r/a"] }]);

    s().addRepoGroup("team", ["/r/b"]);
    expect(s().repoGroups).toHaveLength(1);

    s().updateRepoGroupRepos("team", ["/r/a", "/r/b"]);
    expect(s().repoGroups[0].repos).toEqual(["/r/a", "/r/b"]);
    expect(api.setSetting).toHaveBeenLastCalledWith("repoGroups", [{ name: "team", repos: ["/r/a", "/r/b"] }]);

    s().removeRepoGroup("team");
    expect(s().repoGroups).toEqual([]);
    expect(api.setSetting).toHaveBeenLastCalledWith("repoGroups", []);
  });
});

describe("tab set transitions", () => {
  it("openTab appends, persists and activates the repository", async () => {
    await s().openTab("/r/a");
    expect(s().customTabs).toEqual(["/r/a"]);
    expect(s().currentRepo).toBe("/r/a");
    expect(api.setSetting).toHaveBeenCalledWith("tabs", ["/r/a"]);
    expect(api.watchRepo).toHaveBeenCalledWith("/r/a");
  });

  it("openTab does not duplicate a tab that is already there", async () => {
    useRepoStore.setState({ customTabs: ["/r/a"], currentRepo: "/r/b" });
    await s().openTab("/r/a");
    expect(s().customTabs).toEqual(["/r/a"]);
    expect(s().currentRepo).toBe("/r/a");
  });

  it("closeTab removes, persists and activates the neighbour", () => {
    useRepoStore.setState({ customTabs: ["/r/a", "/r/b", "/r/c"], currentRepo: "/r/b" });
    s().closeTab("/r/b");
    expect(s().customTabs).toEqual(["/r/a", "/r/c"]);
    expect(s().currentRepo).toBe("/r/c");
    expect(api.setSetting).toHaveBeenCalledWith("tabs", ["/r/a", "/r/c"]);
  });

  it("closeTab drops the cached snapshot so a reopen starts clean", () => {
    useRepoStore.setState({ customTabs: ["/r/a"], currentRepo: "/r/b", repoCache: { "/r/a": snapshot() } });
    s().closeTab("/r/a");
    expect(s().repoCache["/r/a"]).toBeUndefined();
  });

  it("closeTab clears the repository when the last tab goes", () => {
    useRepoStore.setState({ customTabs: ["/r/a"], currentRepo: "/r/a" });
    s().closeTab("/r/a");
    expect(s().customTabs).toEqual([]);
    expect(s().currentRepo).toBeNull();
    expect(api.unwatchRepo).toHaveBeenCalled();
  });

  it("closeTab ignores a path that is not a tab", () => {
    useRepoStore.setState({ customTabs: ["/r/a"], currentRepo: "/r/a" });
    s().closeTab("/r/zzz");
    expect(s().customTabs).toEqual(["/r/a"]);
    expect(s().currentRepo).toBe("/r/a");
  });

  it("activateTab keeps the selection when the current tab is re-activated", async () => {
    useRepoStore.setState({ customTabs: ["/r/a"], currentRepo: "/r/a", selectedCommit: "h1" });
    await s().activateTab("/r/a");
    expect(s().selectedCommit).toBe("h1");
    expect(api.branches).not.toHaveBeenCalled();
  });

  it("reorderTabs moves a tab and persists the new order", () => {
    useRepoStore.setState({ customTabs: ["/r/a", "/r/b", "/r/c"] });
    s().reorderTabs(0, 2);
    expect(s().customTabs).toEqual(["/r/b", "/r/c", "/r/a"]);
    expect(api.setSetting).toHaveBeenCalledWith("tabs", ["/r/b", "/r/c", "/r/a"]);
  });

  it("reorderTabs ignores indexes that are equal or out of range", () => {
    useRepoStore.setState({ customTabs: ["/r/a", "/r/b"] });
    s().reorderTabs(1, 1);
    s().reorderTabs(0, 5);
    s().reorderTabs(-1, 1);
    expect(s().customTabs).toEqual(["/r/a", "/r/b"]);
    expect(api.setSetting).not.toHaveBeenCalled();
  });

  it("cycleTab wraps around in both directions", async () => {
    useRepoStore.setState({ customTabs: ["/r/a", "/r/b", "/r/c"], currentRepo: "/r/a" });
    await s().cycleTab(1);
    expect(s().currentRepo).toBe("/r/b");
    await s().cycleTab(-1);
    expect(s().currentRepo).toBe("/r/a");
    await s().cycleTab(-1);
    expect(s().currentRepo).toBe("/r/c");
  });

  it("cycleTab is a no-op with fewer than two tabs", async () => {
    useRepoStore.setState({ customTabs: ["/r/a"], currentRepo: "/r/a" });
    await s().cycleTab(1);
    expect(s().currentRepo).toBe("/r/a");
    useRepoStore.setState({ customTabs: [] });
    await s().cycleTab(1);
    expect(s().currentRepo).toBe("/r/a");
  });

  it("removeRepo closes the matching tab", () => {
    useRepoStore.setState({ repos: [{ path: "/r/a", name: "A" }], customTabs: ["/r/a", "/r/b"], currentRepo: "/r/b" });
    s().removeRepo("/r/a");
    expect(s().customTabs).toEqual(["/r/b"]);
    expect(s().currentRepo).toBe("/r/b");
  });
});

describe("group view", () => {
  it("enterGroupView snapshots the members and activates the first one", async () => {
    useRepoStore.setState({ repoGroups: [{ name: "team", repos: ["/r/a", "/r/b"] }], customTabs: ["/r/z"], currentRepo: "/r/z" });
    await s().enterGroupView("team");
    expect(s().groupView).toEqual({ name: "team", tabs: ["/r/a", "/r/b"] });
    expect(s().currentRepo).toBe("/r/a");
    // The custom set is what "back" restores, so entering must not touch it.
    expect(s().customTabs).toEqual(["/r/z"]);
  });

  it("enterGroupView keeps the current repository when the group contains it", async () => {
    useRepoStore.setState({ repoGroups: [{ name: "team", repos: ["/r/a", "/r/b"] }], currentRepo: "/r/b" });
    await s().enterGroupView("team");
    expect(s().currentRepo).toBe("/r/b");
  });

  it("enterGroupView on an empty group leaves no repository open", async () => {
    useRepoStore.setState({ repoGroups: [{ name: "team", repos: [] }], currentRepo: "/r/z" });
    await s().enterGroupView("team");
    expect(s().groupView).toEqual({ name: "team", tabs: [] });
    expect(s().currentRepo).toBeNull();
  });

  it("enterGroupView ignores an unknown group name", async () => {
    useRepoStore.setState({ currentRepo: "/r/z" });
    await s().enterGroupView("nope");
    expect(s().groupView).toBeNull();
    expect(s().currentRepo).toBe("/r/z");
  });

  it("tab edits made in group view die with the snapshot", async () => {
    useRepoStore.setState({ groupView: { name: "team", tabs: ["/r/a", "/r/b"] }, customTabs: ["/r/z"], currentRepo: "/r/a" });
    await s().openTab("/r/c");
    expect(s().groupView).toEqual({ name: "team", tabs: ["/r/a", "/r/b", "/r/c"] });
    expect(s().customTabs).toEqual(["/r/z"]);

    s().closeTab("/r/c");
    expect(s().groupView).toEqual({ name: "team", tabs: ["/r/a", "/r/b"] });
    // Group view is in-memory only: the persisted tab set never changes.
    expect(api.setSetting).not.toHaveBeenCalledWith("tabs", expect.anything());
  });

  it("reordering in group view touches the snapshot only", () => {
    useRepoStore.setState({ groupView: { name: "team", tabs: ["/r/a", "/r/b"] }, customTabs: ["/r/z"] });
    s().reorderTabs(0, 1);
    expect(s().groupView).toEqual({ name: "team", tabs: ["/r/b", "/r/a"] });
    expect(s().customTabs).toEqual(["/r/z"]);
  });

  it("exitGroupView restores the custom tab set", async () => {
    useRepoStore.setState({ groupView: { name: "team", tabs: ["/r/a"] }, customTabs: ["/r/z"], currentRepo: "/r/a" });
    await s().exitGroupView();
    expect(s().groupView).toBeNull();
    expect(s().currentRepo).toBe("/r/z");
  });

  it("exitGroupView keeps a repository that is also a custom tab", async () => {
    useRepoStore.setState({ groupView: { name: "team", tabs: ["/r/a"] }, customTabs: ["/r/a", "/r/z"], currentRepo: "/r/a" });
    await s().exitGroupView();
    expect(s().groupView).toBeNull();
    expect(s().currentRepo).toBe("/r/a");
  });

  it("exitGroupView with no custom tabs left closes everything", async () => {
    useRepoStore.setState({ groupView: { name: "team", tabs: ["/r/a"] }, customTabs: [], currentRepo: "/r/a" });
    await s().exitGroupView();
    expect(s().currentRepo).toBeNull();
  });

  it("exitGroupView is a no-op outside group view", async () => {
    useRepoStore.setState({ customTabs: ["/r/z"], currentRepo: "/r/z" });
    await s().exitGroupView();
    expect(s().currentRepo).toBe("/r/z");
  });

  it("deleting the group on screen leaves group view", () => {
    useRepoStore.setState({
      repoGroups: [{ name: "team", repos: ["/r/a"] }],
      groupView: { name: "team", tabs: ["/r/a"] },
      customTabs: ["/r/z"],
      currentRepo: "/r/a",
    });
    s().removeRepoGroup("team");
    expect(s().groupView).toBeNull();
    expect(s().currentRepo).toBe("/r/z");
  });
});

describe("per-repository snapshot cache", () => {
  it("caches every refresh by repository path", async () => {
    api.log.mockResolvedValue({ success: true, data: [entry("h1", "c1")] });
    useRepoStore.setState({ currentRepo: "/r/a" });
    await s().refreshAll();
    expect(s().repoCache["/r/a"].currentBranch).toBe("main");
    expect(s().repoCache["/r/a"].logEntries.map((e) => e.hash)).toEqual(["h1"]);
    expect(s().repoCache["/r/a"].fetchedAt).toBeGreaterThan(0);
  });

  it("restores a cached snapshot synchronously when its tab is re-activated", async () => {
    api.log.mockResolvedValue({ success: true, data: [entry("h1", "c1")] });
    api.branches.mockResolvedValue({ success: true, data: { current: "main", all: ["main", "dev"], branches: {} } });
    useRepoStore.setState({ currentRepo: "/r/a" });
    await s().refreshAll();
    await s().openTab("/r/b");

    // Stall the background refresh: what is on screen must come from the cache.
    api.branches.mockImplementation(stall);
    void s().activateTab("/r/a");
    expect(s().branches).toEqual(["main", "dev"]);
    expect(s().currentBranch).toBe("main");
    expect(s().logEntries.map((e) => e.hash)).toEqual(["h1"]);
  });

  it("blanks the previous repository's data when the new tab has no cache", async () => {
    api.log.mockResolvedValue({ success: true, data: [entry("h1", "c1")] });
    useRepoStore.setState({ currentRepo: "/r/a" });
    await s().refreshAll();
    expect(s().logEntries).toHaveLength(1);

    api.branches.mockImplementation(stall);
    void s().activateTab("/r/b");
    expect(s().logEntries).toEqual([]);
    expect(s().currentBranch).toBe("");
    expect(s().status).toBeNull();
    expect(s().ongoing).toBeNull();
    expect(s().viewRef).toBeNull();
  });

  it("refreshes silently when the cache already has something to show", async () => {
    useRepoStore.setState({ currentRepo: "/r/a", repoCache: { "/r/a": snapshot() } });
    await s().openTab("/r/b");
    api.branches.mockImplementation(stall);
    void s().activateTab("/r/a");
    // A silent refresh must not put a spinner over data that is already painted.
    expect(s().loading).toBe(false);
  });

  it("only feeds the cache when refreshing a repository that is not on screen", async () => {
    useRepoStore.setState({ currentRepo: "/r/b", currentBranch: "b-main" });
    await s().refreshAll("/r/a");
    expect(s().repoCache["/r/a"].currentBranch).toBe("main");
    expect(s().currentBranch).toBe("b-main");
    expect(s().branches).toEqual([]);
  });

  it("evicts the stalest snapshots past the cache cap", async () => {
    for (let i = 0; i < 34; i++) {
      useRepoStore.setState({ currentRepo: `/r/${i}` });
      await s().refreshAll();
    }
    expect(Object.keys(s().repoCache)).toHaveLength(32);
    expect(s().repoCache["/r/0"]).toBeUndefined();
    expect(s().repoCache["/r/33"]).toBeDefined();
  });
});

describe("per-repository refresh sequencing", () => {
  it("lets a late answer fill its own cache without touching the visible tab", async () => {
    let resolveA: (value: unknown) => void = () => {};
    api.branches.mockImplementation((repo: string) => {
      if (repo === "/r/a") return new Promise((res) => { resolveA = res; });
      return Promise.resolve({ success: true, data: { current: "b-main", all: ["b-main"], branches: {} } });
    });

    useRepoStore.setState({ currentRepo: "/r/a" });
    const pending = s().refreshAll("/r/a");

    // The user switches tab while A is still in flight.
    useRepoStore.setState({ currentRepo: "/r/b" });
    await s().refreshAll("/r/b");
    expect(s().currentBranch).toBe("b-main");

    resolveA({ success: true, data: { current: "a-main", all: ["a-main"], branches: {} } });
    await pending;
    expect(s().currentBranch).toBe("b-main");
    expect(s().repoCache["/r/a"].currentBranch).toBe("a-main");
  });

  it("ignores a watch-driven probe that lands after a tab switch", async () => {
    const resolvers: ((value: unknown) => void)[] = [];
    api.status.mockImplementation(() => new Promise((res) => { resolvers.push(res); }));
    useRepoStore.setState({ currentRepo: "/r/a", lastStatusFingerprint: "seed" });

    const pending = s().silentDiffRefresh();
    useRepoStore.setState({ currentRepo: "/r/b" });
    resolvers[0]({ success: true, data: emptyStatus });
    await pending;

    // A's fingerprint must not be written while B is on screen.
    expect(s().lastStatusFingerprint).toBe("seed");
    expect(api.branches).not.toHaveBeenCalled();
  });

  it("drops a paginated page when the user switched tab mid-flight", async () => {
    const resolvers: ((value: unknown) => void)[] = [];
    api.log.mockImplementation(() => new Promise((res) => { resolvers.push(res); }));
    useRepoStore.setState({ currentRepo: "/r/a", logEntries: [entry("h1", "c1")], logSkip: 1, hasMoreCommits: true });

    const pending = s().loadMoreCommits();
    expect(s().loadingMore).toBe(true);

    // Switching tab starts a refresh, which also releases the pagination flag.
    api.branches.mockImplementation(stall);
    void s().activateTab("/r/b");
    resolvers[0]({ success: true, data: [entry("h2", "c2", ["h1"])] });
    await pending;

    expect(s().logEntries).toEqual([]);
    expect(s().loadingMore).toBe(false);
  });
});

describe("tab persistence on startup", () => {
  it("restores the saved tab set and the last active tab", async () => {
    api.getSettings.mockResolvedValue({
      repos: [{ path: "/r/a", name: "A" }, { path: "/r/b", name: "B" }],
      tabs: ["/r/a", "/r/b"],
      lastRepo: "/r/b",
    });
    await s().initFromSettings();
    expect(s().customTabs).toEqual(["/r/a", "/r/b"]);
    expect(s().currentRepo).toBe("/r/b");
  });

  it("seeds the first tab from lastRepo when no tab set was saved", async () => {
    api.getSettings.mockResolvedValue({ repos: [{ path: "/r/a", name: "A" }], lastRepo: "/r/a" });
    await s().initFromSettings();
    expect(s().customTabs).toEqual(["/r/a"]);
    expect(s().currentRepo).toBe("/r/a");
    expect(api.setSetting).toHaveBeenCalledWith("tabs", ["/r/a"]);
  });

  it("falls back to the head of the tab set when lastRepo is no longer a tab", async () => {
    api.getSettings.mockResolvedValue({ tabs: ["/r/a", "/r/b"], lastRepo: "/r/removed" });
    await s().initFromSettings();
    expect(s().currentRepo).toBe("/r/a");
  });

  it("ignores malformed tab entries", async () => {
    api.getSettings.mockResolvedValue({ tabs: ["/r/a", 42, null] });
    await s().initFromSettings();
    expect(s().customTabs).toEqual(["/r/a"]);
    expect(s().currentRepo).toBe("/r/a");
  });

  it("opens nothing when there is no tab and no known last repository", async () => {
    api.getSettings.mockResolvedValue({ repos: [{ path: "/r/a", name: "A" }] });
    await s().initFromSettings();
    expect(s().customTabs).toEqual([]);
    expect(s().currentRepo).toBeNull();
  });
});
