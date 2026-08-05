import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { RepoWatcher } from "../electron/watcher";

/**
 * Integration tests for RepoWatcher using a real fs.watch on a temporary
 * git repository skeleton: verifies debounce and re-hook behavior.
 */
let tempRoot: string;

beforeAll(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zentree-watcher-test-"));
});

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function makeRepo(name: string): string {
  const dir = path.join(tempRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  const gitDir = path.join(dir, ".git");
  fs.mkdirSync(path.join(gitDir, "refs", "heads"), { recursive: true });
  fs.mkdirSync(path.join(gitDir, "refs", "remotes"), { recursive: true });
  fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n", "utf8");
  fs.writeFileSync(path.join(gitDir, "index"), "", "utf8");
  return dir;
}

describe("RepoWatcher", () => {
  it("fires the callback once for a burst of changes (500ms debounce)", async () => {
    const dir = makeRepo("debounce");
    const watcher = new RepoWatcher();
    const onChange = vi.fn();
    watcher.start(dir, onChange);

    // Touch HEAD three times rapidly: only one debounced notification.
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(path.join(dir, ".git", "HEAD"), `ref: refs/heads/main\n${i}`, "utf8");
      await new Promise((r) => setTimeout(r, 10));
    }
    await new Promise((r) => setTimeout(r, 800));
    expect(onChange).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("detects changes under the refs directory tree", async () => {
    const dir = makeRepo("refs-tree");
    const watcher = new RepoWatcher();
    const onChange = vi.fn();
    watcher.start(dir, onChange);

    fs.mkdirSync(path.join(dir, ".git", "refs", "heads"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".git", "refs", "heads", "feature"), "abc\n", "utf8");
    await new Promise((r) => setTimeout(r, 800));
    expect(onChange).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("re-hooks after the index file is atomically replaced", async () => {
    const dir = makeRepo("rehook");
    const watcher = new RepoWatcher();
    const onChange = vi.fn();
    watcher.start(dir, onChange);

    // Simulate a git index rewrite: delete + recreate.
    fs.rmSync(path.join(dir, ".git", "index"));
    await new Promise((r) => setTimeout(r, 200));
    fs.writeFileSync(path.join(dir, ".git", "index"), "new-index", "utf8");
    await new Promise((r) => setTimeout(r, 800));

    // The replacement may emit an event on Windows; at minimum a later
    // change must still be observed after the re-hook.
    const before = onChange.mock.calls.length;
    fs.writeFileSync(path.join(dir, ".git", "index"), "second", "utf8");
    await new Promise((r) => setTimeout(r, 800));
    expect(onChange.mock.calls.length).toBeGreaterThan(before);
    watcher.stop();
  });

  it("stop() silences further notifications", async () => {
    const dir = makeRepo("stopped");
    const watcher = new RepoWatcher();
    const onChange = vi.fn();
    watcher.start(dir, onChange);
    watcher.stop();

    fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/dev\n", "utf8");
    await new Promise((r) => setTimeout(r, 800));
    expect(onChange).not.toHaveBeenCalled();
  });
});
