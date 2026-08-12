import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Isolated tests for the IPC channel layer (electron/ipc.ts).
 *
 * The `electron` module is mocked so handlers can be invoked directly without
 * a running app; git operations still run against a real `git` binary in
 * throw-away temporary repositories (same pattern as gitRepository.test.ts).
 * Focus: destructive channels (discard / reset / delete-branch) and the
 * safeHandler success/error envelope contract.
 */
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, fn);
    },
  },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  shell: { openExternal: async () => undefined },
  BrowserWindow: class {},
}));

import { registerIpcHandlers } from "../electron/ipc";
import { GitRepository } from "../electron/gitRepository";
import { RepoWatcher } from "../electron/watcher";

const repo = new GitRepository(() => "git");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zentree-ipc-test-"));
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

function writeFile(dir: string, rel: string, content: string): void {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
}

function readFile(dir: string, rel: string): string {
  return fs.readFileSync(path.join(dir, rel), "utf8").replace(/\r/g, "");
}

async function commitAll(dir: string, message: string): Promise<string> {
  await repo["git"](dir).add(".");
  await repo["git"](dir).commit(message);
  const log = await repo.log(dir, 0, 1);
  return log[0].hash;
}

/** Invoke a registered IPC handler the way ipcMain would. */
async function invoke(channel: string, ...args: unknown[]): Promise<any> {
  const handler = handlers.get(channel);
  expect(handler, `channel "${channel}" should be registered`).toBeDefined();
  return handler!({}, ...args);
}

beforeAll(() => {
  registerIpcHandlers({
    settings: { load: () => ({}) },
    git: repo,
    update: {},
    watcher: new RepoWatcher(),
    getWindow: () => null,
  } as unknown as Parameters<typeof registerIpcHandlers>[0]);
});

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("git:discard channel", () => {
  it("reverts tracked modifications and deletes untracked files", async () => {
    const dir = makeRepo("discard");
    await initRepo(dir);
    writeFile(dir, "tracked.txt", "base\n");
    await commitAll(dir, "initial");
    writeFile(dir, "tracked.txt", "base\nchanged\n");
    writeFile(dir, "untracked.txt", "temp\n");

    const res = await invoke("git:discard", dir, ["tracked.txt", "untracked.txt"]);
    expect(res).toEqual({ success: true, data: true });
    expect(readFile(dir, "tracked.txt")).toBe("base\n");
    expect(fs.existsSync(path.join(dir, "untracked.txt"))).toBe(false);
  });

  it("returns a failure envelope instead of throwing for a non-repository", async () => {
    const dir = makeRepo("discard-not-a-repo");
    const res = await invoke("git:discard", dir, ["a.txt"]);
    expect(res.success).toBe(false);
    expect(typeof res.error).toBe("string");
    expect(res.error.length).toBeGreaterThan(0);
  });
});

describe("git:reset channel", () => {
  it("hard reset moves HEAD back and rewrites the working tree", async () => {
    const dir = makeRepo("reset-hard");
    await initRepo(dir);
    writeFile(dir, "a.txt", "1\n");
    const firstHash = await commitAll(dir, "c1");
    writeFile(dir, "a.txt", "1\n2\n");
    await commitAll(dir, "c2");

    const res = await invoke("git:reset", dir, firstHash, "hard");
    expect(res.success).toBe(true);
    const log = await repo.log(dir, 0, 10);
    expect(log).toHaveLength(1);
    expect(log[0].hash).toBe(firstHash);
    expect(readFile(dir, "a.txt")).toBe("1\n");
  });

  it("soft reset keeps changes staged", async () => {
    const dir = makeRepo("reset-soft");
    await initRepo(dir);
    writeFile(dir, "a.txt", "1\n");
    const firstHash = await commitAll(dir, "c1");
    writeFile(dir, "a.txt", "1\n2\n");
    await commitAll(dir, "c2");

    const res = await invoke("git:reset", dir, firstHash, "soft");
    expect(res.success).toBe(true);
    const st = await repo.status(dir);
    expect(st.staged).toContain("a.txt");
    expect(readFile(dir, "a.txt")).toBe("1\n2\n");
  });

  it("returns a failure envelope for an invalid commit hash", async () => {
    const dir = makeRepo("reset-bad-hash");
    await initRepo(dir);
    writeFile(dir, "a.txt", "1\n");
    await commitAll(dir, "c1");
    const res = await invoke("git:reset", dir, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", "hard");
    expect(res.success).toBe(false);
    expect(typeof res.error).toBe("string");
  });
});

describe("git:delete-branch channel", () => {
  it("deletes a merged branch without force", async () => {
    const dir = makeRepo("delete-branch");
    await initRepo(dir);
    writeFile(dir, "a.txt", "1\n");
    await commitAll(dir, "c1");
    await repo["git"](dir).raw(["branch", "stale"]);

    const res = await invoke("git:delete-branch", dir, "stale", false);
    expect(res.success).toBe(true);
    expect((await repo.branches(dir)).all).not.toContain("stale");
  });

  it("refuses an unmerged branch without force, deletes it with force", async () => {
    const dir = makeRepo("delete-branch-force");
    await initRepo(dir);
    writeFile(dir, "a.txt", "1\n");
    await commitAll(dir, "c1");
    await repo["git"](dir).raw(["checkout", "-b", "unmerged"]);
    writeFile(dir, "b.txt", "2\n");
    await commitAll(dir, "c2");
    await repo["git"](dir).raw(["checkout", "main"]);

    const refused = await invoke("git:delete-branch", dir, "unmerged", false);
    expect(refused.success).toBe(false);
    expect((await repo.branches(dir)).all).toContain("unmerged");

    const forced = await invoke("git:delete-branch", dir, "unmerged", true);
    expect(forced.success).toBe(true);
    expect((await repo.branches(dir)).all).not.toContain("unmerged");
  });
});

describe("new P1 channels", () => {
  it("git:checkout-file restores a file to a historical commit", async () => {
    const dir = makeRepo("checkout-file-ipc");
    await initRepo(dir);
    writeFile(dir, "f.txt", "v1\n");
    const v1 = await commitAll(dir, "v1");
    writeFile(dir, "f.txt", "v2\n");
    await commitAll(dir, "v2");
    writeFile(dir, "f.txt", "dirty\n");

    const res = await invoke("git:checkout-file", dir, v1, "f.txt");
    expect(res.success).toBe(true);
    expect(readFile(dir, "f.txt")).toBe("v1\n"); // readFile normalizes CRLF
  });

  it("git:checkout-file fails with a failure envelope for a bad ref", async () => {
    const dir = makeRepo("checkout-file-ipc-bad");
    await initRepo(dir);
    writeFile(dir, "f.txt", "v1\n");
    await commitAll(dir, "v1");
    const res = await invoke("git:checkout-file", dir, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", "f.txt");
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("git:write-file rejects traversal through the failure envelope", async () => {
    const dir = makeRepo("write-file-ipc");
    await initRepo(dir);
    const res = await invoke("git:write-file", dir, "../escape.txt", "x");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Invalid file path/);
  });

  it("git:stash-diff returns a diff for a stash entry", async () => {
    const dir = makeRepo("stash-diff-ipc");
    await initRepo(dir);
    writeFile(dir, "s.txt", "v1\n");
    await commitAll(dir, "v1");
    writeFile(dir, "s.txt", "v2\n");
    await repo["git"](dir).raw(["stash", "push", "-m", "wip"]);

    const res = await invoke("git:stash-diff", dir, "stash@{0}");
    expect(res.success).toBe(true);
    expect(res.data).toContain("s.txt");
  });

  it("repo:watch and repo:unwatch return success envelopes", async () => {
    const dir = makeRepo("watch-ipc");
    await initRepo(dir);
    const watch = await invoke("repo:watch", dir);
    expect(watch.success).toBe(true);
    const unwatch = await invoke("repo:unwatch");
    expect(unwatch.success).toBe(true);
  });
});

describe("IPC channel registration", () => {
  it("registers the complete channel surface consumed by the renderer", () => {
    const expected = [
      "window:minimize", "window:maximize", "window:close", "window:is-maximized",
      "settings:get-all", "settings:set",
      "git:is-repo", "git:branches", "git:log", "git:status", "git:show",
      "git:last-message", "git:log-range",
      "git:stage", "git:unstage", "git:stage-all", "git:unstage-all",
      "git:discard", "git:commit",
      "git:checkout", "git:rename-branch", "git:get-upstream", "git:set-upstream",
      "git:unset-upstream", "git:branch-tracking", "git:batch-checkout",
      "git:scan-repos", "git:checkout-remote", "git:create-branch",
      "git:delete-branch", "git:merge", "git:rebase-interactive", "git:reset",
      "git:stash-save", "git:stash-list", "git:stash-pop", "git:stash-drop", "git:stash-diff",
      "git:fetch", "git:fetch-branch", "git:pull", "git:pull-branch",
      "git:push", "git:push-branch", "git:delete-remote-branch", "git:prune-remote",
      "git:diff-file", "git:commit-file-diff", "git:read-file", "git:checkout-file",
      "git:show-stage", "git:write-file", "git:stage-hunk", "git:unstage-hunk", "git:revert-hunk",
      "git:get-config", "git:set-config",
      "update:get-state", "update:check", "update:download", "update:install",
      "git:clone", "git:file-history", "git:blame", "git:revert",
      "git:compare", "git:compare-file-diff", "git:cherry-pick",
      "git:cherry-pick-abort", "git:cherry-pick-continue", "git:rebase",
      "git:rebase-abort", "git:rebase-continue", "git:merge-abort", "git:merge-continue",
      "git:get-ongoing", "git:tags", "git:create-tag", "git:delete-tag",
      "git:remotes", "git:add-remote", "git:remove-remote", "git:set-remote-url",
      "git:submodule-list", "git:submodule-add", "git:submodule-update", "git:submodule-deinit",
      "git:get-commit-template", "git:set-commit-template",
      "git:get-sign-commits", "git:set-sign-commits",
      "git:get-diff-tool", "git:set-diff-tool", "git:launch-diff-tool",
      "git:hosting-url", "git:read-gitignore", "git:write-gitignore", "git:mergetool",
      "repo:watch", "repo:unwatch",
      "shell:open-git-bash", "shell:open-external", "dialog:open-directory",
    ];
    for (const channel of expected) {
      expect(handlers.has(channel), `channel "${channel}" should be registered`).toBe(true);
    }
  });
});
