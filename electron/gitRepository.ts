import simpleGit, { SimpleGit } from "simple-git";
import type { BatchCheckoutOptions, BatchRepoResult, BlameLine, BranchTracking, CompareFileStat, CompareResult, FileHistoryEntry, LogFilters, PullStrategy, RebaseTodoEntry, RemoteInfo, SubmoduleInfo, TagInfo } from "../src/types";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as childProcess from "child_process";

const LOG_SEP = "|||ZENTREE|||";

/**
 * Infrastructure adapter: all Git operations, implemented on top of simple-git.
 * The renderer never talks to simple-git directly; it goes through IPC.
 */
export class GitRepository {
  constructor(private readonly getGitPath: () => string) {}

  private git(repoPath: string): SimpleGit {
    const gitPath = this.getGitPath() || "git";
    return simpleGit({ baseDir: repoPath, binary: gitPath });
  }

  validateRepo(repoPath: string): string | null {
    if (!repoPath || !fs.existsSync(repoPath)) return "Path does not exist";
    const gitDir = path.join(repoPath, ".git");
    if (!fs.existsSync(gitDir)) return "Not a valid Git repository (no .git directory)";
    return null;
  }

  async isRepo(repoPath: string): Promise<boolean> {
    const err = this.validateRepo(repoPath);
    if (err) return false;
    return this.git(repoPath).checkIsRepo();
  }

  async branches(repoPath: string) {
    const result = await this.git(repoPath).branch(["-a"]);
    return { all: result.all, current: result.current, branches: result.branches };
  }

  /** Paginated commit log. Returns an empty list for a repository with no commits. */
  async log(repoPath: string, skip?: number, maxCount?: number, filters?: LogFilters, ref?: string) {
    const git = this.git(repoPath);
    const args = ["log", ref || "HEAD", `--format=%H${LOG_SEP}%P${LOG_SEP}%an${LOG_SEP}%ae${LOG_SEP}%at${LOG_SEP}%s`];
    if (skip) args.push(`--skip=${skip}`);
    if (maxCount) args.push(`--max-count=${maxCount}`);
    if (filters?.query) args.push("--grep=" + filters.query, "--regexp-ignore-case");
    if (filters?.author) args.push("--author=" + filters.author);
    if (filters?.since) args.push("--since=" + filters.since);
    if (filters?.until) args.push("--until=" + filters.until);
    let result: string;
    try {
      result = await git.raw(args);
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes("does not have any commits")) return [];
      throw err;
    }
    return result.split("\n").filter(Boolean).map((line: string) => {
      const parts: string[] = [];
      let remaining = line;
      for (let i = 0; i < 5; i++) {
        const sepIdx = remaining.indexOf(LOG_SEP);
        parts.push(remaining.substring(0, sepIdx));
        remaining = remaining.substring(sepIdx + LOG_SEP.length);
      }
      parts.push(remaining);
      const [hash, parents, author, email, date, subject] = parts;
      return {
        hash, shortHash: hash.substring(0, 7),
        parents: parents ? parents.split(" ") : [],
        author, email,
        timestamp: parseInt(date, 10), subject, body: "",
      };
    });
  }

  async status(repoPath: string) {
    const status = await this.git(repoPath).status();
    return {
      staged: status.staged, modified: status.modified, created: status.created,
      deleted: status.deleted, renamed: status.renamed, not_added: status.not_added,
      conflicted: status.conflicted, files: status.files, current: status.current,
    };
  }

  async show(repoPath: string, hash: string) {
    const result = await this.git(repoPath).raw(["show", hash, "--name-only", `--format=%H${LOG_SEP}%an${LOG_SEP}%ae${LOG_SEP}%at${LOG_SEP}%s`]);
    const lines = result.split("\n").filter(Boolean);
    const headerParts = lines[0].split(LOG_SEP);
    const stats = await this.commitStats(repoPath, hash);
    return {
      hash: headerParts[0], author: headerParts[1], email: headerParts[2],
      timestamp: parseInt(headerParts[3], 10), subject: headerParts[4], files: lines.slice(1),
      stats,
    };
  }

  /** Per-file add/delete line counts for a commit. */
  async commitStats(repoPath: string, hash: string): Promise<{ path: string; additions: number; deletions: number; binary?: boolean }[]> {
    const result = await this.git(repoPath).raw(["show", "--numstat", "--format=", hash]);
    return result.split("\n").filter(Boolean).map((line) => {
      const [add, del, ...rest] = line.split("\t");
      const filePath = rest.join("\t");
      if (add === "-" || del === "-") {
        return { path: filePath, additions: 0, deletions: 0, binary: true };
      }
      return { path: filePath, additions: parseInt(add, 10), deletions: parseInt(del, 10) };
    });
  }

  async lastMessage(repoPath: string): Promise<string> {
    return (await this.git(repoPath).raw(["log", "-1", "--format=%B"])).trim();
  }

  /** Commits in `from..to` in oldest-first order (the rebase todo order). */
  async logRange(repoPath: string, from: string, to: string): Promise<{ hash: string; subject: string }[]> {
    const result = await this.git(repoPath).raw(["log", `${from}..${to}`, "--reverse", `--format=%H${LOG_SEP}%s`]);
    return result.split("\n").filter(Boolean).map((line) => {
      const [hash, subject] = line.split(LOG_SEP);
      return { hash, subject };
    });
  }

  async diffFile(repoPath: string, filePath: string, staged: boolean, fromPath?: string): Promise<string> {
    // -M enables rename detection. When the file is a rename, pass both the
    // old and new paths so git can pair them up under a single-path pathspec.
    const paths = fromPath ? [fromPath, filePath] : [filePath];
    const args = staged ? ["diff", "-M", "--cached", "--", ...paths] : ["diff", "-M", "--", ...paths];
    return this.git(repoPath).raw(args);
  }

  async commitFileDiff(repoPath: string, hash: string, filePath: string): Promise<string> {
    return this.git(repoPath).raw(["show", "--format=", hash, "--", filePath]);
  }

  /** Read the current working-tree content of a file (e.g. untracked files). */
  async readWorkingFile(repoPath: string, filePath: string): Promise<string> {
    const fullPath = path.join(repoPath, filePath);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      throw new Error("File does not exist");
    }
    return fs.readFileSync(fullPath, "utf8");
  }

  /** Apply a hunk patch via a temporary file (git apply works on files, not stdin strings). */
  private async applyPatch(repoPath: string, patchContent: string, args: string[]): Promise<boolean> {
    const git = this.git(repoPath);
    const tmpFile = path.join(os.tmpdir(), `zentree-${Date.now()}-${Math.random().toString(36).slice(2)}.patch`);
    fs.writeFileSync(tmpFile, patchContent, "utf8");
    try {
      await git.raw(["apply", ...args, tmpFile]);
      return true;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  async stageHunk(repoPath: string, patchContent: string): Promise<boolean> {
    return this.applyPatch(repoPath, patchContent, ["--cached"]);
  }

  async unstageHunk(repoPath: string, patchContent: string): Promise<boolean> {
    return this.applyPatch(repoPath, patchContent, ["--cached", "--reverse"]);
  }

  async revertHunk(repoPath: string, patchContent: string): Promise<boolean> {
    return this.applyPatch(repoPath, patchContent, ["--reverse"]);
  }

  async stage(repoPath: string, files: string[]) {
    return this.git(repoPath).add(files);
  }

  /** Stage all working-tree changes (including untracked files). */
  async stageAll(repoPath: string) {
    return this.git(repoPath).raw(["add", "-A"]);
  }

  async unstage(repoPath: string, files: string[]) {
    return this.git(repoPath).reset(["HEAD", ...files]);
  }

  /** Unstage everything (mixed reset to HEAD). */
  async unstageAll(repoPath: string) {
    return this.git(repoPath).raw(["reset"]);
  }

  /** Discard working-tree changes. Untracked files are removed with git clean. */
  async discard(repoPath: string, files: string[]): Promise<boolean> {
    const git = this.git(repoPath);
    const status = await git.status();
    const untracked = new Set(status.not_added);
    const toClean: string[] = [];
    const toCheckout: string[] = [];
    for (const f of files) {
      if (untracked.has(f)) toClean.push(f);
      else toCheckout.push(f);
    }
    if (toClean.length > 0) await git.raw(["clean", "-f", "--", ...toClean]);
    if (toCheckout.length > 0) await git.checkout(toCheckout);
    return true;
  }

  async commit(repoPath: string, message: string, amend: boolean) {
    const git = this.git(repoPath);
    if (amend) {
      return message
        ? await git.raw(["commit", "--amend", "-m", message])
        : await git.raw(["commit", "--amend", "--no-edit"]);
    }
    return git.commit(message);
  }

  async checkout(repoPath: string, branch: string) {
    return this.git(repoPath).checkout(branch);
  }

  /** Rename a local branch (current branch when oldName matches HEAD). */
  async renameBranch(repoPath: string, oldName: string, newName: string) {
    return this.git(repoPath).raw(["branch", "-m", oldName, newName]);
  }

  /** Upstream ref of a branch, or null when not set. */
  async getUpstream(repoPath: string, branch: string): Promise<string | null> {
    try {
      const out = (await this.git(repoPath).raw(["rev-parse", "--abbrev-ref", `${branch}@{upstream}`])).trim();
      return out || null;
    } catch { return null; }
  }

  /**
   * Batch operation for a "repo group": switch one repository to a target
   * branch with optional fetch / pull / stash-and-restore, reporting per-repo
   * results without throwing (callers keep processing the remaining repos).
   */
  async batchCheckout(repoPath: string, branch: string, opts: BatchCheckoutOptions = {}): Promise<BatchRepoResult> {
    const git = this.git(repoPath);
    const result: BatchRepoResult = {
      repo: repoPath, ok: true, skipped: false, error: undefined,
      branchBefore: "", branchAfter: "", stashed: false, restored: false, actions: [],
    };
    try {
      result.branchBefore = (await git.raw(["branch", "--show-current"])).trim();

      if (opts.fetch) {
        try {
          await git.fetch();
          result.actions.push("fetch");
        } catch (e: any) {
          result.error = `fetch failed: ${String(e?.message || e)}`;
        }
      }

      const local = await git.raw(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).catch(() => "");
      const remote = await git.raw(["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`]).catch(() => "");
      if (!local && !remote) {
        result.ok = false;
        result.skipped = true;
        result.branchAfter = result.branchBefore;
        result.error = result.error ? `${result.error}; branch "${branch}" not found` : `branch "${branch}" not found`;
        return result;
      }

      const st = await git.status();
      const dirty = st.staged.length > 0 || st.modified.length > 0 || st.not_added.length > 0 || st.deleted.length > 0;
      if (dirty && opts.stash) {
        await git.raw(["stash", "push", "-m", `zentree-batch-${Date.now()}`]);
        result.stashed = true;
        result.actions.push("stash");
      }

      if (result.branchBefore !== branch) {
        await git.checkout(branch);
        result.actions.push("checkout");
      }
      result.branchAfter = (await git.raw(["branch", "--show-current"])).trim();

      if (opts.pull && result.branchAfter) {
        try {
          await git.pull();
          result.actions.push("pull");
        } catch (e: any) {
          // Checkout succeeded; a failed pull is a warning, not a failure.
          result.error = result.error ? `${result.error}; pull failed: ${String(e?.message || e)}` : `pull failed: ${String(e?.message || e)}`;
        }
      }

      if (result.stashed) {
        try {
          await git.raw(["stash", "pop"]);
          result.restored = true;
          result.actions.push("stash-pop");
        } catch (e: any) {
          result.ok = false;
          result.error = result.error ? `${result.error}; stash restore failed: ${String(e?.message || e)}` : `stash restore failed: ${String(e?.message || e)}`;
        }
      }
      return result;
    } catch (e: any) {
      result.ok = false;
      result.error = String(e?.message || e);
      return result;
    }
  }

  /** Discover Git repositories in the immediate sub-directories of a folder. */
  async scanRepos(dir: string): Promise<{ path: string; name: string }[]> {
    const out: { path: string; name: string }[] = [];
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const p = path.join(dir, entry.name);
      try {
        if (await this.isRepo(p)) out.push({ path: p, name: entry.name });
      } catch { /* not a repo */ }
    }
    return out;
  }

  /** Track a remote branch as the upstream of a local branch. */
  async setUpstream(repoPath: string, branch: string, remote: string) {
    return this.git(repoPath).raw(["branch", `--set-upstream-to=${remote}/${branch}`, branch]);
  }

  /** Remove the upstream tracking of a branch. */
  async unsetUpstream(repoPath: string, branch: string) {
    return this.git(repoPath).raw(["branch", "--unset-upstream", branch]);
  }

  /** Upstream + ahead/behind for every local branch. */
  async branchTracking(repoPath: string): Promise<BranchTracking[]> {
    const all = (await this.branches(repoPath)).all.filter((b: string) => !b.startsWith("remotes/"));
    const out: BranchTracking[] = [];
    for (const name of all) {
      const upstream = await this.getUpstream(repoPath, name);
      if (!upstream) { out.push({ name, upstream: null, ahead: 0, behind: 0 }); continue; }
      const counts = (await this.git(repoPath).raw(["rev-list", "--left-right", "--count", `${name}...${upstream}`])).trim().split(/\s+/);
      out.push({ name, upstream, ahead: parseInt(counts[0] || "0", 10), behind: parseInt(counts[1] || "0", 10) });
    }
    return out;
  }

  async checkoutRemote(repoPath: string, remoteBranch: string) {
    return this.git(repoPath).raw(["checkout", "--track", remoteBranch]);
  }

  async createBranch(repoPath: string, branchName: string, checkout: boolean) {
    const git = this.git(repoPath);
    if (checkout) return git.checkoutLocalBranch(branchName);
    return git.branch([branchName]);
  }

  async deleteBranch(repoPath: string, branchName: string, force: boolean) {
    return this.git(repoPath).deleteLocalBranch(branchName, force);
  }

  async merge(repoPath: string, branchName: string) {
    return this.git(repoPath).merge([branchName]);
  }

  async reset(repoPath: string, commitHash: string, mode: "soft" | "mixed" | "hard") {
    return this.git(repoPath).reset([`--${mode}`, commitHash]);
  }

  async stashSave(repoPath: string, message?: string, paths?: string[]) {
    const args = ["stash", "push"];
    if (message) args.push("-m", message);
    if (paths && paths.length > 0) args.push("--", ...paths);
    return this.git(repoPath).raw(args);
  }

  async stashList(repoPath: string) {
    const result = await this.git(repoPath).raw(["stash", "list", "--format=%gd|||%s"]);
    return result.split("\n").filter(Boolean).map((line: string) => {
      const [ref, subject] = line.split("|||");
      return { ref, subject };
    });
  }

  async stashPop(repoPath: string, ref?: string) {
    const args = ["stash", "pop"];
    if (ref) args.push(ref);
    return this.git(repoPath).raw(args);
  }

  async stashDrop(repoPath: string, ref: string) {
    return this.git(repoPath).raw(["stash", "drop", ref]);
  }

  async fetch(repoPath: string) {
    return this.git(repoPath).fetch();
  }

  /** Fetch a specific branch from a remote. */
  async fetchBranch(repoPath: string, remote: string, branch: string) {
    return this.git(repoPath).raw(["fetch", remote, branch]);
  }

  async pull(repoPath: string, strategy: PullStrategy = "merge") {
    if (strategy === "rebase") return this.git(repoPath).raw(["pull", "--rebase"]);
    if (strategy === "ff-only") return this.git(repoPath).raw(["pull", "--ff-only"]);
    return this.git(repoPath).pull();
  }

  /** Detect an in-progress merge / rebase / cherry-pick. */
  async getOngoingOperation(repoPath: string): Promise<"merge" | "rebase" | "cherry-pick" | null> {
    const gitDir = path.resolve(repoPath, (await this.git(repoPath).raw(["rev-parse", "--git-dir"])).trim());
    const has = (name: string) => {
      try { return fs.existsSync(path.join(gitDir, name)); } catch { return false; }
    };
    if (has("rebase-merge") || has("rebase-apply")) return "rebase";
    if (has("MERGE_HEAD")) return "merge";
    if (has("CHERRY_PICK_HEAD")) return "cherry-pick";
    return null;
  }

  /** Run a git command that may open an editor with a no-op editor installed. */
  private runWithNoopEditor(repoPath: string, args: string[], label: string): Promise<void> {
    const noop = path.join(os.tmpdir(), `zentree-noop-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`);
    fs.writeFileSync(noop, "#!/bin/sh\nexit 0\n", "utf8");
    const gitPath = this.getGitPath() || "git";
    return new Promise<void>((resolve, reject) => {
      childProcess.execFile(gitPath, args, {
        cwd: repoPath,
        env: { ...process.env, GIT_EDITOR: noop.replace(/\\/g, "/") },
      }, (err) => {
        try { fs.unlinkSync(noop); } catch { /* ignore */ }
        if (err) reject(new Error(`${label}: ${err.message}`));
        else resolve();
      });
    });
  }

  /** Continue an in-progress rebase (accepts default commit messages). */
  async rebaseContinue(repoPath: string): Promise<void> {
    await this.runWithNoopEditor(repoPath, ["rebase", "--continue"], "Rebase continue failed");
  }

  async mergeAbort(repoPath: string) {
    return this.git(repoPath).raw(["merge", "--abort"]);
  }

  /** Continue an in-progress merge (accepts the default merge message). */
  async mergeContinue(repoPath: string): Promise<void> {
    await this.runWithNoopEditor(repoPath, ["merge", "--continue"], "Merge continue failed");
  }

  /** Pull a specific branch from a remote. */
  async pullBranch(repoPath: string, remote: string, branch: string) {
    return this.git(repoPath).raw(["pull", remote, branch]);
  }

  async push(repoPath: string) {
    return this.git(repoPath).push();
  }

  /** Push the current branch to a remote and set the upstream. */
  async pushBranch(repoPath: string, remote: string, branch: string) {
    return this.git(repoPath).raw(["push", "-u", remote, branch]);
  }

  /** Delete a branch on the remote. */
  async deleteRemoteBranch(repoPath: string, remote: string, branch: string) {
    return this.git(repoPath).raw(["push", remote, "--delete", branch]);
  }

  /** Prune stale remote-tracking branches of a remote. */
  async pruneRemote(repoPath: string, remote: string) {
    return this.git(repoPath).raw(["remote", "prune", remote]);
  }

  /**
   * Run an interactive rebase non-interactively. The todo list is generated
   * from the entries and injected via GIT_SEQUENCE_EDITOR; reword is applied
   * with `exec git commit --amend -F` so no text editor is required.
   */
  async rebaseInteractive(repoPath: string, base: string, entries: RebaseTodoEntry[]): Promise<void> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zentree-rebase-"));
    try {
      const lines: string[] = [];
      for (const e of entries) {
        if (e.action === "drop") continue;
        lines.push(`${e.action} ${e.hash} ${e.subject}`);
        if (e.action === "reword" && e.rewordMessage) {
          const msgFile = path.join(tmpDir, `msg-${e.hash.substring(0, 8)}.txt`);
          fs.writeFileSync(msgFile, e.rewordMessage, "utf8");
          lines.push(`exec git commit --amend -F "${msgFile.replace(/\\/g, "/")}"`);
        }
      }
      const todoFile = path.join(tmpDir, "git-rebase-todo.txt");
      fs.writeFileSync(todoFile, lines.join("\n") + "\n", "utf8");

      // GIT_SEQUENCE_EDITOR overwrites the todo file git prepares with ours.
      // git runs editor commands through the msys/posix shell, so use an sh
      // script (LF endings) with an msys-style path for the todo copy source.
      const msysPath = (p: string) => `/${p.replace(/^([A-Za-z]):/, (_m, c) => c.toLowerCase()).replace(/\\/g, "/")}`;
      const sequenceEditor = path.join(tmpDir, "sequence-editor.sh");
      fs.writeFileSync(sequenceEditor, `#!/bin/sh\ncp "${msysPath(todoFile)}" "$1"\n`, "utf8");

      // squash combines messages and opens an editor; accept the default text.
      const noopEditor = path.join(tmpDir, "noop-editor.sh");
      fs.writeFileSync(noopEditor, "#!/bin/sh\nexit 0\n", "utf8");

      const gitPath = this.getGitPath() || "git";
      await new Promise<void>((resolve, reject) => {
        childProcess.execFile(gitPath, ["rebase", "-i", base], {
          cwd: repoPath,
          env: { ...process.env, GIT_SEQUENCE_EDITOR: sequenceEditor.replace(/\\/g, "/"), GIT_EDITOR: noopEditor.replace(/\\/g, "/") },
          maxBuffer: 16 * 1024 * 1024,
        }, (err) => {
          if (err) reject(new Error(`Rebase failed: ${err.message}`));
          else resolve();
        });
      });
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  async getConfig(repoPath: string) {
    const git = this.git(repoPath);
    const name = (await git.raw(["config", "user.name"])).trim();
    const email = (await git.raw(["config", "user.email"])).trim();
    return { userName: name, userEmail: email };
  }

  async setConfig(repoPath: string, key: string, value: string) {
    await this.git(repoPath).raw(["config", key, value]);
    return true;
  }

  /** Locate git-bash.exe using a 4-tier auto-discovery strategy. */
  findGitBash(): string | null {
    const settingsGitPath = this.getGitPath();

    // Tier 1: Derive from user-configured git path
    if (settingsGitPath && settingsGitPath !== "git") {
      const gitExe = path.resolve(settingsGitPath);
      const candidates = [
        gitExe.replace(/\bin\git\.exe$/i, "\git-bash.exe"),
        gitExe.replace(/\cmd\git\.exe$/i, "\..\git-bash.exe"),
        path.join(path.dirname(gitExe), "..", "git-bash.exe"),
      ];
      for (const c of candidates) {
        if (fs.existsSync(path.normalize(c))) return path.normalize(c);
      }
    }

    // Tier 2: Hardcoded paths + env vars
    const hardPaths = [
      "C:\Program Files\Git\git-bash.exe",
      "C:\Program Files (x86)\Git\git-bash.exe",
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "git-bash.exe"),
      path.join(process.env.ProgramFiles || "C:\Program Files", "Git", "git-bash.exe"),
      path.join(process.env.ProgramW6432 || "C:\Program Files", "Git", "git-bash.exe"),
    ];
    for (const p of hardPaths) { if (fs.existsSync(p)) return p; }

    // Tier 3: git --exec-path (uses configured git binary)
    const gitBin = settingsGitPath && settingsGitPath !== "git" ? settingsGitPath : "git";
    try {
      const gitDir = childProcess.execSync(`"${gitBin}" --exec-path`, { encoding: "utf8" }).trim();
      for (const rel of ["..\..\..\git-bash.exe", "..\..\git-bash.exe", "..\git-bash.exe"]) {
        const candidate = path.join(gitDir, rel);
        if (fs.existsSync(path.normalize(candidate))) return path.normalize(candidate);
      }
    } catch { /* ignore */ }

    // Tier 4: Scan Program Files for Git
    try {
      for (const pf of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean) as string[]) {
        const candidate = path.join(pf, "Git", "git-bash.exe");
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch { /* ignore */ }

    return null;
  }

  /** Open Git Bash in the given repository directory. */
  openGitBash(repoPath: string): string {
    const bashPath = this.findGitBash();
    if (!bashPath) {
      throw new Error("Git Bash not found. Please install Git for Windows, or set Git path in Settings > General.");
    }
    childProcess.execFile(bashPath, [], { cwd: repoPath });
    return "Git Bash opened";
  }

  /** Clone a repository into destPath (parent directory must exist). */
  async clone(url: string, destPath: string, branch?: string): Promise<string> {
    if (fs.existsSync(destPath) && fs.readdirSync(destPath).length > 0) {
      throw new Error("Destination directory is not empty");
    }
    const options = branch ? ["--branch", branch] : [];
    await simpleGit({ binary: this.getGitPath() || "git" }).clone(url, destPath, options);
    return destPath;
  }

  /** Commit history for a single file (follows renames). */
  async fileHistory(repoPath: string, filePath: string, maxCount = 200): Promise<FileHistoryEntry[]> {
    const args = ["log", "--follow", `--format=%H${LOG_SEP}%an${LOG_SEP}%ae${LOG_SEP}%at${LOG_SEP}%s`, `--max-count=${maxCount}`, "--", filePath];
    const result = await this.git(repoPath).raw(args);
    return result.split("\n").filter(Boolean).map((line: string) => {
      const [hash, author, email, date, subject] = line.split(LOG_SEP);
      return { hash, shortHash: hash.substring(0, 7), author, email, timestamp: parseInt(date, 10), subject };
    });
  }

  /** Line-by-line blame via --line-porcelain. */
  async blame(repoPath: string, filePath: string, hash?: string): Promise<BlameLine[]> {
    const args = ["blame", "--line-porcelain"];
    if (hash) args.push(hash);
    args.push("--", filePath);
    const result = await this.git(repoPath).raw(args);
    const lines = result.split("\n");
    const out: BlameLine[] = [];
    const groupStartRe = /^([a-f0-9]{40}) (\d+) (\d+)(?: (\d+))?$/;
    // Per --line-porcelain, every record is: header line, metadata lines, content line.
    // The content is always the LAST line of the group (with a leading tab).
    let current: { hash: string; lineNumber: number } | null = null;
    let groupLines: string[] = [];
    const finalize = () => {
      if (!current) return;
      // Drop the empty artifact produced by the trailing newline of the output
      while (groupLines.length > 0 && groupLines[groupLines.length - 1] === "") groupLines.pop();
      const raw = groupLines.length > 0 ? groupLines[groupLines.length - 1] : "";
      const content = raw.replace(/^\t/, "");
      const meta: Partial<BlameLine> = {};
      for (const ml of groupLines.slice(0, -1)) {
        const kv = ml.match(/^(author|author-mail|author-time|summary) (.*)$/);
        if (!kv) continue;
        if (kv[1] === "author") meta.author = kv[2];
        else if (kv[1] === "author-mail") meta.email = kv[2];
        else if (kv[1] === "author-time") meta.timestamp = parseInt(kv[2], 10);
        else if (kv[1] === "summary") meta.subject = kv[2];
      }
      out.push({
        hash: current.hash,
        shortHash: current.hash.substring(0, 7),
        lineNumber: current.lineNumber,
        content,
        author: meta.author ?? "",
        email: meta.email ?? "",
        timestamp: meta.timestamp ?? 0,
        subject: meta.subject,
      });
    };
    for (const line of lines) {
      const h = line.match(groupStartRe);
      if (h) {
        finalize();
        current = { hash: h[1], lineNumber: parseInt(h[3], 10) };
        groupLines = [];
        continue;
      }
      if (current) groupLines.push(line);
    }
    finalize();
    return out;
  }

  /** Create a revert commit for the given commit. */
  async revertCommit(repoPath: string, hash: string): Promise<string> {
    return this.git(repoPath).raw(["revert", "--no-edit", hash]);
  }

  /** Compare two refs: ahead/behind counts plus per-file diff stats. */
  async compare(repoPath: string, fromRef: string, toRef: string): Promise<CompareResult> {
    const git = this.git(repoPath);
    const counts = (await git.raw(["rev-list", "--left-right", "--count", `${fromRef}...${toRef}`])).trim().split(/\s+/);
    const ahead = parseInt(counts[0] || "0", 10);
    const behind = parseInt(counts[1] || "0", 10);

    const numstat = await git.raw(["diff", "--numstat", fromRef, toRef]);
    const nameStatus = await git.raw(["diff", "--name-status", fromRef, toRef]);
    const statusMap = new Map<string, string>();
    for (const line of nameStatus.split("\n").filter(Boolean)) {
      const parts = line.split("\t");
      if (parts.length >= 2) {
        // Renames/copies report "R100\told\tnew"
        const target = parts[parts.length - 1];
        statusMap.set(target, parts[0].replace(/\d+$/, ""));
      }
    }
    let totalAdditions = 0;
    let totalDeletions = 0;
    const files: CompareFileStat[] = [];
    for (const line of numstat.split("\n").filter(Boolean)) {
      const [add, del, ...rest] = line.split("\t");
      const filePath = rest.join("\t");
      const additions = add === "-" ? 0 : parseInt(add, 10);
      const deletions = del === "-" ? 0 : parseInt(del, 10);
      totalAdditions += additions;
      totalDeletions += deletions;
      files.push({ path: filePath, status: statusMap.get(filePath) || "M", additions, deletions });
    }
    return { from: fromRef, to: toRef, ahead, behind, files, totalAdditions, totalDeletions };
  }

  async compareFileDiff(repoPath: string, fromRef: string, toRef: string, filePath: string): Promise<string> {
    return this.git(repoPath).raw(["diff", fromRef, toRef, "--", filePath]);
  }

  /** Rebase the current branch onto the given upstream ref. */
  async rebase(repoPath: string, upstream: string): Promise<string> {
    return this.git(repoPath).raw(["rebase", upstream]);
  }

  /** Abort an in-progress rebase. */
  async rebaseAbort(repoPath: string): Promise<string> {
    return this.git(repoPath).raw(["rebase", "--abort"]);
  }

  /** Apply one or more commits onto the current HEAD. */
  async cherryPick(repoPath: string, hash: string): Promise<string> {
    return this.git(repoPath).raw(["cherry-pick", hash]);
  }

  async cherryPickAbort(repoPath: string) {
    return this.git(repoPath).raw(["cherry-pick", "--abort"]);
  }

  async cherryPickContinue(repoPath: string): Promise<void> {
    await this.runWithNoopEditor(repoPath, ["cherry-pick", "--continue"], "Cherry-pick continue failed");
  }

  /** List submodules from .gitmodules. */
  async submoduleList(repoPath: string): Promise<SubmoduleInfo[]> {
    const git = this.git(repoPath);
    try {
      const [paths, urls] = await Promise.all([
        git.raw(["config", "--file", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$"]),
        git.raw(["config", "--file", ".gitmodules", "--get-regexp", "^submodule\\..*\\.url$"]),
      ]);
      const pathMap = new Map<string, string>();
      for (const line of paths.split("\n").filter(Boolean)) {
        const m = line.match(/^submodule\.(.+)\.path (.+)$/);
        if (m) pathMap.set(m[1], m[2]);
      }
      const out: SubmoduleInfo[] = [];
      for (const line of urls.split("\n").filter(Boolean)) {
        const m = line.match(/^submodule\.(.+)\.url (.+)$/);
        if (m && pathMap.has(m[1])) out.push({ path: pathMap.get(m[1]) as string, url: m[2] });
      }
      return out;
    } catch { return []; }
  }

  async submoduleAdd(repoPath: string, url: string, subPath: string) {
    return this.runGit(repoPath, ["submodule", "add", url, subPath]);
  }

  async submoduleUpdate(repoPath: string) {
    return this.runGit(repoPath, ["submodule", "update", "--init", "--recursive"]);
  }

  /** Run a git command with file:// protocol allowed (for local-path submodules). */
  private runGit(repoPath: string, args: string[]): Promise<string> {
    const gitPath = this.getGitPath() || "git";
    return new Promise<string>((resolve, reject) => {
      childProcess.execFile(gitPath, args, {
        cwd: repoPath,
        env: { ...process.env, GIT_ALLOW_PROTOCOL: "file" },
      }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout || "ok");
      });
    });
  }

  async submoduleDeinit(repoPath: string, subPath: string) {
    await this.git(repoPath).raw(["submodule", "deinit", "-f", subPath]);
    await this.git(repoPath).raw(["rm", "-f", subPath]);
  }

  /** Absolute path of the repository's git dir (handles worktrees). */
  private async gitDir(repoPath: string): Promise<string> {
    return path.resolve(repoPath, (await this.git(repoPath).raw(["rev-parse", "--git-dir"])).trim());
  }

  async getCommitTemplate(repoPath: string): Promise<string> {
    try {
      const p = path.join(await this.gitDir(repoPath), "zentree-commit-template");
      return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
    } catch { return ""; }
  }

  async setCommitTemplate(repoPath: string, content: string): Promise<void> {
    const p = path.join(await this.gitDir(repoPath), "zentree-commit-template");
    fs.writeFileSync(p, content, "utf8");
  }

  async getSignCommits(repoPath: string): Promise<boolean> {
    try {
      return (await this.git(repoPath).raw(["config", "--get", "commit.gpgsign"])).trim() === "true";
    } catch { return false; }
  }

  async setSignCommits(repoPath: string, enabled: boolean) {
    return this.git(repoPath).raw(["config", "commit.gpgsign", enabled ? "true" : "false"]);
  }

  async getDiffTool(repoPath: string): Promise<string> {
    try { return (await this.git(repoPath).raw(["config", "--get", "diff.tool"])).trim(); } catch { return ""; }
  }

  async setDiffTool(repoPath: string, tool: string) {
    return this.git(repoPath).raw(["config", "diff.tool", tool]);
  }

  async launchDiffTool(repoPath: string, filePath?: string) {
    const args = ["difftool", "--no-prompt"];
    if (filePath) args.push("--", filePath);
    return this.git(repoPath).raw(args);
  }

  async tags(repoPath: string): Promise<TagInfo[]> {
    const result = await this.git(repoPath).raw(["tag", "-l", "--format=%(refname:short)%00%(objectname:short)%00%(creatordate:iso8601)%00%(contents:subject)"]);
    return result.split("\n").filter(Boolean).map((line: string) => {
      const [name, hash, date, subject] = line.split("\0");
      return { name, hash: hash || "", date: date || "", subject: subject || "" };
    });
  }

  async createTag(repoPath: string, name: string, ref: string, message?: string): Promise<string> {
    const args = message ? ["tag", "-a", name, "-m", message, ref] : ["tag", name, ref];
    return this.git(repoPath).raw(args);
  }

  async deleteTag(repoPath: string, name: string): Promise<string> {
    return this.git(repoPath).raw(["tag", "-d", name]);
  }

  async remotes(repoPath: string): Promise<RemoteInfo[]> {
    const result = await this.git(repoPath).raw(["config", "--get-regexp", "^remote\\..*\\.url$"]);
    const map = new Map<string, string>();
    for (const line of result.split("\n").filter(Boolean)) {
      const m = line.match(/^remote\.(.+)\.url (.*)$/);
      if (m) map.set(m[1], m[2]);
    }
    return [...map.entries()].map(([name, url]) => ({ name, url }));
  }

  async addRemote(repoPath: string, name: string, url: string): Promise<string> {
    return this.git(repoPath).raw(["remote", "add", name, url]);
  }

  async removeRemote(repoPath: string, name: string): Promise<string> {
    return this.git(repoPath).raw(["remote", "remove", name]);
  }

  async setRemoteUrl(repoPath: string, name: string, url: string): Promise<string> {
    return this.git(repoPath).raw(["remote", "set-url", name, url]);
  }

  async readGitignore(repoPath: string): Promise<string> {
    const p = path.join(repoPath, ".gitignore");
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  }

  async writeGitignore(repoPath: string, content: string): Promise<boolean> {
    fs.writeFileSync(path.join(repoPath, ".gitignore"), content, "utf8");
    return true;
  }

  /** Launch the configured merge tool for conflicted files. */
  async mergetool(repoPath: string, filePath?: string): Promise<string> {
    const tool = (await this.git(repoPath).raw(["config", "merge.tool"])).trim();
    if (!tool) {
      throw new Error("No merge tool configured. Run: git config --global merge.tool <tool>");
    }
    const args = ["mergetool", "--no-prompt"];
    if (filePath) args.push("--", filePath);
    return this.git(repoPath).raw(args);
  }

  /** Build a hosting-platform URL (GitHub/GitLab/Bitbucket) for a repo or ref. */
  async hostingUrl(repoPath: string, ref?: string): Promise<string | null> {
    const remotes = await this.remotes(repoPath);
    if (remotes.length === 0) return null;
    const preferred = remotes.find((r) => /github|gitlab|bitbucket/.test(r.url)) || remotes[0];
    return parseHostingUrl(preferred.url, ref);
  }
}

/** Parse a remote URL into a hosting-platform web URL (pure, testable). */
export function parseHostingUrl(remoteUrl: string, ref?: string): string | null {
  let url = remoteUrl.trim();
  if (!url) return null;
  // git@github.com:owner/repo.git  ->  https://github.com/owner/repo
  let m = url.match(/^(?:ssh:\/\/)?git@([^:]+):(.+)$/);
  if (m) url = `https://${m[1]}/${m[2]}`;
  // ssh://git@github.com/owner/repo.git
  m = url.match(/^ssh:\/\/git@([^/]+)\/(.+)$/);
  if (m) url = `https://${m[1]}/${m[2]}`;
  if (!/^https?:\/\//.test(url)) return null;
  url = url.replace(/\.git$/, "").replace(/\/$/, "");
  const hostMatch = url.match(/^https?:\/\/([^/]+)/);
  if (!hostMatch) return null;
  const host = hostMatch[1];
  if (!ref) return url;
  if (/^[0-9a-f]{7,40}$/i.test(ref)) {
    return /gitlab\./.test(host) ? `${url}/-/commit/${ref}` : `${url}/commit/${ref}`;
  }
  const branch = encodeURIComponent(ref);
  return /gitlab\./.test(host) ? `${url}/-/tree/${branch}` : `${url}/tree/${branch}`;
}
