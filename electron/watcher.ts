import * as fs from "fs";
import * as path from "path";

/**
 * Infrastructure adapter: watches the git metadata that changes on commits,
 * branch/tag updates and index mutations, then reports changes (debounced)
 * so the renderer can run a cheap silent refresh instead of blind polling.
 *
 * Design note: some git operations atomically replace `.git/index` (delete +
 * recreate), which invalidates file-level watch handles. `error` events
 * therefore trigger a re-hook; a 30s polling fallback remains in the
 * renderer as a safety net.
 */
export class RepoWatcher {
  private watchers: fs.FSWatcher[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Watch targets: HEAD, index, packed-refs and the refs directory tree. */
  start(repoPath: string, onChange: () => void): void {
    this.stop();
    const gitDir = path.join(repoPath, ".git");
    const targets = [
      path.join(gitDir, "HEAD"),
      path.join(gitDir, "index"),
      path.join(gitDir, "packed-refs"),
      path.join(gitDir, "refs"),
    ].filter((t) => fs.existsSync(t));
    for (const t of targets) {
      try {
        const watcher = fs.watch(t, { recursive: t.endsWith("refs") }, () => this.schedule(onChange));
        // Re-hook when the handle is invalidated (e.g. atomic index rewrite).
        watcher.on("error", () => this.start(repoPath, onChange));
        this.watchers.push(watcher);
      } catch { /* one failed target must not block the others */ }
    }
  }

  private schedule(onChange: () => void) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(onChange, 500); // debounce: batch git ops fire once
  }

  stop(): void {
    for (const w of this.watchers) {
      try { w.close(); } catch { /* already closed */ }
    }
    this.watchers = [];
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }
}
