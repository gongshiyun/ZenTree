import { ipcMain, dialog, BrowserWindow, shell } from "electron";
import type { BatchCheckoutOptions, LogFilters, RebaseTodoEntry } from "../src/types";
import type { SettingsRepository } from "./settingsRepository";
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

/** Composition root for all IPC channels: window controls, settings, git, dialogs. */
export function registerIpcHandlers({ settings, git, update, watcher, getWindow }: IpcDeps): void {
  // --- Window control ---
  ipcMain.handle("window:minimize", () => getWindow()?.minimize());
  ipcMain.handle("window:maximize", () => {
    const win = getWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle("window:close", () => getWindow()?.close());
  ipcMain.handle("window:is-maximized", () => getWindow()?.isMaximized() ?? false);

  // --- Settings ---
  ipcMain.handle("settings:get-all", () => settings.load());
  ipcMain.handle("settings:set", (_event, key: string, value: unknown) => {
    settings.set(key, value);
    return { success: true };
  });

  // --- Repository inspection ---
  handle("git:is-repo", async (repoPath: unknown) => git.isRepo(String(repoPath)));
  handle("git:branches", async (repoPath: unknown) => git.branches(String(repoPath)));
  handle("git:log", async (repoPath: unknown, skip?: unknown, maxCount?: unknown, filters?: unknown, ref?: unknown) =>
    git.log(String(repoPath), skip as number | undefined, maxCount as number | undefined, filters as LogFilters | undefined, ref ? String(ref) : undefined));
  handle("git:status", async (repoPath: unknown) => git.status(String(repoPath)));
  handle("git:show", async (repoPath: unknown, hash: unknown) => git.show(String(repoPath), String(hash)));
  handle("git:last-message", async (repoPath: unknown) => git.lastMessage(String(repoPath)));
  handle("git:log-range", async (repoPath: unknown, from: unknown, to: unknown) =>
    git.logRange(String(repoPath), String(from), String(to)));

  // --- Working tree operations ---
  handle("git:stage", async (repoPath: unknown, files: unknown) => git.stage(String(repoPath), files as string[]));
  handle("git:unstage", async (repoPath: unknown, files: unknown) => git.unstage(String(repoPath), files as string[]));
  handle("git:stage-all", async (repoPath: unknown) => git.stageAll(String(repoPath)));
  handle("git:unstage-all", async (repoPath: unknown) => git.unstageAll(String(repoPath)));
  handle("git:discard", async (repoPath: unknown, files: unknown) => git.discard(String(repoPath), files as string[]));
  handle("git:commit", async (repoPath: unknown, message: unknown, amend: unknown) =>
    git.commit(String(repoPath), String(message), Boolean(amend)));

  // --- Branch management ---
  handle("git:checkout", async (repoPath: unknown, branch: unknown) => git.checkout(String(repoPath), String(branch)));
  handle("git:rename-branch", async (repoPath: unknown, oldName: unknown, newName: unknown) =>
    git.renameBranch(String(repoPath), String(oldName), String(newName)));
  handle("git:get-upstream", async (repoPath: unknown, branch: unknown) => git.getUpstream(String(repoPath), String(branch)));
  handle("git:set-upstream", async (repoPath: unknown, branch: unknown, remote: unknown) =>
    git.setUpstream(String(repoPath), String(branch), String(remote)));
  handle("git:unset-upstream", async (repoPath: unknown, branch: unknown) => git.unsetUpstream(String(repoPath), String(branch)));
  handle("git:branch-tracking", async (repoPath: unknown) => git.branchTracking(String(repoPath)));
  handle("git:batch-checkout", async (repoPath: unknown, branch: unknown, opts?: unknown) =>
    git.batchCheckout(String(repoPath), String(branch), opts as BatchCheckoutOptions | undefined));
  handle("git:scan-repos", async (dir: unknown) => git.scanRepos(String(dir)));
  handle("git:checkout-remote", async (repoPath: unknown, remoteBranch: unknown) => git.checkoutRemote(String(repoPath), String(remoteBranch)));
  handle("git:create-branch", async (repoPath: unknown, branchName: unknown, checkout: unknown) =>
    git.createBranch(String(repoPath), String(branchName), Boolean(checkout)));
  handle("git:delete-branch", async (repoPath: unknown, branchName: unknown, force: unknown) =>
    git.deleteBranch(String(repoPath), String(branchName), Boolean(force)));
  handle("git:merge", async (repoPath: unknown, branchName: unknown) => git.merge(String(repoPath), String(branchName)));
  handle("git:rebase-interactive", async (repoPath: unknown, base: unknown, entries: unknown) =>
    git.rebaseInteractive(String(repoPath), String(base), entries as RebaseTodoEntry[]));
  handle("git:reset", async (repoPath: unknown, commitHash: unknown, mode: unknown) =>
    git.reset(String(repoPath), String(commitHash), mode as "soft" | "mixed" | "hard"));

  // --- Stash ---
  handle("git:stash-save", async (repoPath: unknown, message?: unknown, paths?: unknown) =>
    git.stashSave(String(repoPath), message as string | undefined, paths as string[] | undefined));
  handle("git:stash-list", async (repoPath: unknown) => git.stashList(String(repoPath)));
  handle("git:stash-pop", async (repoPath: unknown, ref?: unknown) => git.stashPop(String(repoPath), ref as string | undefined));
  handle("git:stash-drop", async (repoPath: unknown, ref: unknown) => git.stashDrop(String(repoPath), String(ref)));
  handle("git:stash-diff", async (repoPath: unknown, ref: unknown) => git.stashDiff(String(repoPath), String(ref)));

  // --- Remote operations ---
  handle("git:fetch", async (repoPath: unknown) => git.fetch(String(repoPath)));
  handle("git:fetch-branch", async (repoPath: unknown, remote: unknown, branch: unknown) =>
    git.fetchBranch(String(repoPath), String(remote), String(branch)));
  handle("git:pull", async (repoPath: unknown, strategy?: unknown) =>
    git.pull(String(repoPath), strategy as "merge" | "rebase" | "ff-only" | undefined));
  handle("git:pull-branch", async (repoPath: unknown, remote: unknown, branch: unknown) =>
    git.pullBranch(String(repoPath), String(remote), String(branch)));
  handle("git:push", async (repoPath: unknown) => git.push(String(repoPath)));
  handle("git:push-branch", async (repoPath: unknown, remote: unknown, branch: unknown) =>
    git.pushBranch(String(repoPath), String(remote), String(branch)));
  handle("git:delete-remote-branch", async (repoPath: unknown, remote: unknown, branch: unknown) =>
    git.deleteRemoteBranch(String(repoPath), String(remote), String(branch)));
  handle("git:prune-remote", async (repoPath: unknown, remote: unknown) =>
    git.pruneRemote(String(repoPath), String(remote)));

  // --- Diff & hunk operations ---
  handle("git:diff-file", async (repoPath: unknown, filePath: unknown, staged: unknown, fromPath: unknown) =>
    git.diffFile(String(repoPath), String(filePath), Boolean(staged), fromPath ? String(fromPath) : undefined));
  handle("git:commit-file-diff", async (repoPath: unknown, hash: unknown, filePath: unknown) =>
    git.commitFileDiff(String(repoPath), String(hash), String(filePath)));
  handle("git:read-file", async (repoPath: unknown, filePath: unknown) =>
    git.readWorkingFile(String(repoPath), String(filePath)));
  handle("git:checkout-file", async (repoPath: unknown, ref: unknown, filePath: unknown) =>
    git.checkoutFile(String(repoPath), String(ref), String(filePath)));
  handle("git:show-stage", async (repoPath: unknown, stage: unknown, filePath: unknown) =>
    git.showStage(String(repoPath), stage as 1 | 2 | 3, String(filePath)));
  handle("git:write-file", async (repoPath: unknown, filePath: unknown, content: unknown) =>
    git.writeWorkingFile(String(repoPath), String(filePath), String(content)));
  handle("git:stage-hunk", async (repoPath: unknown, patchContent: unknown) =>
    git.stageHunk(String(repoPath), String(patchContent)));
  handle("git:unstage-hunk", async (repoPath: unknown, patchContent: unknown) =>
    git.unstageHunk(String(repoPath), String(patchContent)));
  handle("git:revert-hunk", async (repoPath: unknown, patchContent: unknown) =>
    git.revertHunk(String(repoPath), String(patchContent)));

  // --- Git config ---
  handle("git:get-config", async (repoPath: unknown) => git.getConfig(String(repoPath)));
  handle("git:set-config", async (repoPath: unknown, key: unknown, value: unknown) =>
    git.setConfig(String(repoPath), String(key), String(value)));

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
    git.fileHistory(String(repoPath), String(filePath), maxCount as number | undefined));
  handle("git:blame", async (repoPath: unknown, filePath: unknown, hash?: unknown) =>
    git.blame(String(repoPath), String(filePath), hash ? String(hash) : undefined));
  handle("git:revert", async (repoPath: unknown, hash: unknown) => git.revertCommit(String(repoPath), String(hash)));
  handle("git:compare", async (repoPath: unknown, fromRef: unknown, toRef: unknown) =>
    git.compare(String(repoPath), String(fromRef), String(toRef)));
  handle("git:compare-file-diff", async (repoPath: unknown, fromRef: unknown, toRef: unknown, filePath: unknown) =>
    git.compareFileDiff(String(repoPath), String(fromRef), String(toRef), String(filePath)));
  handle("git:cherry-pick", async (repoPath: unknown, hash: unknown) => git.cherryPick(String(repoPath), String(hash)));
  handle("git:cherry-pick-abort", async (repoPath: unknown) => git.cherryPickAbort(String(repoPath)));
  handle("git:cherry-pick-continue", async (repoPath: unknown) => git.cherryPickContinue(String(repoPath)));
  handle("git:rebase", async (repoPath: unknown, upstream: unknown) => git.rebase(String(repoPath), String(upstream)));
  handle("git:rebase-abort", async (repoPath: unknown) => git.rebaseAbort(String(repoPath)));
  handle("git:rebase-continue", async (repoPath: unknown) => git.rebaseContinue(String(repoPath)));
  handle("git:merge-abort", async (repoPath: unknown) => git.mergeAbort(String(repoPath)));
  handle("git:merge-continue", async (repoPath: unknown) => git.mergeContinue(String(repoPath)));
  handle("git:get-ongoing", async (repoPath: unknown) => git.getOngoingOperation(String(repoPath)));
  handle("git:tags", async (repoPath: unknown) => git.tags(String(repoPath)));
  handle("git:create-tag", async (repoPath: unknown, name: unknown, ref: unknown, message?: unknown) =>
    git.createTag(String(repoPath), String(name), String(ref), message ? String(message) : undefined));
  handle("git:delete-tag", async (repoPath: unknown, name: unknown) => git.deleteTag(String(repoPath), String(name)));
  handle("git:remotes", async (repoPath: unknown) => git.remotes(String(repoPath)));
  handle("git:add-remote", async (repoPath: unknown, name: unknown, url: unknown) =>
    git.addRemote(String(repoPath), String(name), String(url)));
  handle("git:remove-remote", async (repoPath: unknown, name: unknown) => git.removeRemote(String(repoPath), String(name)));
  handle("git:set-remote-url", async (repoPath: unknown, name: unknown, url: unknown) =>
    git.setRemoteUrl(String(repoPath), String(name), String(url)));
  handle("git:submodule-list", async (repoPath: unknown) => git.submoduleList(String(repoPath)));
  handle("git:submodule-add", async (repoPath: unknown, url: unknown, subPath: unknown) =>
    git.submoduleAdd(String(repoPath), String(url), String(subPath)));
  handle("git:submodule-update", async (repoPath: unknown) => git.submoduleUpdate(String(repoPath)));
  handle("git:submodule-deinit", async (repoPath: unknown, subPath: unknown) =>
    git.submoduleDeinit(String(repoPath), String(subPath)));
  handle("git:get-commit-template", async (repoPath: unknown) => git.getCommitTemplate(String(repoPath)));
  handle("git:set-commit-template", async (repoPath: unknown, content: unknown) =>
    git.setCommitTemplate(String(repoPath), String(content)));
  handle("git:get-sign-commits", async (repoPath: unknown) => git.getSignCommits(String(repoPath)));
  handle("git:set-sign-commits", async (repoPath: unknown, enabled: unknown) =>
    git.setSignCommits(String(repoPath), Boolean(enabled)));
  handle("git:get-diff-tool", async (repoPath: unknown) => git.getDiffTool(String(repoPath)));
  handle("git:set-diff-tool", async (repoPath: unknown, tool: unknown) =>
    git.setDiffTool(String(repoPath), String(tool)));
  handle("git:launch-diff-tool", async (repoPath: unknown, filePath?: unknown) =>
    git.launchDiffTool(String(repoPath), filePath ? String(filePath) : undefined));
  handle("git:hosting-url", async (repoPath: unknown, ref?: unknown) =>
    git.hostingUrl(String(repoPath), ref ? String(ref) : undefined));
  handle("git:read-gitignore", async (repoPath: unknown) => git.readGitignore(String(repoPath)));
  handle("git:write-gitignore", async (repoPath: unknown, content: unknown) =>
    git.writeGitignore(String(repoPath), String(content)));
  handle("git:mergetool", async (repoPath: unknown, filePath?: unknown) =>
    git.mergetool(String(repoPath), filePath ? String(filePath) : undefined));

  // --- Repository watching (incremental refresh) ---
  handle("repo:watch", async (repoPath: unknown) => {
    const repo = String(repoPath);
    watcher.start(repo, () => getWindow()?.webContents.send("repo:changed", repo));
    return true;
  });
  handle("repo:unwatch", async () => {
    watcher.stop();
    return true;
  });

  // --- Shell & dialogs ---
  handle("shell:open-git-bash", async (repoPath: unknown) => git.openGitBash(String(repoPath)));
  handle("shell:open-external", async (url: unknown) => { await shell.openExternal(String(url)); return true; });
  ipcMain.handle("dialog:open-directory", async () => {
    const win = getWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });
}
