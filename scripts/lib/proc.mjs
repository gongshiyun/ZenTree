// Shared process helpers for the ZenTree QA harness.
//
// The QA environment uses a portable Git installation with an isolated HOME so
// fixture repositories never depend on the machine's global git identity.
// Import this module from any script that shells out to git.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the ZenTree project root (scripts/lib -> ../..). */
export const REPO_ROOT = path.resolve(LIB_DIR, "..", "..");

/** Where all generated QA artefacts live. */
export const QA_DIR = path.join(REPO_ROOT, ".qa");
export const FIXTURES_DIR = path.join(QA_DIR, "fixtures");
export const SHOTS_DIR = path.join(QA_DIR, "shots");
export const PROFILES_DIR = path.join(QA_DIR, "profiles");

const DEFAULT_GIT_BIN = "D:\\ai-code\\_tools\\git\\cmd\\git.exe";
const FALLBACK_GIT_BIN = "git";
const DEFAULT_GIT_HOME = "D:\\ai-code\\_tools\\git-home";

/** Portable git binary (env-overridable; falls back to PATH `git`). */
export const GIT_BIN = (() => {
  const fromEnv = process.env.ZENTREE_GIT_BIN;
  if (fromEnv) return fromEnv;
  if (fs.existsSync(DEFAULT_GIT_BIN)) return DEFAULT_GIT_BIN;
  return FALLBACK_GIT_BIN;
})();

/** Isolated HOME with a pre-seeded git identity (env-overridable). */
export const GIT_HOME = process.env.ZENTREE_GIT_HOME || DEFAULT_GIT_HOME;

/** Directories to prepend to PATH so git and its helpers resolve. */
const GIT_PATH_ENTRIES = GIT_BIN === FALLBACK_GIT_BIN
  ? []
  : [path.dirname(GIT_BIN), path.join(path.dirname(path.dirname(GIT_BIN)), "bin")];

/** Build an environment suitable for running git deterministically. */
export function gitEnv(extra = {}) {
  const existingPath = process.env.PATH || "";
  const PATH = [...GIT_PATH_ENTRIES, existingPath].filter(Boolean).join(path.delimiter);
  return {
    ...process.env,
    PATH,
    HOME: GIT_HOME,
    // Never prompt, never page, never try to sign, never inject global config.
    GIT_TERMINAL_PROMPT: "0",
    GIT_PAGER: "cat",
    GIT_EDITOR: "true",
    GIT_CONFIG_NOSYSTEM: "1",
    LC_ALL: "C",
    ...extra,
  };
}

export class GitError extends Error {
  constructor(args, status, stdout, stderr) {
    super(`git ${args.join(" ")} failed (exit ${status})\n${stderr || stdout}`);
    this.name = "GitError";
    this.args = args;
    this.status = status;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

/**
 * Run git synchronously.
 *
 * @param {string[]} args  git arguments
 * @param {{cwd?: string, env?: Record<string,string>, allowFailure?: boolean, input?: string}} [opts]
 * @returns {{stdout: string, stderr: string, status: number}}
 */
export function git(args, opts = {}) {
  const { cwd, env, allowFailure = false, input } = opts;
  const res = spawnSync(GIT_BIN, args, {
    cwd,
    env: gitEnv(env),
    encoding: "utf8",
    input,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  const stdout = res.stdout ?? "";
  const stderr = res.stderr ?? "";
  if (res.status !== 0 && !allowFailure) {
    throw new GitError(args, res.status, stdout, stderr);
  }
  return { stdout, stderr, status: res.status ?? 0 };
}

/** Run git and return trimmed stdout. */
export function gitOut(args, opts = {}) {
  return git(args, opts).stdout.trim();
}

/** Remove a file or directory tree, tolerating Windows read-only quirks. */
export function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
}

/** Write a UTF-8 file, creating parent directories as needed. */
export function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

/** Format a Date for GIT_AUTHOR_DATE / GIT_COMMITTER_DATE (deterministic UTC). */
export function gitDate(ms) {
  return new Date(ms).toISOString();
}

/** Make sure generated QA directories exist. */
export function ensureQaDirs() {
  for (const dir of [QA_DIR, FIXTURES_DIR, SHOTS_DIR, PROFILES_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
