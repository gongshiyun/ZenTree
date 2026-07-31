/**
 * Shared contracts between the Electron main process (infrastructure),
 * the preload bridge, and the renderer (application/UI layers).
 */

export interface GitAPI {
  isRepo: (repoPath: string) => Promise<{ success: boolean; data?: boolean; error?: string }>;
  branches: (repoPath: string) => Promise<{ success: boolean; data?: { all: string[]; current: string; branches: Record<string, any> }; error?: string }>;
  log: (repoPath: string, skip: number, maxCount: number) => Promise<{ success: boolean; data?: CommitLogEntry[]; error?: string }>;
  status: (repoPath: string) => Promise<{ success: boolean; data?: GitStatusData; error?: string }>;
  show: (repoPath: string, hash: string) => Promise<{ success: boolean; data?: CommitDetail; error?: string }>;
  lastMessage: (repoPath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  stage: (repoPath: string, files: string[]) => Promise<{ success: boolean; error?: string }>;
  unstage: (repoPath: string, files: string[]) => Promise<{ success: boolean; error?: string }>;
  discard: (repoPath: string, files: string[]) => Promise<{ success: boolean; error?: string }>;
  commit: (repoPath: string, message: string, amend: boolean) => Promise<{ success: boolean; error?: string }>;
  checkout: (repoPath: string, branch: string) => Promise<{ success: boolean; error?: string }>;
  checkoutRemote: (repoPath: string, remoteBranch: string) => Promise<{ success: boolean; error?: string }>;
  createBranch: (repoPath: string, branchName: string, checkout: boolean) => Promise<{ success: boolean; error?: string }>;
  deleteBranch: (repoPath: string, branchName: string, force: boolean) => Promise<{ success: boolean; error?: string }>;
  merge: (repoPath: string, branchName: string) => Promise<{ success: boolean; error?: string }>;
  reset: (repoPath: string, commitHash: string, mode: "soft" | "mixed" | "hard") => Promise<{ success: boolean; error?: string }>;
  stashSave: (repoPath: string, message?: string) => Promise<{ success: boolean; error?: string }>;
  stashList: (repoPath: string) => Promise<{ success: boolean; data?: { ref: string; subject: string }[]; error?: string }>;
  stashPop: (repoPath: string, ref?: string) => Promise<{ success: boolean; error?: string }>;
  stashDrop: (repoPath: string, ref: string) => Promise<{ success: boolean; error?: string }>;
  fetch: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
  pull: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
  push: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
  openDirectory: () => Promise<string | null>;
  openGitBash: (repoPath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  diffFile: (repoPath: string, filePath: string, staged: boolean) => Promise<{ success: boolean; data?: string; error?: string }>;
  commitFileDiff: (repoPath: string, hash: string, filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
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

export interface CommitDetail { hash: string; author: string; email: string; timestamp: number; subject: string; files: string[]; }

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
