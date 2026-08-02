import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { GitRepository, parseHostingUrl } from "../electron/gitRepository";

/**
 * Integration tests against a real `git` binary.
 * Each test operates on an isolated temporary repository.
 */
const repo = new GitRepository(() => "git");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zentree-test-"));
const repos: string[] = [];

function makeRepo(name: string): string {
  const dir = path.join(tempRoot, name);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  repos.push(dir);
  return dir;
}

async function initRepo(dir: string): Promise<void> {
  await repo["git"](dir).raw(["init", "-b", "main"]);
  await repo.setConfig(dir, "user.name", "Test User");
  await repo.setConfig(dir, "user.email", "test@example.com");
}

function writeFile(dir: string, rel: string, content: string): string {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  return rel;
}

async function commitAll(dir: string, message: string): Promise<string> {
  await repo["git"](dir).add(".");
  await repo["git"](dir).commit(message);
  const log = await repo.log(dir, 0, 1);
  return log[0].hash;
}

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("clone", () => {
  it("clones a remote repository with its commits and branch", async () => {
    const src = makeRepo("clone-src");
    await initRepo(src);
    writeFile(src, "a.txt", "hello\n");
    const hash = await commitAll(src, "initial");
    await repo["git"](src).branch(["-M", "main"]);

    const bare = makeRepo("clone-bare");
    fs.rmdirSync(bare);
    await repo["git"](src).raw(["clone", "--bare", src, bare]);
    await repo["git"](src).raw(["remote", "add", "origin", bare]);
    await repo["git"](src).raw(["push", "-u", "origin", "main"]);

    const dest = makeRepo("clone-dest");
    fs.rmdirSync(dest);
    const cloned = await repo.clone(bare, dest);
    expect(cloned).toBe(dest);
    expect(await repo.isRepo(dest)).toBe(true);
    const log = await repo.log(dest, 0, 10);
    expect(log).toHaveLength(1);
    expect(log[0].hash).toBe(hash);
    expect(log[0].subject).toBe("initial");
  });

  it("fails when destination directory is not empty", async () => {
    const src = makeRepo("clone-src2");
    await initRepo(src);
    writeFile(src, "a.txt", "x");
    await commitAll(src, "c1");
    const dest = makeRepo("clone-dest2");
    writeFile(dest, "occupied.txt", "blocker");
    await expect(repo.clone(src, dest)).rejects.toThrow(/not empty/i);
  });
});

describe("working-tree diffs", () => {
  it("reads the content of an untracked file", async () => {
    const dir = makeRepo("untracked-read");
    await initRepo(dir);
    writeFile(dir, "u.txt", "untracked content\n");
    const content = await repo.readWorkingFile(dir, "u.txt");
    expect(content).toBe("untracked content\n");
  });

  it("rejects reading a missing file", async () => {
    const dir = makeRepo("missing-read");
    await initRepo(dir);
    await expect(repo.readWorkingFile(dir, "nope.txt")).rejects.toThrow();
  });

  it("shows a deletion for the source of an uncommitted rename", async () => {
    const dir = makeRepo("rename-away");
    await initRepo(dir);
    writeFile(dir, "old.txt", "same content\n");
    await commitAll(dir, "initial");
    // Filesystem rename (not staged) so `git diff` must detect it with -M.
    fs.renameSync(path.join(dir, "old.txt"), path.join(dir, "new.txt"));
    const diff = await repo.diffFile(dir, "old.txt", false);
    expect(diff).toContain("deleted file mode");
    expect(diff).toContain("-same content");
  });

  it("shows a diff for a staged rename", async () => {
    const dir = makeRepo("rename-staged");
    await initRepo(dir);
    writeFile(dir, "old.txt", "same content\n");
    await commitAll(dir, "initial");
    await repo["git"](dir).raw(["mv", "old.txt", "new.txt"]);
    const diff = await repo.diffFile(dir, "new.txt", true, "old.txt");
    expect(diff).toContain("rename from old.txt");
    expect(diff).toContain("rename to new.txt");
  });
});

describe("stage all / unstage all", () => {
  it("stages and unstages every change including untracked files", async () => {
    const dir = makeRepo("stage-all");
    await initRepo(dir);
    writeFile(dir, "a.txt", "1\n");
    await commitAll(dir, "initial");

    writeFile(dir, "a.txt", "1\n2\n");
    writeFile(dir, "new.txt", "new\n");
    await repo.stageAll(dir);

    let st = await repo.status(dir);
    expect(st.staged).toContain("a.txt");
    expect(st.created).toContain("new.txt");

    await repo.unstageAll(dir);
    st = await repo.status(dir);
    expect(st.staged).not.toContain("a.txt");
    expect(st.modified).toContain("a.txt");
    expect(st.not_added).toContain("new.txt");
  });
});

describe("commit stats", () => {
  it("reports per-file add/delete line counts", async () => {
    const dir = makeRepo("commit-stats");
    await initRepo(dir);
    writeFile(dir, "a.txt", "1\n2\n3\n");
    await commitAll(dir, "initial");
    writeFile(dir, "a.txt", "1\n3\n4\n");
    writeFile(dir, "b.txt", "x\n");
    const hash = await commitAll(dir, "second");

    const stats = await repo.commitStats(dir, hash);
    const a = stats.find((s) => s.path === "a.txt");
    const b = stats.find((s) => s.path === "b.txt");
    expect(a?.additions).toBe(1);
    expect(a?.deletions).toBe(1);
    expect(b?.additions).toBe(1);
    expect(b?.deletions).toBe(0);

    const detail = await repo.show(dir, hash);
    expect(detail.stats).toHaveLength(2);
  });
});

describe("log with ref", () => {
  it("returns commits reachable from the given ref", async () => {
    const dir = makeRepo("log-ref");
    await initRepo(dir);
    writeFile(dir, "a.txt", "1\n");
    await commitAll(dir, "base");
    await repo["git"](dir).raw(["checkout", "-b", "feature"]);
    writeFile(dir, "a.txt", "1\n2\n");
    await commitAll(dir, "feature-commit");
    await repo["git"](dir).raw(["checkout", "main"]);

    const featureLog = await repo.log(dir, 0, 10, undefined, "feature");
    expect(featureLog[0].subject).toBe("feature-commit");
    const mainLog = await repo.log(dir, 0, 10, undefined, "main");
    expect(mainLog[0].subject).toBe("base");
    expect(mainLog).toHaveLength(1);
  });
});

describe("interactive rebase", () => {
  async function makeLinear(dir: string): Promise<string[]> {
    await initRepo(dir);
    writeFile(dir, "a.txt", "a\n");
    await commitAll(dir, "c1");
    writeFile(dir, "b.txt", "b\n");
    await commitAll(dir, "c2");
    writeFile(dir, "c.txt", "c\n");
    await commitAll(dir, "c3");
    return (await repo.logRange(dir, "HEAD~2", "HEAD")).map((c) => c.hash);
  }

  it("lists commits in oldest-first order", async () => {
    const dir = makeRepo("rebase-range");
    const range = await makeLinear(dir);
    expect(range).toHaveLength(2);
    const subjects = (await repo.logRange(dir, "HEAD~2", "HEAD")).map((c) => c.subject);
    expect(subjects).toEqual(["c2", "c3"]);
  });

  it("squashes commits into the previous one", async () => {
    const dir = makeRepo("rebase-squash");
    const [c2, c3] = await makeLinear(dir);
    const subjects = (await repo.logRange(dir, "HEAD~2", "HEAD")).map((c) => c.subject);
    await repo.rebaseInteractive(dir, "HEAD~2", [
      { action: "pick", hash: c2, subject: subjects[0] },
      { action: "squash", hash: c3, subject: subjects[1] },
    ]);
    const log = await repo.log(dir, 0, 10);
    expect(log).toHaveLength(2); // c1 + (c3 squashed into c2)
  });

  it("drops a commit", async () => {
    const dir = makeRepo("rebase-drop");
    const [c2, c3] = await makeLinear(dir);
    const subjects = (await repo.logRange(dir, "HEAD~2", "HEAD")).map((c) => c.subject);
    await repo.rebaseInteractive(dir, "HEAD~2", [
      { action: "drop", hash: c2, subject: subjects[0] },
      { action: "pick", hash: c3, subject: subjects[1] },
    ]);
    const log = await repo.log(dir, 0, 10);
    expect(log).toHaveLength(2);
    expect(log[0].subject).toBe("c3");
    expect(log[1].subject).toBe("c1");
  });

  it("rewrites a commit message", async () => {
    const dir = makeRepo("rebase-reword");
    const [c2, c3] = await makeLinear(dir);
    const subjects = (await repo.logRange(dir, "HEAD~2", "HEAD")).map((c) => c.subject);
    await repo.rebaseInteractive(dir, "HEAD~2", [
      { action: "reword", hash: c2, subject: subjects[0], rewordMessage: "c2-rewritten" },
      { action: "pick", hash: c3, subject: subjects[1] },
    ]);
    const log = await repo.log(dir, 0, 10);
    expect(log).toHaveLength(3);
    expect(log[1].subject).toBe("c2-rewritten");
  });

  it("reorders commits", async () => {
    const dir = makeRepo("rebase-reorder");
    const [c2, c3] = await makeLinear(dir);
    const subjects = (await repo.logRange(dir, "HEAD~2", "HEAD")).map((c) => c.subject);
    await repo.rebaseInteractive(dir, "HEAD~2", [
      { action: "pick", hash: c3, subject: subjects[1] },
      { action: "pick", hash: c2, subject: subjects[0] },
    ]);
    const log = await repo.log(dir, 0, 10);
    expect(log[0].subject).toBe("c2");
    expect(log[1].subject).toBe("c3");
    expect(log[2].subject).toBe("c1");
  });
});

describe("remote branch operations", () => {
  async function makeBareSetup(): Promise<{ src: string; bare: string; work: string }> {
    const src = makeRepo("remote-src");
    await initRepo(src);
    writeFile(src, "a.txt", "hello\n");
    await commitAll(src, "initial");
    await repo["git"](src).branch(["-M", "main"]);
    const bare = makeRepo(`remote-bare-${Math.random().toString(36).slice(2, 8)}`);
    fs.rmdirSync(bare);
    await repo["git"](src).raw(["clone", "--bare", src, bare]);
    await repo["git"](src).raw(["remote", "add", "origin", bare]);
    await repo["git"](src).raw(["push", "-u", "origin", "main"]);
    const work = makeRepo("remote-work");
    fs.rmdirSync(work);
    await repo["git"](src).raw(["clone", bare, work]);
    return { src, bare, work };
  }

  it("pushes a branch, fetches it, deletes it and prunes", async () => {
    const { src, work } = await makeBareSetup();
    await repo["git"](work).raw(["checkout", "-b", "feat"]);
    writeFile(work, "b.txt", "b\n");
    await commitAll(work, "feat commit");

    await repo.pushBranch(work, "origin", "feat");
    await repo.fetchBranch(src, "origin", "feat");
    expect(await repo["git"](src).raw(["branch", "-r"])).toContain("origin/feat");

    await repo.deleteRemoteBranch(work, "origin", "feat");
    await repo.pruneRemote(src, "origin");
    const after = await repo["git"](src).raw(["branch", "-r"]);
    expect(after).not.toContain("feat");
  });

  it("pulls a specific branch", async () => {
    const { src, work } = await makeBareSetup();
    // src adds a commit and pushes; work pulls it by branch name
    writeFile(src, "a.txt", "hello\nworld\n");
    await commitAll(src, "update from src");
    await repo["git"](src).raw(["push", "origin", "main"]);

    await repo.pullBranch(work, "origin", "main");
    const content = fs.readFileSync(path.join(work, "a.txt"), "utf8").replace(/\r/g, "");
    expect(content).toBe("hello\nworld\n");
  });
});

describe("branch rename & tracking", () => {
  it("renames a local branch", async () => {
    const dir = makeRepo("branch-rename");
    await initRepo(dir);
    writeFile(dir, "a.txt", "1\n");
    await commitAll(dir, "init");
    await repo["git"](dir).raw(["branch", "feature"]);
    await repo.renameBranch(dir, "feature", "renamed");
    const branches = await repo.branches(dir);
    expect(branches.all).toContain("renamed");
    expect(branches.all).not.toContain("feature");
  });

  it("sets, reads and unsets upstream and computes ahead/behind", async () => {
    const src = makeRepo("upstream-src");
    await initRepo(src);
    writeFile(src, "a.txt", "1\n");
    await commitAll(src, "init");
    await repo["git"](src).branch(["-M", "main"]);
    const bare = makeRepo(`upstream-bare-${Math.random().toString(36).slice(2, 8)}`);
    fs.rmdirSync(bare);
    await repo["git"](src).raw(["clone", "--bare", src, bare]);
    await repo["git"](src).raw(["remote", "add", "origin", bare]);
    await repo["git"](src).raw(["push", "-u", "origin", "main"]);
    const work = makeRepo(`upstream-work-${Math.random().toString(36).slice(2, 8)}`);
    fs.rmdirSync(work);
    await repo["git"](src).raw(["clone", bare, work]);

    expect(await repo.getUpstream(work, "main")).toBe("origin/main");
    writeFile(work, "b.txt", "b\n");
    await commitAll(work, "local");
    const tracking = await repo.branchTracking(work);
    const main = tracking.find((b) => b.name === "main");
    expect(main?.upstream).toBe("origin/main");
    expect(main?.ahead).toBe(1);
    expect(main?.behind).toBe(0);

    await repo.unsetUpstream(work, "main");
    expect(await repo.getUpstream(work, "main")).toBeNull();
    await repo.setUpstream(work, "main", "origin");
    expect(await repo.getUpstream(work, "main")).toBe("origin/main");
  });
});

describe("stash with message and paths", () => {
  it("stashes only the requested files with a message", async () => {
    const dir = makeRepo("stash-paths");
    await initRepo(dir);
    writeFile(dir, "a.txt", "1\n");
    writeFile(dir, "b.txt", "x\n");
    await commitAll(dir, "init");
    writeFile(dir, "a.txt", "1\n2\n");
    writeFile(dir, "b.txt", "x\ny\n");

    await repo.stashSave(dir, "keep b only", ["b.txt"]);
    const list = await repo.stashList(dir);
    expect(list[0].subject).toContain("keep b only");
    const st = await repo.status(dir);
    expect(st.modified).toContain("a.txt");
    expect(st.modified).not.toContain("b.txt");
  });
});

describe("conflict abort / continue", () => {
  async function makeConflictedBranch(dir: string): Promise<void> {
    await initRepo(dir);
    writeFile(dir, "f.txt", "base\n");
    await commitAll(dir, "base");
    await repo["git"](dir).raw(["checkout", "-b", "side"]);
    writeFile(dir, "f.txt", "side\n");
    await commitAll(dir, "side");
    await repo["git"](dir).raw(["checkout", "main"]);
    writeFile(dir, "f.txt", "main\n");
    await commitAll(dir, "main");
  }

  it("detects and aborts a conflicted merge", async () => {
    const dir = makeRepo("merge-abort");
    await makeConflictedBranch(dir);
    await expect(repo.merge(dir, "side")).rejects.toThrow();
    expect(await repo.getOngoingOperation(dir)).toBe("merge");
    await repo.mergeAbort(dir);
    expect(await repo.getOngoingOperation(dir)).toBeNull();
  });

  it("continues a rebase after resolving the conflict", async () => {
    const dir = makeRepo("rebase-continue");
    await makeConflictedBranch(dir);
    await repo["git"](dir).raw(["checkout", "side"]);
    await expect(repo.rebase(dir, "main")).rejects.toThrow();
    expect(await repo.getOngoingOperation(dir)).toBe("rebase");
    // Resolve by taking the rebased commit's version (theirs during rebase).
    await repo["git"](dir).raw(["checkout", "--theirs", "f.txt"]);
    await repo["git"](dir).raw(["add", "f.txt"]);
    await repo.rebaseContinue(dir);
    expect(await repo.getOngoingOperation(dir)).toBeNull();
    const log = await repo.log(dir, 0, 10);
    expect(log[0].subject).toBe("side");
    expect(fs.readFileSync(path.join(dir, "f.txt"), "utf8").trim()).toBe("side");
  });
});

describe("pull strategies", () => {
  async function makeDiverged(): Promise<{ src: string; work: string }> {
    const src = makeRepo("pull-src");
    await initRepo(src);
    writeFile(src, "a.txt", "1\n");
    await commitAll(src, "init");
    await repo["git"](src).branch(["-M", "main"]);
    const bare = makeRepo(`pull-bare-${Math.random().toString(36).slice(2, 8)}`);
    fs.rmdirSync(bare);
    await repo["git"](src).raw(["clone", "--bare", src, bare]);
    await repo["git"](src).raw(["remote", "add", "origin", bare]);
    await repo["git"](src).raw(["push", "-u", "origin", "main"]);
    const work = makeRepo(`pull-work-${Math.random().toString(36).slice(2, 8)}`);
    fs.rmdirSync(work);
    await repo["git"](src).raw(["clone", bare, work]);
    // diverge: local commit on work, remote commit on src
    writeFile(work, "b.txt", "b\n");
    await commitAll(work, "local");
    writeFile(src, "a.txt", "1\n2\n");
    await commitAll(src, "remote");
    await repo["git"](src).raw(["push", "origin", "main"]);
    return { src, work };
  }

  it("ff-only refuses to pull when branches diverge", async () => {
    const { work } = await makeDiverged();
    await expect(repo.pull(work, "ff-only")).rejects.toThrow();
  });

  it("rebase strategy replays local commits on top of remote", async () => {
    const { work } = await makeDiverged();
    await repo.pull(work, "rebase");
    const log = await repo.log(work, 0, 10);
    expect(log[0].subject).toBe("local");
    expect(fs.existsSync(path.join(work, "b.txt"))).toBe(true);
    expect(fs.readFileSync(path.join(work, "a.txt"), "utf8")).toContain("2");
  });
});

describe("submodules", () => {
  it("adds, lists, updates and deinitializes a submodule", async () => {
    const sub = makeRepo("sub-source");
    await initRepo(sub);
    writeFile(sub, "s.txt", "s\n");
    await commitAll(sub, "s1");
    const bare = makeRepo(`sub-bare-${Math.random().toString(36).slice(2, 8)}`);
    fs.rmdirSync(bare);
    await repo["git"](sub).raw(["clone", "--bare", sub, bare]);

    const parent = makeRepo("sub-parent");
    await initRepo(parent);
    writeFile(parent, "p.txt", "p\n");
    await commitAll(parent, "p1");
    await repo.submoduleAdd(parent, bare, "libs/sublib");

    let list = await repo.submoduleList(parent);
    expect(list).toHaveLength(1);
    expect(list[0].path).toBe("libs/sublib");

    await repo.submoduleUpdate(parent);
    expect(fs.existsSync(path.join(parent, "libs", "sublib", "s.txt"))).toBe(true);

    await repo.submoduleDeinit(parent, "libs/sublib");
    list = await repo.submoduleList(parent);
    expect(list).toHaveLength(0);
  });
});

describe("commit template, gpg signing and diff tool config", () => {
  it("sets and reads a commit template", async () => {
    const dir = makeRepo("template");
    await initRepo(dir);
    expect(await repo.getCommitTemplate(dir)).toBe("");
    await repo.setCommitTemplate(dir, "# Title\n\nBody\n");
    expect(await repo.getCommitTemplate(dir)).toContain("# Title");
  });

  it("toggles gpg signing config", async () => {
    const dir = makeRepo("gpg-config");
    await initRepo(dir);
    await repo.setSignCommits(dir, true);
    expect(await repo.getSignCommits(dir)).toBe(true);
    await repo.setSignCommits(dir, false);
    expect(await repo.getSignCommits(dir)).toBe(false);
  });

  it("sets and reads the diff tool config", async () => {
    const dir = makeRepo("difftool-config");
    await initRepo(dir);
    await repo.setDiffTool(dir, "vimdiff");
    expect(await repo.getDiffTool(dir)).toBe("vimdiff");
    await repo.setDiffTool(dir, "");
    expect(await repo.getDiffTool(dir)).toBe("");
  });
});

describe("fileHistory", () => {
  it("returns commits touching the file, newest first", async () => {
    const dir = makeRepo("history");
    await initRepo(dir);
    writeFile(dir, "f.txt", "one\n");
    await commitAll(dir, "first");
    writeFile(dir, "f.txt", "one\ntwo\n");
    await commitAll(dir, "second");
    const entries = await repo.fileHistory(dir, "f.txt");
    expect(entries).toHaveLength(2);
    expect(entries[0].subject).toBe("second");
    expect(entries[1].subject).toBe("first");
    expect(entries[0].author).toBe("Test User");
    expect(entries[0].timestamp).toBeGreaterThan(0);
  });

  it("returns empty list for a file never committed", async () => {
    const dir = makeRepo("history-empty");
    await initRepo(dir);
    writeFile(dir, "f.txt", "x");
    await commitAll(dir, "c1");
    writeFile(dir, "untracked.txt", "y");
    const entries = await repo.fileHistory(dir, "untracked.txt");
    expect(entries).toEqual([]);
  });
});

describe("blame", () => {
  it("maps each line to its introducing commit", async () => {
    const dir = makeRepo("blame");
    await initRepo(dir);
    writeFile(dir, "b.txt", "line one\nline two\n");
    const h1 = await commitAll(dir, "add two lines");
    writeFile(dir, "b.txt", "line one\nline two changed\nline three\n");
    const h2 = await commitAll(dir, "change second line");
    const lines = await repo.blame(dir, "b.txt");
    expect(lines).toHaveLength(3);
    expect(lines[0].content).toBe("line one");
    expect(lines[0].hash).toBe(h1);
    expect(lines[1].hash).toBe(h2);
    expect(lines[2].hash).toBe(h2);
    expect(lines.map((l) => l.lineNumber)).toEqual([1, 2, 3]);
  });

  it("blames a historical version when a hash is given", async () => {
    const dir = makeRepo("blame-hist");
    await initRepo(dir);
    writeFile(dir, "b.txt", "old\n");
    const h1 = await commitAll(dir, "old version");
    writeFile(dir, "b.txt", "new\n");
    await commitAll(dir, "new version");
    const lines = await repo.blame(dir, "b.txt", h1);
    expect(lines).toHaveLength(1);
    expect(lines[0].content).toBe("old");
  });
});

describe("revertCommit", () => {
  it("creates a revert commit restoring the previous state", async () => {
    const dir = makeRepo("revert");
    await initRepo(dir);
    writeFile(dir, "r.txt", "base\n");
    await commitAll(dir, "base");
    writeFile(dir, "r.txt", "base\nchanged\n");
    const badHash = await commitAll(dir, "bad change");
    await repo.revertCommit(dir, badHash);
    const content = fs.readFileSync(path.join(dir, "r.txt"), "utf8");
    expect(content.replace(/\r\n/g, "\n")).toBe("base\n");
    const log = await repo.log(dir, 0, 3);
    expect(log[0].subject).toMatch(/^Revert/);
  });
});

describe("compare", () => {
  it("reports ahead/behind and per-file stats between branches", async () => {
    const dir = makeRepo("compare");
    await initRepo(dir);
    writeFile(dir, "m.txt", "base\n");
    await commitAll(dir, "base");
    await repo["git"](dir).checkoutLocalBranch("feature");
    writeFile(dir, "m.txt", "base\nfeature line\n");
    await commitAll(dir, "feature commit");
    await repo["git"](dir).checkout("main");
    writeFile(dir, "m.txt", "base\nmain line\n");
    await commitAll(dir, "main commit");

    const res = await repo.compare(dir, "main", "feature");
    expect(res.ahead).toBe(1);
    expect(res.behind).toBe(1);
    expect(res.files.length).toBeGreaterThanOrEqual(1);
    const file = res.files.find((f) => f.path === "m.txt");
    expect(file).toBeDefined();
    expect(file!.additions).toBeGreaterThan(0);
    expect(res.totalAdditions).toBeGreaterThan(0);

    const reverse = await repo.compare(dir, "feature", "main");
    expect(reverse.ahead).toBe(1);
    expect(reverse.behind).toBe(1);
  });

  it("returns empty file list for identical refs", async () => {
    const dir = makeRepo("compare-same");
    await initRepo(dir);
    writeFile(dir, "s.txt", "x\n");
    await commitAll(dir, "c1");
    const res = await repo.compare(dir, "HEAD", "HEAD");
    expect(res.files).toEqual([]);
    expect(res.ahead).toBe(0);
    expect(res.behind).toBe(0);
  });
});

describe("cherryPick", () => {
  it("applies a commit from another branch onto the current branch", async () => {
    const dir = makeRepo("cherry");
    await initRepo(dir);
    writeFile(dir, "c.txt", "base\n");
    await commitAll(dir, "base");
    await repo["git"](dir).checkoutLocalBranch("feature");
    writeFile(dir, "c.txt", "base\ncherry me\n");
    const featHash = await commitAll(dir, "feat change");
    await repo["git"](dir).checkout("main");
    await repo.cherryPick(dir, featHash);
    const content = fs.readFileSync(path.join(dir, "c.txt"), "utf8");
    expect(content).toContain("cherry me");
    const log = await repo.log(dir, 0, 2);
    expect(log[0].subject).toBe("feat change");
  });
});

describe("rebase", () => {
  it("replays current branch commits on top of the upstream branch", async () => {
    const dir = makeRepo("rebase");
    await initRepo(dir);
    writeFile(dir, "r.txt", "base\n");
    await commitAll(dir, "base");
    await repo["git"](dir).checkoutLocalBranch("feature");
    writeFile(dir, "feature.txt", "feature\n");
    await commitAll(dir, "feat commit");
    await repo["git"](dir).checkout("main");
    writeFile(dir, "main.txt", "main\n");
    await commitAll(dir, "main commit");
    await repo["git"](dir).checkout("feature");
    await repo.rebase(dir, "main");
    const log = await repo.log(dir, 0, 5);
    expect(log[0].subject).toBe("feat commit");
    expect(log).toHaveLength(3);
    expect(fs.existsSync(path.join(dir, "feature.txt"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "main.txt"))).toBe(true);
  });

  it("aborts an in-progress rebase and restores the branch", async () => {
    const dir = makeRepo("rebase-abort");
    await initRepo(dir);
    writeFile(dir, "r.txt", "base\n");
    await commitAll(dir, "base");
    await repo["git"](dir).checkoutLocalBranch("feature");
    writeFile(dir, "r.txt", "base\nfeature line\n");
    await commitAll(dir, "feat commit");
    await repo["git"](dir).checkout("main");
    writeFile(dir, "r.txt", "base\nmain line\n");
    await commitAll(dir, "main commit");
    await repo["git"](dir).checkout("feature");
    await expect(repo.rebase(dir, "main")).rejects.toThrow();
    await repo.rebaseAbort(dir);
    const branches = await repo.branches(dir);
    expect(branches.current).toBe("feature");
    expect(fs.readFileSync(path.join(dir, "r.txt"), "utf8")).toContain("feature line");
  });
});

describe("tags", () => {
  it("creates, lists and deletes tags", async () => {
    const dir = makeRepo("tags");
    await initRepo(dir);
    writeFile(dir, "t.txt", "x\n");
    await commitAll(dir, "c1");
    await repo.createTag(dir, "v1.0.0", "HEAD");
    await repo.createTag(dir, "v1.1.0", "HEAD", "release notes");
    const tags = await repo.tags(dir);
    expect(tags.map((tg) => tg.name)).toEqual(expect.arrayContaining(["v1.0.0", "v1.1.0"]));
    const annotated = tags.find((tg) => tg.name === "v1.1.0");
    expect(annotated!.subject).toBe("release notes");
    await repo.deleteTag(dir, "v1.0.0");
    const after = await repo.tags(dir);
    expect(after.map((tg) => tg.name)).not.toContain("v1.0.0");
  });
});

describe("remotes", () => {
  it("adds, lists, updates and removes remotes", async () => {
    const dir = makeRepo("remotes");
    await initRepo(dir);
    writeFile(dir, "r.txt", "x\n");
    await commitAll(dir, "c1");
    await repo.addRemote(dir, "origin", "https://github.com/user/repo.git");
    let remotes = await repo.remotes(dir);
    expect(remotes).toEqual([{ name: "origin", url: "https://github.com/user/repo.git" }]);
    await repo.setRemoteUrl(dir, "origin", "git@github.com:user/repo.git");
    remotes = await repo.remotes(dir);
    expect(remotes[0].url).toBe("git@github.com:user/repo.git");
    await repo.removeRemote(dir, "origin");
    remotes = await repo.remotes(dir);
    expect(remotes).toEqual([]);
  });
});

describe("log filters", () => {
  it("filters by message, author and since date", async () => {
    const dir = makeRepo("logfilters");
    await initRepo(dir);
    writeFile(dir, "l.txt", "1\n");
    await commitAll(dir, "alpha feature");
    await new Promise((r) => setTimeout(r, 1100));
    writeFile(dir, "l.txt", "1\n2\n");
    await commitAll(dir, "beta fix");

    const byQuery = await repo.log(dir, 0, 10, { query: "alpha" });
    expect(byQuery.map((e) => e.subject)).toEqual(["alpha feature"]);

    const byAuthor = await repo.log(dir, 0, 10, { author: "Test User" });
    expect(byAuthor.length).toBe(2);

    const bySince = await repo.log(dir, 0, 10, { since: "2026-01-01" });
    expect(bySince.length).toBe(2);

    const noMatch = await repo.log(dir, 0, 10, { query: "zzz" });
    expect(noMatch).toEqual([]);
  });
});

describe("conflicts", () => {
  it("reports conflicted files in status after a conflicting merge", async () => {
    const dir = makeRepo("conflict");
    await initRepo(dir);
    writeFile(dir, "x.txt", "base\n");
    await commitAll(dir, "base");
    await repo["git"](dir).checkoutLocalBranch("side");
    writeFile(dir, "x.txt", "side change\n");
    await commitAll(dir, "side");
    await repo["git"](dir).checkout("main");
    writeFile(dir, "x.txt", "main change\n");
    await commitAll(dir, "main");
    await expect(repo.merge(dir, "side")).rejects.toThrow();
    const st = await repo.status(dir);
    expect(st.conflicted).toContain("x.txt");
  });
});

describe("gitignore", () => {
  it("reads and writes .gitignore", async () => {
    const dir = makeRepo("gitignore");
    await initRepo(dir);
    expect(await repo.readGitignore(dir)).toBe("");
    await repo.writeGitignore(dir, "node_modules/\ndist/\n");
    expect(await repo.readGitignore(dir)).toBe("node_modules/\ndist/\n");
  });
});

describe("mergetool", () => {
  it("fails with a helpful message when no merge tool is configured", async () => {
    const dir = makeRepo("mergetool");
    await initRepo(dir);
    await repo["git"](dir).raw(["config", "merge.tool", ""]);
    writeFile(dir, "m.txt", "x\n");
    await commitAll(dir, "c1");
    await expect(repo.mergetool(dir)).rejects.toThrow(/merge tool/i);
  });
});

describe("core operations regression", () => {
  it("stage, status, commit, amend, branch, stash, reset work end to end", async () => {
    const dir = makeRepo("core");
    await initRepo(dir);
    writeFile(dir, "a.txt", "1\n");
    await commitAll(dir, "c1");

    // modify + stage
    writeFile(dir, "a.txt", "1\n2\n");
    let st = await repo.status(dir);
    expect(st.modified).toContain("a.txt");
    await repo.stage(dir, ["a.txt"]);
    st = await repo.status(dir);
    expect(st.staged).toContain("a.txt");
    await repo.commit(dir, "c2", false);
    const log = await repo.log(dir, 0, 5);
    expect(log[0].subject).toBe("c2");

    // amend
    await repo.commit(dir, "c2 amended", true);
    const log2 = await repo.log(dir, 0, 5);
    expect(log2[0].subject).toBe("c2 amended");

    // branch create/checkout/delete
    await repo.createBranch(dir, "dev", true);
    expect((await repo.branches(dir)).current).toBe("dev");
    await repo.checkout(dir, "main");
    await repo.deleteBranch(dir, "dev", false);
    expect((await repo.branches(dir)).all).not.toContain("dev");

    // stash
    writeFile(dir, "a.txt", "1\n2\n3\n");
    await repo.stashSave(dir, "wip");
    const stashList = await repo.stashList(dir);
    expect(stashList.length).toBeGreaterThanOrEqual(1);
    await repo.stashPop(dir, stashList[0].ref);
    expect(fs.readFileSync(path.join(dir, "a.txt"), "utf8").replace(/\r\n/g, "\n")).toBe("1\n2\n3\n");

    // reset
    const first = (await repo.log(dir, 0, 5)).at(-1)!.hash;
    await repo.reset(dir, first, "soft");
    st = await repo.status(dir);
    expect(st.staged).toContain("a.txt");
  });
});

describe("hostingUrl", () => {
  it("parses github https URLs", () => {
    expect(parseHostingUrl("https://github.com/owner/repo.git")).toBe("https://github.com/owner/repo");
  });
  it("parses ssh scp-style URLs", () => {
    expect(parseHostingUrl("git@github.com:owner/repo.git")).toBe("https://github.com/owner/repo");
  });
  it("parses ssh:// URLs", () => {
    expect(parseHostingUrl("ssh://git@gitlab.example.com/owner/repo.git")).toBe("https://gitlab.example.com/owner/repo");
  });
  it("appends /commit/<hash> for commit refs", () => {
    const h = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
    expect(parseHostingUrl("https://github.com/owner/repo.git", h)).toBe(`https://github.com/owner/repo/commit/${h}`);
  });
  it("appends /-/commit for gitlab commit refs", () => {
    expect(parseHostingUrl("https://gitlab.com/owner/repo.git", "a1b2c3d")).toBe("https://gitlab.com/owner/repo/-/commit/a1b2c3d");
  });
  it("appends /tree/<branch> for branch refs", () => {
    expect(parseHostingUrl("https://github.com/owner/repo.git", "develop")).toBe("https://github.com/owner/repo/tree/develop");
  });
  it("returns null for unsupported URLs", () => {
    expect(parseHostingUrl("file:///c:/repo")).toBeNull();
    expect(parseHostingUrl("")).toBeNull();
  });
});
