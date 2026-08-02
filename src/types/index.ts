/**
 * Shared contracts between the Electron main process (infrastructure),
 * the preload bridge, and the renderer (application/UI layers).
 */

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error"
  | "unsupported";

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
}

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  version?: string;
  releaseNotes?: string;
  progress?: UpdateProgress;
  error?: string;
  reason?: "dev" | "portable";
}
export interface GitAPI {
  isRepo: (repoPath: string) => Promise<{ success: boolean; data?: boolean; error?: string }>;
  branches: (repoPath: string) => Promise<{ success: boolean; data?: { all: string[]; current: string; branches: Record<string, any> }; error?: string }>;
  log: (repoPath: string, skip: number, maxCount: number, filters?: LogFilters, ref?: string) => Promise<{ success: boolean; data?: CommitLogEntry[]; error?: string }>;
  status: (repoPath: string) => Promise<{ success: boolean; data?: GitStatusData; error?: string }>;
  show: (repoPath: string, hash: string) => Promise<{ success: boolean; data?: CommitDetail; error?: string }>;
  lastMessage: (repoPath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  logRange: (repoPath: string, from: string, to: string) => Promise<{ success: boolean; data?: { hash: string; subject: string }[]; error?: string }>;
  stage: (repoPath: string, files: string[]) => Promise<{ success: boolean; error?: string }>;
  unstage: (repoPath: string, files: string[]) => Promise<{ success: boolean; error?: string }>;
  stageAll: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
  unstageAll: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
  discard: (repoPath: string, files: string[]) => Promise<{ success: boolean; error?: string }>;
  commit: (repoPath: string, message: string, amend: boolean) => Promise<{ success: boolean; error?: string }>;
  checkout: (repoPath: string, branch: string) => Promise<{ success: boolean; error?: string }>;
  renameBranch: (repoPath: string, oldName: string, newName: string) => Promise<{ success: boolean; error?: string }>;
  getUpstream: (repoPath: string, branch: string) => Promise<{ success: boolean; data?: string | null; error?: string }>;
  setUpstream: (repoPath: string, branch: string, remote: string) => Promise<{ success: boolean; error?: string }>;
  unsetUpstream: (repoPath: string, branch: string) => Promise<{ success: boolean; error?: string }>;
  branchTracking: (repoPath: string) => Promise<{ success: boolean; data?: BranchTracking[]; error?: string }>;
  batchCheckout: (repoPath: string, branch: string, opts?: BatchCheckoutOptions) => Promise<{ success: boolean; data?: BatchRepoResult; error?: string }>;
  scanRepos: (dir: string) => Promise<{ success: boolean; data?: { path: string; name: string }[]; error?: string }>;
  checkoutRemote: (repoPath: string, remoteBranch: string) => Promise<{ success: boolean; error?: string }>;
  createBranch: (repoPath: string, branchName: string, checkout: boolean) => Promise<{ success: boolean; error?: string }>;
  deleteBranch: (repoPath: string, branchName: string, force: boolean) => Promise<{ success: boolean; error?: string }>;
  merge: (repoPath: string, branchName: string) => Promise<{ success: boolean; error?: string }>;
  rebaseInteractive: (repoPath: string, base: string, entries: RebaseTodoEntry[]) => Promise<{ success: boolean; error?: string }>;
  reset: (repoPath: string, commitHash: string, mode: "soft" | "mixed" | "hard") => Promise<{ success: boolean; error?: string }>;
  stashSave: (repoPath: string, message?: string, paths?: string[]) => Promise<{ success: boolean; error?: string }>;
  stashList: (repoPath: string) => Promise<{ success: boolean; data?: { ref: string; subject: string }[]; error?: string }>;
  stashPop: (repoPath: string, ref?: string) => Promise<{ success: boolean; error?: string }>;
  stashDrop: (repoPath: string, ref: string) => Promise<{ success: boolean; error?: string }>;
  fetch: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
  fetchBranch: (repoPath: string, remote: string, branch: string) => Promise<{ success: boolean; error?: string }>;
  pull: (repoPath: string, strategy?: PullStrategy) => Promise<{ success: boolean; error?: string }>;
  pullBranch: (repoPath: string, remote: string, branch: string) => Promise<{ success: boolean; error?: string }>;
  push: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
  pushBranch: (repoPath: string, remote: string, branch: string) => Promise<{ success: boolean; error?: string }>;
  deleteRemoteBranch: (repoPath: string, remote: string, branch: string) => Promise<{ success: boolean; error?: string }>;
  pruneRemote: (repoPath: string, remote: string) => Promise<{ success: boolean; error?: string }>;
  openDirectory: () => Promise<string | null>;
  openGitBash: (repoPath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  diffFile: (repoPath: string, filePath: string, staged: boolean) => Promise<{ success: boolean; data?: string; error?: string }>;
  commitFileDiff: (repoPath: string, hash: string, filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  readWorkingFile: (repoPath: string, filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  stageHunk: (repoPath: string, patchContent: string) => Promise<{ success: boolean; error?: string }>;
  unstageHunk: (repoPath: string, patchContent: string) => Promise<{ success: boolean; error?: string }>;
  revertHunk: (repoPath: string, patchContent: string) => Promise<{ success: boolean; error?: string }>;
  getConfig: (repoPath: string) => Promise<{ success: boolean; data?: { userName: string; userEmail: string }; error?: string }>;
  setConfig: (repoPath: string, key: string, value: string) => Promise<{ success: boolean; error?: string }>;
  getSettings: () => Promise<AppSettings>;
  setSetting: (key: string, value: unknown) => Promise<{ success: boolean }>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  getUpdateState: () => Promise<{ success: boolean; data?: UpdateState; error?: string }>;
  checkForUpdates: () => Promise<{ success: boolean; data?: UpdateState; error?: string }>;
  downloadUpdate: () => Promise<{ success: boolean; data?: UpdateState; error?: string }>;
  installUpdate: () => Promise<{ success: boolean; error?: string }>;
  onUpdateEvent: (cb: (state: UpdateState) => void) => () => void;
  clone: (url: string, destPath: string, branch?: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  fileHistory: (repoPath: string, filePath: string, maxCount?: number) => Promise<{ success: boolean; data?: FileHistoryEntry[]; error?: string }>;
  blame: (repoPath: string, filePath: string, hash?: string) => Promise<{ success: boolean; data?: BlameLine[]; error?: string }>;
  revertCommit: (repoPath: string, hash: string) => Promise<{ success: boolean; error?: string }>;
  compare: (repoPath: string, fromRef: string, toRef: string) => Promise<{ success: boolean; data?: CompareResult; error?: string }>;
  compareFileDiff: (repoPath: string, fromRef: string, toRef: string, filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  cherryPick: (repoPath: string, hash: string) => Promise<{ success: boolean; error?: string }>;
  cherryPickAbort: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
  cherryPickContinue: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
  rebase: (repoPath: string, upstream: string) => Promise<{ success: boolean; error?: string }>;
  rebaseAbort: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
  rebaseContinue: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
  mergeAbort: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
  mergeContinue: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
  getOngoingOperation: (repoPath: string) => Promise<{ success: boolean; data?: "merge" | "rebase" | "cherry-pick" | null; error?: string }>;
  tags: (repoPath: string) => Promise<{ success: boolean; data?: TagInfo[]; error?: string }>;
  createTag: (repoPath: string, name: string, ref: string, message?: string) => Promise<{ success: boolean; error?: string }>;
  deleteTag: (repoPath: string, name: string) => Promise<{ success: boolean; error?: string }>;
  remotes: (repoPath: string) => Promise<{ success: boolean; data?: RemoteInfo[]; error?: string }>;
  addRemote: (repoPath: string, name: string, url: string) => Promise<{ success: boolean; error?: string }>;
  removeRemote: (repoPath: string, name: string) => Promise<{ success: boolean; error?: string }>;
  setRemoteUrl: (repoPath: string, name: string, url: string) => Promise<{ success: boolean; error?: string }>;
  submoduleList: (repoPath: string) => Promise<{ success: boolean; data?: SubmoduleInfo[]; error?: string }>;
  submoduleAdd: (repoPath: string, url: string, subPath: string) => Promise<{ success: boolean; error?: string }>;
  submoduleUpdate: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
  submoduleDeinit: (repoPath: string, subPath: string) => Promise<{ success: boolean; error?: string }>;
  getCommitTemplate: (repoPath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  setCommitTemplate: (repoPath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  getSignCommits: (repoPath: string) => Promise<{ success: boolean; data?: boolean; error?: string }>;
  setSignCommits: (repoPath: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  getDiffTool: (repoPath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  setDiffTool: (repoPath: string, tool: string) => Promise<{ success: boolean; error?: string }>;
  launchDiffTool: (repoPath: string, filePath?: string) => Promise<{ success: boolean; error?: string }>;
  hostingUrl: (repoPath: string, ref?: string) => Promise<{ success: boolean; data?: string | null; error?: string }>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  readGitignore: (repoPath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  writeGitignore: (repoPath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  mergetool: (repoPath: string, filePath?: string) => Promise<{ success: boolean; error?: string }>;
}

export interface LogFilters {
  query?: string;
  author?: string;
  since?: string;
  until?: string;
}

export interface RebaseTodoEntry {
  action: "pick" | "reword" | "squash" | "fixup" | "drop";
  hash: string;
  subject: string;
  rewordMessage?: string;
}

export type PullStrategy = "merge" | "rebase" | "ff-only";

export interface BranchTracking {
  name: string;
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface SubmoduleInfo {
  path: string;
  url: string;
}

export interface BatchCheckoutOptions {
  fetch?: boolean;
  pull?: boolean;
  stash?: boolean;
}

export interface BatchRepoResult {
  repo: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
  branchBefore: string;
  branchAfter: string;
  stashed: boolean;
  restored: boolean;
  actions: string[];
}

export interface RepoGroup {
  name: string;
  repos: string[];
}

export interface CommitFileStat {
  path: string;
  additions: number;
  deletions: number;
  binary?: boolean;
}

export interface FileHistoryEntry {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  timestamp: number;
  subject: string;
}

export interface BlameLine {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  timestamp: number;
  lineNumber: number;
  content: string;
  subject?: string;
}

export interface CompareFileStat {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface CompareResult {
  from: string;
  to: string;
  ahead: number;
  behind: number;
  files: CompareFileStat[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface TagInfo {
  name: string;
  hash: string;
  date: string;
  subject: string;
}

export interface RemoteInfo {
  name: string;
  url: string;
}

export interface AppSettings {
  windowWidth?: number;
  windowHeight?: number;
  gitPath?: string;
  repos?: { path: string; name: string }[];
  themePreset?: string;
  language?: "en" | "zh";
  lastRepo?: string | null;
  [key: string]: unknown;
}

export interface CommitLogEntry {
  hash: string;
  shortHash: string;
  parents: string[];
  author: string;
  email: string;
  timestamp: number;
  subject: string;
  body?: string;
}

export interface GraphNode {
  hash: string; shortHash: string; parents: string[];
  author: string; email: string; timestamp: number; subject: string; body?: string;
  x: number; y: number; color: string; lane: number; isSelected: boolean;
}

export interface GraphEdge { fromX: number; fromY: number; toX: number; toY: number; color: string; }

export interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; maxLane: number; branchRefs?: Record<string, string[]>; }

export interface GitStatusData {
  staged: string[]; modified: string[]; created: string[]; deleted: string[];
  renamed: { from: string; to: string }[]; not_added: string[]; conflicted: string[];
  files: { path: string; index: string; working_dir: string }[]; current: string;
}

export interface CommitDetail { hash: string; author: string; email: string; timestamp: number; subject: string; files: string[]; stats?: CommitFileStat[]; }

export interface RepoInfo { path: string; name: string; }

export interface DiffHunk {
  header: string;
  oldStart: number; oldCount: number;
  newStart: number; newCount: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "context" | "addition" | "deletion";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

declare global {
  interface Window {
    gitAPI: GitAPI;
  }
}
