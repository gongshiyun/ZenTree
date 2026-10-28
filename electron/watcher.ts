import * as fs from "fs";
import * as path from "path";

/**
 * Infrastructure adapter: watches the git metadata that changes on commits,
 * branch/tag updates and index mutations, then reports changes (debounced)
 * so the renderer can run a cheap silent refresh instead of blind polling.
 *
 * Design notes:
 * - A `.git` path is a directory in a normal clone and a *file* in linked
 *   worktrees and submodules; the real git dir is resolved from that file.
 * - In a linked worktree HEAD/index live in the per-worktree git dir while
 *   refs live in the common dir, so both are watched.
 * - Some git operations atomically replace `.git/index` (delete + recreate),
 *   which invalidates file-level watch handles; `error` events re-hook.
 * - Working-tree edits are intentionally not watched: the renderer keeps a
 *   cheap 30 s / window-focus fingerprint fallback for those.
 */
export class RepoWatcher {
  private watchers: fs.FSWatcher[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** Resolve the real git directory (handles `.git` files used by worktrees). */
  private resolveGitDir(repoPath: string): string | null {
    const dotGit = path.join(repoPath, ".git");
    try {
      if (fs.statSync(dotGit).isDirectory()) return dotGit;
      const content = fs.readFileSync(dotGit, "utf8");
      const match = content.match(/^gitdir:\s*(.+)$/m);
      if (!match) return null;
      const target = match[1].trim();
      return path.isAbsolute(target) ? target : path.resolve(repoPath, target);
    } catch {
      return null;
    }
  }

  /** Common dir of a linked worktree (where refs/packed-refs live). */
  private resolveCommonDir(gitDir: string): string | null {
    try {
      const commonFile = path.join(gitDir, "commondir");
      if (!fs.existsSync(commonFile)) return null;
      const rel = fs.readFileSync(commonFile, "utf8").trim();
      return rel ? path.resolve(gitDir, rel) : null;
    } catch {
      return null;
    }
  }

  /** Watch targets: HEAD, index, packed-refs and the refs directory tree. */
  start(repoPath: string, onChange: () => void): void {
    this.stop();
    const gitDir = this.resolveGitDir(repoPath);
    if (!gitDir) return;

    const targets = new Set<string>([
      path.join(gitDir, "HEAD"),
      path.join(gitDir, "index"),
      path.join(gitDir, "packed-refs"),
      path.join(gitDir, "refs"),
    ]);
    const commonDir = this.resolveCommonDir(gitDir);
    if (commonDir) {
      targets.add(path.join(commonDir, "packed-refs"));
      targets.add(path.join(commonDir, "refs"));
    }

    for (const target of targets) {
      if (!fs.existsSync(target)) continue;
      try {
        const watcher = fs.watch(target, { recursive: target.endsWith("refs") }, () => this.schedule(onChange));
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
