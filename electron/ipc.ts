import { ipcMain, dialog, BrowserWindow } from "electron";
import type { SettingsRepository } from "./settingsRepository";
import type { GitRepository } from "./gitRepository";

interface IpcDeps {
  settings: SettingsRepository;
  git: GitRepository;
  getWindow: () => BrowserWindow | null;
}

function safeHandler<T>(fn: (...args: unknown[]) => Promise<T>) {
  return async (_event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => {
    try {
      const result = await fn(...args);
      return { success: true, data: result };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  };
}

/** Composition root for all IPC channels: window controls, settings, git, dialogs. */
export function registerIpcHandlers({ settings, git, getWindow }: IpcDeps): void {
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
  ipcMain.handle("git:is-repo", safeHandler(async (repoPath: unknown) => git.isRepo(String(repoPath))));
  ipcMain.handle("git:branches", safeHandler(async (repoPath: unknown) => git.branches(String(repoPath))));
  ipcMain.handle("git:log", safeHandler(async (repoPath: unknown, skip?: unknown, maxCount?: unknown) =>
    git.log(String(repoPath), skip as number | undefined, maxCount as number | undefined)));
  ipcMain.handle("git:status", safeHandler(async (repoPath: unknown) => git.status(String(repoPath))));
  ipcMain.handle("git:show", safeHandler(async (repoPath: unknown, hash: unknown) => git.show(String(repoPath), String(hash))));
  ipcMain.handle("git:last-message", safeHandler(async (repoPath: unknown) => git.lastMessage(String(repoPath))));

  // --- Working tree operations ---
  ipcMain.handle("git:stage", safeHandler(async (repoPath: unknown, files: unknown) => git.stage(String(repoPath), files as string[])));
  ipcMain.handle("git:unstage", safeHandler(async (repoPath: unknown, files: unknown) => git.unstage(String(repoPath), files as string[])));
  ipcMain.handle("git:discard", safeHandler(async (repoPath: unknown, files: unknown) => git.discard(String(repoPath), files as string[])));
  ipcMain.handle("git:commit", safeHandler(async (repoPath: unknown, message: unknown, amend: unknown) =>
    git.commit(String(repoPath), String(message), Boolean(amend))));

  // --- Branch management ---
  ipcMain.handle("git:checkout", safeHandler(async (repoPath: unknown, branch: unknown) => git.checkout(String(repoPath), String(branch))));
  ipcMain.handle("git:checkout-remote", safeHandler(async (repoPath: unknown, remoteBranch: unknown) => git.checkoutRemote(String(repoPath), String(remoteBranch))));
  ipcMain.handle("git:create-branch", safeHandler(async (repoPath: unknown, branchName: unknown, checkout: unknown) =>
    git.createBranch(String(repoPath), String(branchName), Boolean(checkout))));
  ipcMain.handle("git:delete-branch", safeHandler(async (repoPath: unknown, branchName: unknown, force: unknown) =>
    git.deleteBranch(String(repoPath), String(branchName), Boolean(force))));
  ipcMain.handle("git:merge", safeHandler(async (repoPath: unknown, branchName: unknown) => git.merge(String(repoPath), String(branchName))));
  ipcMain.handle("git:reset", safeHandler(async (repoPath: unknown, commitHash: unknown, mode: unknown) =>
    git.reset(String(repoPath), String(commitHash), mode as "soft" | "mixed" | "hard")));

  // --- Stash ---
  ipcMain.handle("git:stash-save", safeHandler(async (repoPath: unknown, message?: unknown) => git.stashSave(String(repoPath), message as string | undefined)));
  ipcMain.handle("git:stash-list", safeHandler(async (repoPath: unknown) => git.stashList(String(repoPath))));
  ipcMain.handle("git:stash-pop", safeHandler(async (repoPath: unknown, ref?: unknown) => git.stashPop(String(repoPath), ref as string | undefined)));
  ipcMain.handle("git:stash-drop", safeHandler(async (repoPath: unknown, ref: unknown) => git.stashDrop(String(repoPath), String(ref))));

  // --- Remote operations ---
  ipcMain.handle("git:fetch", safeHandler(async (repoPath: unknown) => git.fetch(String(repoPath))));
  ipcMain.handle("git:pull", safeHandler(async (repoPath: unknown) => git.pull(String(repoPath))));
  ipcMain.handle("git:push", safeHandler(async (repoPath: unknown) => git.push(String(repoPath))));

  // --- Diff & hunk operations ---
  ipcMain.handle("git:diff-file", safeHandler(async (repoPath: unknown, filePath: unknown, staged: unknown) =>
    git.diffFile(String(repoPath), String(filePath), Boolean(staged))));
  ipcMain.handle("git:commit-file-diff", safeHandler(async (repoPath: unknown, hash: unknown, filePath: unknown) =>
    git.commitFileDiff(String(repoPath), String(hash), String(filePath))));
  ipcMain.handle("git:stage-hunk", safeHandler(async (repoPath: unknown, patchContent: unknown) =>
    git.stageHunk(String(repoPath), String(patchContent))));
  ipcMain.handle("git:unstage-hunk", safeHandler(async (repoPath: unknown, patchContent: unknown) =>
    git.unstageHunk(String(repoPath), String(patchContent))));
  ipcMain.handle("git:revert-hunk", safeHandler(async (repoPath: unknown, patchContent: unknown) =>
    git.revertHunk(String(repoPath), String(patchContent))));

  // --- Git config ---
  ipcMain.handle("git:get-config", safeHandler(async (repoPath: unknown) => git.getConfig(String(repoPath))));
  ipcMain.handle("git:set-config", safeHandler(async (repoPath: unknown, key: unknown, value: unknown) =>
    git.setConfig(String(repoPath), String(key), String(value))));

  // --- Shell & dialogs ---
  ipcMain.handle("shell:open-git-bash", safeHandler(async (repoPath: unknown) => git.openGitBash(String(repoPath))));
  ipcMain.handle("dialog:open-directory", async () => {
    const win = getWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });
}
