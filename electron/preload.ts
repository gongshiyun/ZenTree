import { contextBridge, ipcRenderer } from "electron";

const api = {
  isRepo: (repoPath: string) => ipcRenderer.invoke("git:is-repo", repoPath),
  branches: (repoPath: string) => ipcRenderer.invoke("git:branches", repoPath),
  log: (repoPath: string, skip: number, maxCount: number) => ipcRenderer.invoke("git:log", repoPath, skip, maxCount),
  status: (repoPath: string) => ipcRenderer.invoke("git:status", repoPath),
  show: (repoPath: string, hash: string) => ipcRenderer.invoke("git:show", repoPath, hash),
  showDetail: (repoPath: string, hash: string) => ipcRenderer.invoke("git:show-detail", repoPath, hash),
  lastMessage: (repoPath: string) => ipcRenderer.invoke("git:last-message", repoPath),
  stage: (repoPath: string, files: string[]) => ipcRenderer.invoke("git:stage", repoPath, files),
  unstage: (repoPath: string, files: string[]) => ipcRenderer.invoke("git:unstage", repoPath, files),
  discard: (repoPath: string, files: string[]) => ipcRenderer.invoke("git:discard", repoPath, files),
  commit: (repoPath: string, message: string, amend: boolean) => ipcRenderer.invoke("git:commit", repoPath, message, amend),
  checkout: (repoPath: string, branch: string) => ipcRenderer.invoke("git:checkout", repoPath, branch),
  checkoutRemote: (repoPath: string, remoteBranch: string) => ipcRenderer.invoke("git:checkout-remote", repoPath, remoteBranch),
  createBranch: (repoPath: string, branchName: string, checkout: boolean) => ipcRenderer.invoke("git:create-branch", repoPath, branchName, checkout),
  deleteBranch: (repoPath: string, branchName: string, force: boolean) => ipcRenderer.invoke("git:delete-branch", repoPath, branchName, force),
  merge: (repoPath: string, branchName: string) => ipcRenderer.invoke("git:merge", repoPath, branchName),
  reset: (repoPath: string, commitHash: string, mode: "soft" | "mixed" | "hard") => ipcRenderer.invoke("git:reset", repoPath, commitHash, mode),
  stashSave: (repoPath: string, message?: string) => ipcRenderer.invoke("git:stash-save", repoPath, message),
  stashList: (repoPath: string) => ipcRenderer.invoke("git:stash-list", repoPath),
  stashPop: (repoPath: string, ref?: string) => ipcRenderer.invoke("git:stash-pop", repoPath, ref),
  stashDrop: (repoPath: string, ref: string) => ipcRenderer.invoke("git:stash-drop", repoPath, ref),
  fetch: (repoPath: string) => ipcRenderer.invoke("git:fetch", repoPath),
  pull: (repoPath: string) => ipcRenderer.invoke("git:pull", repoPath),
  push: (repoPath: string) => ipcRenderer.invoke("git:push", repoPath),
  openDirectory: () => ipcRenderer.invoke("dialog:open-directory"),
  openGitBash: (repoPath: string) => ipcRenderer.invoke("shell:open-git-bash", repoPath),
  // Diff & hunk operations
  diffFile: (repoPath: string, filePath: string, staged: boolean) => ipcRenderer.invoke("git:diff-file", repoPath, filePath, staged),
  commitFileDiff: (repoPath: string, hash: string, filePath: string) => ipcRenderer.invoke("git:commit-file-diff", repoPath, hash, filePath),
  stageHunk: (repoPath: string, patchContent: string) => ipcRenderer.invoke("git:stage-hunk", repoPath, patchContent),
  unstageHunk: (repoPath: string, patchContent: string) => ipcRenderer.invoke("git:unstage-hunk", repoPath, patchContent),
  revertHunk: (repoPath: string, patchContent: string) => ipcRenderer.invoke("git:revert-hunk", repoPath, patchContent),
  // Git config
  getConfig: (repoPath: string) => ipcRenderer.invoke("git:get-config", repoPath),
  setConfig: (repoPath: string, key: string, value: string) => ipcRenderer.invoke("git:set-config", repoPath, key, value),
  // Settings
  getSettings: () => ipcRenderer.invoke("settings:get-all"),
  setSetting: (key: string, value: any) => ipcRenderer.invoke("settings:set", key, value),
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window:maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
};

contextBridge.exposeInMainWorld("gitAPI", api);

export type GitAPI = typeof api;
