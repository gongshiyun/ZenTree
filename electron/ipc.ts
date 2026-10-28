import { ipcMain, dialog, BrowserWindow, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import type { BatchCheckoutOptions, LogFilters, RebaseTodoEntry } from "../src/types";
import type { SettingsRepository } from "./settingsRepository";
import { sanitiseSettings } from "./settingsRepository";
import type { GitRepository } from "./gitRepository";
import type { UpdateManager } from "./updateManager";
import type { RepoWatcher } from "./watcher";

interface IpcDeps {
  settings: SettingsRepository;
  git: GitRepository;
  update: UpdateManager;
  watcher: RepoWatcher;
  getWindow: () => BrowserWindow | null;
}

function safeHandler<T>(channel: string, fn: (...args: unknown[]) => Promise<T>) {
  return async (_event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => {
    try {
      const result = await fn(...args);
      return { success: true, data: result };
    } catch (err: unknown) {
      // Diagnostics only: channel + full stack reach the main-process console/log
      // without altering the { success, error } contract consumed by renderer.
      console.error(`[ipc] channel "${channel}" failed:`, err);
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  };
}

/** Register an invoke channel wrapped with safeHandler's failure diagnostics. */
function handle(channel: string, fn: (...args: unknown[]) => Promise<unknown>): void {
  ipcMain.handle(channel, safeHandler(channel, fn));
}

/**
 * Validate the repository path every mutating git channel receives. The
 * renderer only ever sends paths the user opened, so a malformed or non-repo
 * path here means a contract violation 鈥?fail loudly instead of running git
 * against arbitrary directories.
 */
function requireRepoPath(value: unknown): string {
  const repoPath = String(value ?? "");
  if (!repoPath || repoPath.includes("\0")) throw new Error("Invalid repository path");
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    throw new Error("Repository path does not exist");
  }
  if (!fs.existsSync(path.join(repoPath, ".git"))) {
    throw new Error("Not a Git repository");
  }
  return repoPath;
}

/** Settings keys with a known shape; values are normalised before persisting. */
const SHAPED_SETTING_KEYS = new Set([
  "windowWidth", "windowHeight", "gitPath", "language", "themePreset",
  "lastRepo", "repos", "repoGroups", "tabs",
]);

/**
 * Coerce a shaped settings value to its persisted form. Invalid values are
 * dropped (stored as undefined) rather than persisted and crashing the next
 * launch 鈥?e.g. a string windowWidth would make BrowserWindow throw.
 */
function normaliseSetting(key: string, value: unknown): unknown {
  const normalised = sanitiseSettings({ [key]: value }) as Record<string, unknown>;
  if (key in normalised) return normalised[key];
  // Empty list/identity values are valid clears, not invalid input.
  if (key === "repos" || key === "tabs" || key === "repoGroups") return [];
  if (key === "lastRepo") return null;
  return undefined;
}

/** Composition root for all IPC channels: window controls, settings, git, dialogs. */
export function registerIpcHandlers({ settings, git, update, watcher, getWindow }: IpcDeps): void {
  // --- Window control ---
  // These are fire-and-forget from the renderer (typed as Promise<void>), so a
  // throw must never escape as an unhandled rejection: log and swallow.
  const windowOp = (fn: () => void) => () => {
    try { fn(); } catch (err) { console.error("[ipc] window operation failed:", err); }
  };
  ipcMain.handle("window:minimize", windowOp(() => getWindow()?.minimize()));
  ipcMain.handle("window:maximize", windowOp(() => {
    const win = getWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }));
  ipcMain.handle("window:close", windowOp(() => getWindow()?.close()));
  ipcMain.handle("window:is-maximized", () => {
    try { return getWindow()?.isMaximized() ?? false; } catch { return false; }
  });

  // --- Settings ---
  ipcMain.handle("settings:get-all", () => {
    try { return settings.load(); } catch (err) {
      console.error("[ipc] settings:get-all failed:", err);
      return {};
    }
  });
  ipcMain.handle("settings:set", (_event, key: unknown, value: unknown) => {
    try {
      if (typeof key !== "string" || !key) throw new Error("Invalid setting key");
      settings.set(key, SHAPED_SETTING_KEYS.has(key) ? normaliseSetting(key, value) : value);
      return { success: true };
    } catch (err) {
      console.error("[ipc] settings:set failed:", err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // --- Repository inspection ---
  handle("git:is-repo", async (repoPath: unknown) => git.isRepo(String(repoPath)));
  handle("git:branches", async (repoPath: unknown) => git.branches(requireRepoPath(repoPath)));
  handle("git:log", async (repoPath: unknown, skip?: unknown, maxCount?: unknown, filters?: unknown, ref?: unknown) =>
    git.log(requireRepoPath(repoPath), skip as number | undefined, maxCount as number | undefined, filters as LogFilters | undefined, ref ? String(ref) : undefined));
  handle("git:status", async (repoPath: unknown) => git.status(requireRepoPath(repoPath)));
  handle("git:show", async (repoPath: unknown, hash: unknown) => git.show(requireRepoPath(repoPath), String(hash)));
  handle("git:last-message", async (repoPath: unknown) => git.lastMessage(requireRepoPath(repoPath)));
  handle("git:log-range", async (repoPath: unknown, from: unknown, to: unknown) =>
    git.logRange(requireRepoPath(repoPath), String(from), String(to)));

  // --- Working tree operations ---
  handle("git:stage", async (repoPath: unknown, files: unknown) => git.stage(requireRepoPath(repoPath), files as string[]));
  handle("git:unstage", async (repoPath: unknown, files: unknown) => git.unstage(requireRepoPath(repoPath), files as string[]));
  handle("git:stage-all", async (repoPath: unknown) => git.stageAll(requireRepoPath(repoPath)));
  handle("git:unstage-all", async (repoPath: unknown) => git.unstageAll(requireRepoPath(repoPath)));
  handle("git:discard", async (repoPath: unknown, files: unknown) => git.discard(requireRepoPath(repoPath), files as string[]));
  handle("git:commit", async (repoPath: unknown, message: unknown, amend: unknown) =>
    git.commit(requireRepoPath(repoPath), String(message), Boolean(amend)));

  // --- Branch management ---
  handle("git:checkout", async (repoPath: unknown, branch: unknown) => git.checkout(requireRepoPath(repoPath), String(branch)));
  handle("git:rename-branch", async (repoPath: unknown, oldName: unknown, newName: unknown) =>
    git.renameBranch(requireRepoPath(repoPath), String(oldName), String(newName)));
  handle("git:get-upstream", async (repoPath: unknown, branch: unknown) => git.getUpstream(requireRepoPath(repoPath), String(branch)));
  handle("git:set-upstream", async (repoPath: unknown, branch: unknown, remote: unknown) =>
    git.setUpstream(requireRepoPath(repoPath), String(branch), String(remote)));
  handle("git:unset-upstream", async (repoPath: unknown, branch: unknown) => git.unsetUpstream(requireRepoPath(repoPath), String(branch)));
  handle("git:branch-tracking", async (repoPath: unknown) => git.branchTracking(requireRepoPath(repoPath)));
  handle("git:batch-checkout", async (repoPath: unknown, branch: unknown, opts?: unknown) =>
    git.batchCheckout(requireRepoPath(repoPath), String(branch), opts as BatchCheckoutOptions | undefined));
  handle("git:scan-repos", async (dir: unknown) => git.scanRepos(String(dir)));
  handle("git:checkout-remote", async (repoPath: unknown, remoteBranch: unknown) => git.checkoutRemote(requireRepoPath(repoPath), String(remoteBranch)));
  handle("git:create-branch", async (repoPath: unknown, branchName: unknown, checkout: unknown) =>
    git.createBranch(requireRepoPath(repoPath), String(branchName), Boolean(checkout)));
  handle("git:delete-branch", async (repoPath: unknown, branchName: unknown, force: unknown) =>
    git.deleteBranch(requireRepoPath(repoPath), String(branchName), Boolean(force)));
  handle("git:merge", async (repoPath: unknown, branchName: unknown) => git.merge(requireRepoPath(repoPath), String(branchName)));
  handle("git:rebase-interactive", async (repoPath: unknown, base: unknown, entries: unknown) =>
    git.rebaseInteractive(requireRepoPath(repoPath), String(base), entries as RebaseTodoEntry[]));
  handle("git:reset", async (repoPath: unknown, commitHash: unknown, mode: unknown) =>
    git.reset(requireRepoPath(repoPath), String(commitHash), mode as "soft" | "mixed" | "hard"));

  // --- Stash ---
  handle("git:stash-save", async (repoPath: unknown, message?: unknown, paths?: unknown) =>
    git.stashSave(requireRepoPath(repoPath), message as string | undefined, paths as string[] | undefined));
  handle("git:stash-list", async (repoPath: unknown) => git.stashList(requireRepoPath(repoPath)));
  handle("git:stash-pop", async (repoPath: unknown, ref?: unknown) => git.stashPop(requireRepoPath(repoPath), ref as string | undefined));
  handle("git:stash-drop", async (repoPath: unknown, ref: unknown) => git.stashDrop(requireRepoPath(repoPath), String(ref)));
  handle("git:stash-diff", async (repoPath: unknown, ref: unknown) => git.stashDiff(requireRepoPath(repoPath), String(ref)));

  // --- Remote operations ---
  handle("git:fetch", async (repoPath: unknown) => git.fetch(requireRepoPath(repoPath)));
  handle("git:fetch-branch", async (repoPath: unknown, remote: unknown, branch: unknown) =>
    git.fetchBranch(requireRepoPath(repoPath), String(remote), String(branch)));
  handle("git:pull", async (repoPath: unknown, strategy?: unknown) =>
    git.pull(requireRepoPath(repoPath), strategy as "merge" | "rebase" | "ff-only" | undefined));
  handle("git:pull-branch", async (repoPath: unknown, remote: unknown, branch: unknown) =>
    git.pullBranch(requireRepoPath(repoPath), String(remote), String(branch)));
  handle("git:push", async (repoPath: unknown) => git.push(requireRepoPath(repoPath)));
  handle("git:push-branch", async (repoPath: unknown, remote: unknown, branch: unknown) =>
    git.pushBranch(requireRepoPath(repoPath), String(remote), String(branch)));
  handle("git:delete-remote-branch", async (repoPath: unknown, remote: unknown, branch: unknown) =>
    git.deleteRemoteBranch(requireRepoPath(repoPath), String(remote), String(branch)));
  handle("git:prune-remote", async (repoPath: unknown, remote: unknown) =>
    git.pruneRemote(requireRepoPath(repoPath), String(remote)));

  // --- Diff & hunk operations ---
  handle("git:diff-file", async (repoPath: unknown, filePath: unknown, staged: unknown, fromPath: unknown) =>
    git.diffFile(requireRepoPath(repoPath), String(filePath), Boolean(staged), fromPath ? String(fromPath) : undefined));
  handle("git:commit-file-diff", async (repoPath: unknown, hash: unknown, filePath: unknown) =>
    git.commitFileDiff(requireRepoPath(repoPath), String(hash), String(filePath)));
  handle("git:read-file", async (repoPath: unknown, filePath: unknown) =>
    git.readWorkingFile(requireRepoPath(repoPath), String(filePath)));
  handle("git:checkout-file", async (repoPath: unknown, ref: unknown, filePath: unknown) =>
    git.checkoutFile(requireRepoPath(repoPath), String(ref), String(filePath)));
  handle("git:show-stage", async (repoPath: unknown, stage: unknown, filePath: unknown) =>
    git.showStage(requireRepoPath(repoPath), stage as 1 | 2 | 3, String(filePath)));
  handle("git:write-file", async (repoPath: unknown, filePath: unknown, content: unknown) =>
    git.writeWorkingFile(requireRepoPath(repoPath), String(filePath), String(content)));
  handle("git:stage-hunk", async (repoPath: unknown, patchContent: unknown) =>
    git.stageHunk(requireRepoPath(repoPath), String(patchContent)));
  handle("git:unstage-hunk", async (repoPath: unknown, patchContent: unknown) =>
    git.unstageHunk(requireRepoPath(repoPath), String(patchContent)));
  handle("git:revert-hunk", async (repoPath: unknown, patchContent: unknown) =>
    git.revertHunk(requireRepoPath(repoPath), String(patchContent)));

  // --- Git config ---
  handle("git:get-config", async (repoPath: unknown) => git.getConfig(requireRepoPath(repoPath)));
  handle("git:set-config", async (repoPath: unknown, key: unknown, value: unknown) =>
    git.setConfig(requireRepoPath(repoPath), String(key), String(value)));

  // --- Updates ---
  handle("update:get-state", async () => update.getState());
  handle("update:check", async () => update.check());
  handle("update:download", async () => update.download());
  ipcMain.handle("update:install", () => { update.install(); return { success: true }; });
  // --- Shell & dialogs ---
  // --- Clone / history / review ---
  handle("git:clone", async (url: unknown, destPath: unknown, branch?: unknown) =>
    git.clone(String(url), String(destPath), branch ? String(branch) : undefined));
  handle("git:file-history", async (repoPath: unknown, filePath: unknown, maxCount?: unknown) =>
    git.fileHistory(requireRepoPath(repoPath), String(filePath), maxCount as number | undefined));
  handle("git:blame", async (repoPath: unknown, filePath: unknown, hash?: unknown) =>
    git.blame(requireRepoPath(repoPath), String(filePath), hash ? String(hash) : undefined));
  handle("git:revert", async (repoPath: unknown, hash: unknown) => git.revertCommit(requireRepoPath(repoPath), String(hash)));
  handle("git:compare", async (repoPath: unknown, fromRef: unknown, toRef: unknown) =>
    git.compare(requireRepoPath(repoPath), String(fromRef), String(toRef)));
  handle("git:compare-file-diff", async (repoPath: unknown, fromRef: unknown, toRef: unknown, filePath: unknown) =>
    git.compareFileDiff(requireRepoPath(repoPath), String(fromRef), String(toRef), String(filePath)));
  handle("git:cherry-pick", async (repoPath: unknown, hash: unknown) => git.cherryPick(requireRepoPath(repoPath), String(hash)));
  handle("git:cherry-pick-abort", async (repoPath: unknown) => git.cherryPickAbort(requireRepoPath(repoPath)));
  handle("git:cherry-pick-continue", async (repoPath: unknown) => git.cherryPickContinue(requireRepoPath(repoPath)));
  handle("git:rebase", async (repoPath: unknown, upstream: unknown) => git.rebase(requireRepoPath(repoPath), String(upstream)));
  handle("git:rebase-abort", async (repoPath: unknown) => git.rebaseAbort(requireRepoPath(repoPath)));
  handle("git:rebase-continue", async (repoPath: unknown) => git.rebaseContinue(requireRepoPath(repoPath)));
  handle("git:merge-abort", async (repoPath: unknown) => git.mergeAbort(requireRepoPath(repoPath)));
  handle("git:merge-continue", async (repoPath: unknown) => git.mergeContinue(requireRepoPath(repoPath)));
  handle("git:get-ongoing", async (repoPath: unknown) => git.getOngoingOperation(requireRepoPath(repoPath)));
  handle("git:tags", async (repoPath: unknown) => git.tags(requireRepoPath(repoPath)));
  handle("git:create-tag", async (repoPath: unknown, name: unknown, ref: unknown, message?: unknown) =>
    git.createTag(requireRepoPath(repoPath), String(name), String(ref), message ? String(message) : undefined));
  handle("git:delete-tag", async (repoPath: unknown, name: unknown) => git.deleteTag(requireRepoPath(repoPath), String(name)));
  handle("git:remotes", async (repoPath: unknown) => git.remotes(requireRepoPath(repoPath)));
  handle("git:add-remote", async (repoPath: unknown, name: unknown, url: unknown) =>
    git.addRemote(requireRepoPath(repoPath), String(name), String(url)));
  handle("git:remove-remote", async (repoPath: unknown, name: unknown) => git.removeRemote(requireRepoPath(repoPath), String(name)));
  handle("git:set-remote-url", async (repoPath: unknown, name: unknown, url: unknown) =>
    git.setRemoteUrl(requireRepoPath(repoPath), String(name), String(url)));
  handle("git:submodule-list", async (repoPath: unknown) => git.submoduleList(requireRepoPath(repoPath)));
  handle("git:submodule-add", async (repoPath: unknown, url: unknown, subPath: unknown) =>
    git.submoduleAdd(requireRepoPath(repoPath), String(url), String(subPath)));
  handle("git:submodule-update", async (repoPath: unknown) => git.submoduleUpdate(requireRepoPath(repoPath)));
  handle("git:submodule-deinit", async (repoPath: unknown, subPath: unknown) =>
    git.submoduleDeinit(requireRepoPath(repoPath), String(subPath)));
  handle("git:get-commit-template", async (repoPath: unknown) => git.getCommitTemplate(requireRepoPath(repoPath)));
  handle("git:set-commit-template", async (repoPath: unknown, content: unknown) =>
    git.setCommitTemplate(requireRepoPath(repoPath), String(content)));
  handle("git:get-sign-commits", async (repoPath: unknown) => git.getSignCommits(requireRepoPath(repoPath)));
  handle("git:set-sign-commits", async (repoPath: unknown, enabled: unknown) =>
    git.setSignCommits(requireRepoPath(repoPath), Boolean(enabled)));
  handle("git:get-diff-tool", async (repoPath: unknown) => git.getDiffTool(requireRepoPath(repoPath)));
  handle("git:set-diff-tool", async (repoPath: unknown, tool: unknown) =>
    git.setDiffTool(requireRepoPath(repoPath), String(tool)));
  handle("git:launch-diff-tool", async (repoPath: unknown, filePath?: unknown) =>
    git.launchDiffTool(requireRepoPath(repoPath), filePath ? String(filePath) : undefined));
  handle("git:hosting-url", async (repoPath: unknown, ref?: unknown) =>
    git.hostingUrl(requireRepoPath(repoPath), ref ? String(ref) : undefined));
  handle("git:read-gitignore", async (repoPath: unknown) => git.readGitignore(requireRepoPath(repoPath)));
  handle("git:write-gitignore", async (repoPath: unknown, content: unknown) =>
    git.writeGitignore(requireRepoPath(repoPath), String(content)));
  handle("git:mergetool", async (repoPath: unknown, filePath?: unknown) =>
    git.mergetool(requireRepoPath(repoPath), filePath ? String(filePath) : undefined));

  // --- Repository watching (incremental refresh) ---
  handle("repo:watch", async (repoPath: unknown) => {
    const repo = requireRepoPath(repoPath);
    watcher.start(repo, () => {
      const win = getWindow();
      // The window may close between the debounce timer and this callback.
      if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
      win.webContents.send("repo:changed", repo);
    });
    return true;
  });
  handle("repo:unwatch", async () => {
    watcher.stop();
    return true;
  });

  // --- Shell & dialogs ---
  handle("shell:open-git-bash", async (repoPath: unknown) => git.openGitBash(requireRepoPath(repoPath)));
  // Renderer-controlled URLs are untrusted enough to warrant an allow-list:
  // only http(s) links may be handed to the OS handler.
  handle("shell:open-external", async (url: unknown) => {
    const target = String(url);
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      throw new Error("Invalid URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
    }
    await shell.openExternal(parsed.toString());
    return true;
  });
  ipcMain.handle("dialog:open-directory", async () => {
    const win = getWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });
}

