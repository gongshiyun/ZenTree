import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CommitLogEntry, GitStatusData } from "../src/types";

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
    branches: vi.fn(async () => ({ success: true, data: { current: "main", all: ["main"], branches: {} } })),
    log: vi.fn(async () => ({ success: true, data: [] as CommitLogEntry[] })),
    status: vi.fn(async () => ({ success: true, data: emptyStatus })),
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
    expect(s().status).toEqual(emptyStatus);
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
    const statusA = { ...emptyStatus, modified: ["a.txt"] };
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

  it("detects HEAD moves in detached state via the head hash", async () => {
    api.status.mockResolvedValue({ success: true, data: emptyStatus });
    api.log.mockResolvedValue({ success: true, data: [entry("h1", "c1")] });
    useRepoStore.setState({ currentRepo: "/r/a", lastStatusFingerprint: "seed" });
    await s().silentDiffRefresh();
    api.branches.mockClear();

    api.log.mockResolvedValue({ success: true, data: [entry("h2", "c2")] }); // new HEAD, same status
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
    useRepoStore.setState({ currentRepo: "/r/a" });
    await s().refreshAll();
    expect(s().lastStatusFingerprint).toContain("h1");
    expect(s().lastStatusFingerprint).toContain("main");
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
