import simpleGit, { SimpleGit } from "simple-git";
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
  async log(repoPath: string, skip?: number, maxCount?: number) {
    const git = this.git(repoPath);
    const args = ["log", `--format=%H${LOG_SEP}%P${LOG_SEP}%an${LOG_SEP}%ae${LOG_SEP}%at${LOG_SEP}%s`];
    if (skip) args.push(`--skip=${skip}`);
    if (maxCount) args.push(`--max-count=${maxCount}`);
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
    return {
      hash: headerParts[0], author: headerParts[1], email: headerParts[2],
      timestamp: parseInt(headerParts[3], 10), subject: headerParts[4], files: lines.slice(1),
    };
  }

  async lastMessage(repoPath: string): Promise<string> {
    return (await this.git(repoPath).raw(["log", "-1", "--format=%B"])).trim();
  }

  async diffFile(repoPath: string, filePath: string, staged: boolean): Promise<string> {
    const args = staged ? ["diff", "--cached", "--", filePath] : ["diff", "--", filePath];
    return this.git(repoPath).raw(args);
  }

  async commitFileDiff(repoPath: string, hash: string, filePath: string): Promise<string> {
    return this.git(repoPath).raw(["show", "--format=", hash, "--", filePath]);
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

  async unstage(repoPath: string, files: string[]) {
    return this.git(repoPath).reset(["HEAD", ...files]);
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

  async stashSave(repoPath: string, message?: string) {
    const args = ["stash", "push"];
    if (message) args.push("-m", message);
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

  async pull(repoPath: string) {
    return this.git(repoPath).pull();
  }

  async push(repoPath: string) {
    return this.git(repoPath).push();
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
}
