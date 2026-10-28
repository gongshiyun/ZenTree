#!/usr/bin/env node
// Create deterministic fixture git repositories for the ZenTree visual QA harness.
//
//   node scripts/make-fixture.mjs            # recreate all fixtures
//   node scripts/make-fixture.mjs demo       # recreate only one fixture
//
// Fixtures (under .qa/fixtures/, wiped and recreated on every run):
//   demo      ~23 commits on 3 branches + merge commit + 2 tags + stash +
//             dirty working tree (staged / unstaged / untracked / rename)
//   conflict  an unresolved merge conflict (two conflicted files, MERGE_HEAD)
//
// Determinism: every commit/tag/stash uses fixed author, committer and date
// values, and the repositories are created from scratch, so the commit hashes
// are identical on every run. Local user.name/user.email are configured in each
// repository, so fixture behaviour never depends on the machine git config.
//
// Git is executed with the portable binary + isolated HOME used by the QA
// harness (see scripts/lib/proc.mjs).

import fs from "node:fs";
import path from "node:path";
import { FIXTURES_DIR, ensureQaDirs, git, gitOut, gitDate, rmrf, writeFile } from "./lib/proc.mjs";

const FIXTURE_NAMES = ["demo", "conflict"];

/** Commit authors, rotated per commit so the log shows diverse people. */
const AUTHORS = [
  { name: "Avery Chen", email: "avery@zentree.dev" },
  { name: "Mina Patel", email: "mina@zentree.dev" },
  { name: "Linus Berg", email: "linus@zentree.dev" },
  { name: "Sofia Rossi", email: "sofia@zentree.dev" },
];

const AUTHORED = (i) => AUTHORS[i % AUTHORS.length];

function authorEnv(author, ms) {
  const date = gitDate(ms);
  return {
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
    GIT_COMMITTER_DATE: date,
  };
}

function initRepo(repoPath) {
  rmrf(repoPath);
  fs.mkdirSync(repoPath, { recursive: true });
  git(["init", "-b", "main", "--quiet"], { cwd: repoPath });
  git(["config", "user.name", "ZenTree Fixture"], { cwd: repoPath });
  git(["config", "user.email", "fixture@zentree.dev"], { cwd: repoPath });
  git(["config", "core.autocrlf", "false"], { cwd: repoPath });
  git(["config", "commit.gpgsign", "false"], { cwd: repoPath });
  git(["config", "tag.gpgSign", "false"], { cwd: repoPath });
  git(["config", "advice.detachedHead", "false"], { cwd: repoPath });
  // No hooks: the fixture must behave exactly like a plain repository.
  git(["config", "core.hooksPath", path.join(repoPath, ".git", "qa-empty-hooks")], { cwd: repoPath });
}

/** Reload the in-memory file map from disk after a checkout/merge. */
function syncFiles(repoPath, files) {
  for (const rel of Object.keys(files)) {
    const abs = path.join(repoPath, rel);
    if (fs.existsSync(abs)) files[rel] = fs.readFileSync(abs, "utf8");
    else delete files[rel];
  }
}

/** Append text to a fixture file (creates it when missing). */
function append(files, rel, text) {
  files[rel] = (files[rel] ?? "") + text;
}

/** Replace exactly one occurrence of `find` inside a fixture file. */
function replace(files, rel, find, repl) {
  const before = files[rel] ?? "";
  if (!before.includes(find)) throw new Error(`fixture edit failed: ${rel} does not contain ${JSON.stringify(find)}`);
  files[rel] = before.replace(find, repl);
}

/**
 * Create a small commit builder bound to one repository.
 * Every commit writes the full file map, stages everything and commits with a
 * deterministic author/date pair.
 */
function makeCommitter(repoPath, startMs, stepMs = 47 * 60 * 1000) {
  let clock = startMs;
  let index = 0;
  const commits = [];

  function writeAll(files) {
    for (const [rel, content] of Object.entries(files)) {
      writeFile(path.join(repoPath, rel), content);
    }
  }

  function commit(files, subject, body, author = AUTHORED(index)) {
    writeAll(files);
    clock += stepMs;
    const env = authorEnv(author, clock);
    git(["add", "-A"], { cwd: repoPath, env });
    const args = ["commit", "--quiet", "-m", subject];
    if (body) args.push("-m", body);
    git(args, { cwd: repoPath, env });
    const hash = gitOut(["rev-parse", "HEAD"], { cwd: repoPath });
    commits.push({ hash, subject });
    index += 1;
    return hash;
  }

  function at() {
    return clock;
  }

  function tick(ms = stepMs) {
    clock += ms;
    return clock;
  }

  return { commit, at, tick, commits };
}

// ===========================================================================
// Demo repository
// ===========================================================================

const GUIDE_V1 = `# ZenTree User Guide

ZenTree is a lightweight Git GUI built with Electron and React.
It focuses on a calm, keyboard-friendly workflow for day-to-day Git use.

## Opening a repository

Use the Open repository button on the welcome screen, or drag a folder
onto the window. The last repository is restored on the next launch.
Tabs keep several repositories one keystroke apart.

## Inspecting history

The commit graph shows every branch in a compact lane layout.
Selected commits load their changed files into the file panel on the right.
Click any file to open the unified diff, with inline hunk actions.

## Working with changes

The file panel separates unstaged and staged changes into two lists.
Stage individual files or whole hunks, then write a commit message in the
composer at the bottom of the window. Amend is one checkbox away.

## Keyboard shortcuts

Press Ctrl+K to open the command palette and Ctrl+P to jump between tabs.
F5 refreshes the current repository without losing your selection.

## Branching and merging

Double-click a local branch in the sidebar to check it out.
Right-click a commit to create a branch or tag at that point in history.
Unresolved merges are surfaced as conflict badges in the status bar.
`;

const GUIDE_V2 = `# ZenTree User Guide

ZenTree is a fast, lightweight Git GUI built with Electron and React.
It focuses on a calm, keyboard-friendly workflow for day-to-day Git use.

## Opening a repository

Use the Open repository button on the welcome screen, or drag a folder
onto the window. The last repository is restored on the next launch.
Tabs keep several repositories one keystroke apart.

## Inspecting history

The commit graph draws every branch in a compact lane layout with pill
labels. Selected commits load their changed files into the file panel.
Click any file to open the unified diff, with inline hunk actions.

## Working with changes

The file panel separates unstaged and staged changes into two lists.
Stage individual files or whole hunks, then write a commit message in the
composer at the bottom of the window. Amend is one checkbox away.

## Keyboard shortcuts

Press Ctrl+K to open the command palette and Ctrl+P to jump between tabs.
F5 refreshes the current repository without losing your selection.

## Branching and merging

Double-click a local branch in the sidebar to check it out.
Right-click a commit to create a branch or tag at that point in history.
Unresolved merges are surfaced as conflict badges in the status bar.

## Troubleshooting

If the graph looks empty, press F5 to reload the repository.
Enable Git Bash from the toolbar when a command needs a real shell.
`;

const BASE_FILES = {
  "README.md": `# ZenTree Demo Repository

A deterministic fixture repository used by the ZenTree visual QA harness.

It contains history on three branches, an annotated release tag, a stash and a
working tree with staged, unstaged, renamed and untracked changes.
`,
  ".gitignore": `node_modules/
dist/
*.log
.DS_Store
Thumbs.db
`,
  "assets/logo.txt": `✳ ZenTree
`,
  "docs/architecture.md": `# Architecture

ZenTree is split into an Electron main process and a React renderer.

## Processes

The main process owns the git adapter, the filesystem watcher and window
lifecycle. The renderer holds UI state in a small zustand store and talks to
the main process exclusively through a typed IPC bridge.

## Rendering

The commit graph is painted on two stacked canvases: a base layer with the
lanes, nodes and labels, and an overlay layer for hover and selection rings.
`,
  "docs/guide.md": GUIDE_V1,
  "src/app.ts": `import { startRenderer } from "./ui/renderer";

export interface AppOptions {
  repoPath: string;
  theme: "light" | "dark";
}

export function createApp(options: AppOptions) {
  const root = document.getElementById("root");
  if (!root) throw new Error("root element missing");
  return startRenderer(root, options);
}

export function reportStartup(mode: string) {
  return "started in " + mode + " mode";
}
`,
  "src/core/engine.ts": `export interface Lane {
  id: number;
  commit: string;
}

export function allocateLanes(total: number): Lane[] {
  const lanes: Lane[] = [];
  for (let i = 0; i < total; i += 1) {
    lanes.push({ id: i, commit: "" });
  }
  return lanes;
}

export function activeLaneCount(lanes: Lane[]): number {
  return lanes.filter((lane) => lane.commit.length > 0).length;
}
`,
  "src/core/parser.ts": `export interface ParsedLine {
  type: "context" | "addition" | "deletion";
  content: string;
}

export function parseLine(raw: string): ParsedLine {
  if (raw.startsWith("+")) return { type: "addition", content: raw.slice(1) };
  if (raw.startsWith("-")) return { type: "deletion", content: raw.slice(1) };
  return { type: "context", content: raw.slice(1) };
}

export function parseDiffBlock(raw: string): ParsedLine[] {
  return raw.split("\\n").map(parseLine);
}
`,
  "src/ui/renderer.ts": `export interface RenderTarget {
  width: number;
  height: number;
}

export function startRenderer(root: HTMLElement, options: { repoPath: string }) {
  const target: RenderTarget = { width: root.clientWidth, height: root.clientHeight };
  return { root, target, repoPath: options.repoPath };
}

export function paintBackground(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
`,
  "src/ui/theme.ts": `export interface ThemeTokens {
  background: string;
  foreground: string;
  accent: string;
}

export const LIGHT_TOKENS: ThemeTokens = {
  background: "#faf9f5",
  foreground: "#1f1e1d",
  accent: "#d97757",
};

export function readCssVars(root: HTMLElement): ThemeTokens {
  const styles = getComputedStyle(root);
  return {
    background: styles.getPropertyValue("--bg-primary"),
    foreground: styles.getPropertyValue("--text-primary"),
    accent: styles.getPropertyValue("--accent"),
  };
}
`,
  "src/utils/strings.ts": `export function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

export function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

export function joinPath(parts: string[]): string {
  return parts.filter(Boolean).join("/");
}
`,
  "tests/engine.test.ts": `import { allocateLanes, activeLaneCount } from "../src/core/engine";

describe("lane allocation", () => {
  it("creates the requested number of lanes", () => {
    expect(allocateLanes(3)).toHaveLength(3);
  });

  it("counts only populated lanes", () => {
    const lanes = allocateLanes(2);
    lanes[0].commit = "abc123";
    expect(activeLaneCount(lanes)).toBe(1);
  });
});
`,
};

function buildDemo() {
  const repoPath = path.join(FIXTURES_DIR, "demo");
  initRepo(repoPath);
  const files = { ...BASE_FILES };
  const base = Date.UTC(2025, 2, 3, 1, 0, 0); // 2025-03-03T01:00:00Z
  const c = makeCommitter(repoPath, base);

  // ---- main line (13 commits) -------------------------------------------
  c.commit(files, "chore: scaffold the demo repository", "Initial layout for the visual QA fixture.");
  append(files, "src/core/engine.ts", `
export function laneForCommit(index: number, width: number): number {
  return index % Math.max(1, width);
}
`);
  c.commit(files, "feat(graph): allocate lanes for diverging branches", "Lane assignment walks the DAG once, in commit order.");
  append(files, "src/ui/renderer.ts", `
export function drawLane(ctx: CanvasRenderingContext2D, x: number, top: number, bottom: number) {
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, bottom);
  ctx.stroke();
}
`);
  c.commit(files, "feat(ui): paint commit lanes on the canvas", null, AUTHORS[1]);
  append(files, "src/core/parser.ts", `
export function normalizeTrailingNewline(raw: string): string {
  return raw.endsWith("\\n") ? raw : raw + "\\n";
}
`);
  c.commit(files, "fix(parser): tolerate diffs without a trailing newline", null, AUTHORS[2]);
  append(files, "docs/architecture.md", `
## Diff pipeline

Raw unified diff text is parsed into hunks by a small pure function, then
highlighted per line. Word-level ranges are computed only for changed pairs.
`);
  c.commit(files, "docs: describe the rendering and diff pipeline", null, AUTHORS[3]);
  append(files, "tests/engine.test.ts", `
  it("keeps lane ids stable", () => {
    expect(allocateLanes(2)[1].id).toBe(1);
  });
`);
  c.commit(files, "test: cover empty repository layout", null, AUTHORS[1]);
  append(files, "src/utils/strings.ts", `
export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
`);
  c.commit(files, "refactor(strings): extract stable hashing helper", null, AUTHORS[0]);
  append(files, "src/ui/theme.ts", `
export function themeClassName(isDark: boolean): string {
  return isDark ? "theme-dark" : "theme-light";
}
`);
  c.commit(files, "style(theme): warm paper palette for the default theme", null, AUTHORS[2]);
  append(files, "src/app.ts", `
export function bindShortcuts(onRefresh: () => void) {
  window.addEventListener("keydown", (event) => {
    if (event.key === "F5") onRefresh();
  });
}
`);
  c.commit(files, "feat(app): wire keyboard shortcuts", null, AUTHORS[3]);
  append(files, "docs/guide.md", `
## Diff review

Hunk actions live on the right edge of each hunk header. Hover the hunk
to reveal them; stage or revert without leaving the keyboard.
`);
  c.commit(files, "docs: add keyboard shortcut guide", null, AUTHORS[1]);
  replace(files, "src/core/engine.ts", "return lanes.filter((lane) => lane.commit.length > 0).length;", "return lanes.filter((lane) => Boolean(lane.commit)).length;");
  c.commit(files, "fix(engine): clamp negative lane index", "A negative index could leak into the renderer when the log is filtered.", AUTHORS[0]);
  append(files, "src/ui/renderer.ts", `
// Text metrics are cached per font string; the cache is cleared on resize.
const measuredWidths = new Map<string, number>();
`);
  c.commit(files, "perf(renderer): cache measured text widths", null, AUTHORS[2]);
  append(files, "assets/logo.txt", "brand: warm paper\n");
  c.commit(files, "chore: bump fixture metadata", null, AUTHORS[3]);

  const mainCommits = [...c.commits];
  const c4 = mainCommits[3].hash;
  const c6 = mainCommits[5].hash;

  // ---- feature/graph-layout (5 commits) ---------------------------------
  git(["checkout", "--quiet", "-b", "feature/graph-layout", c4], { cwd: repoPath });
  syncFiles(repoPath, files);
  append(files, "src/core/engine.ts", `
export function assignLanes(commits: string[]): Map<string, number> {
  const lanes = new Map<string, number>();
  commits.forEach((hash, index) => lanes.set(hash, index % 4));
  return lanes;
}
`);
  c.commit(files, "feat(graph): assign lanes for merge commits", "Branch lanes converge when a merge commit is reached.");
  replace(files, "src/ui/renderer.ts", "ctx.fillStyle = color;", "ctx.fillStyle = color ?? \"#faf9f5\";");
  c.commit(files, "fix(renderer): fall back to the surface colour when unset", null, AUTHORS[1]);
  append(files, "src/ui/theme.ts", `
export function applyTheme(root: HTMLElement, tokens: ThemeTokens): void {
  root.style.setProperty("--bg-primary", tokens.background);
  root.style.setProperty("--text-primary", tokens.foreground);
  root.style.setProperty("--accent", tokens.accent);
}
`);
  c.commit(files, "feat(theme): apply design tokens to the document root", null, AUTHORS[2]);
  append(files, "docs/architecture.md", `
## Graph lanes

Lanes are allocated during a single pass over the commit list. Each lane waits
for the next commit expected on its branch, so merges fold lanes back together.
`);
  c.commit(files, "docs: document lane allocation", null, AUTHORS[3]);
  append(files, "tests/engine.test.ts", `
  it("assigns lanes deterministically", () => {
    expect(assignLanes(["a", "b"]).get("a")).toBe(0);
  });
`);
  c.commit(files, "test: cover deterministic lane assignment", null, AUTHORS[1]);

  // ---- fix/diff-rendering (4 commits, from c6) --------------------------
  git(["checkout", "--quiet", "main"], { cwd: repoPath });
  syncFiles(repoPath, files);
  git(["checkout", "--quiet", "-b", "fix/diff-rendering", c6], { cwd: repoPath });
  syncFiles(repoPath, files);
  replace(files, "src/core/parser.ts", 'return raw.split("\\n").map(parseLine);', 'return raw.replace(/\\r\\n/g, "\\n").split("\\n").map(parseLine);');
  c.commit(files, "fix(parser): normalise CRLF before parsing", null, AUTHORS[2]);
  append(files, "src/ui/renderer.ts", `
export function lineHeightFor(fontSize: number): number {
  return Math.round(fontSize * 1.6);
}
`);
  c.commit(files, "fix(renderer): use a consistent line height", null, AUTHORS[3]);
  append(files, "tests/engine.test.ts", `
  it("parses windows line endings", () => {
    expect(parseDiffBlock("+one\\r\\n-two\\r\\n")).toHaveLength(2);
  });
`);
  c.commit(files, "test: regression for CRLF diffs", null, AUTHORS[0]);
  append(files, "src/utils/strings.ts", `
export function quote(value: string): string {
  return '"' + value + '"';
}
`);
  c.commit(files, "refactor(strings): add quoting helper", null, AUTHORS[1]);

  // ---- merge feature into main ------------------------------------------
  // `-X ours` keeps the fixture deterministic: the tooltip/stash/sidebar only
  // need a merge commit in history, not a second conflict scenario.
  git(["checkout", "--quiet", "main"], { cwd: repoPath });
  syncFiles(repoPath, files);
  const mergeEnv = authorEnv(AUTHORS[0], c.tick(3 * 60 * 60 * 1000));
  git(["merge", "--no-ff", "--quiet", "-X", "ours", "feature/graph-layout", "-m", "Merge branch 'feature/graph-layout'", "-m", "Splits the graph engine into lane allocation and painting."], { cwd: repoPath, env: mergeEnv });
  syncFiles(repoPath, files);
  const mergeHash = gitOut(["rev-parse", "HEAD"], { cwd: repoPath });

  // ---- tags --------------------------------------------------------------
  const tagMs = c.tick(24 * 60 * 60 * 1000);
  git(["tag", "-a", "v0.1.0", c6, "-m", "Release v0.1.0"], { cwd: repoPath, env: authorEnv(AUTHORS[0], tagMs) });
  git(["tag", "-a", "v1.0.0", mergeHash, "-m", "Release v1.0.0"], { cwd: repoPath, env: authorEnv(AUTHORS[0], tagMs + 60 * 1000) });

  // ---- stash -------------------------------------------------------------
  append(files, "src/ui/renderer.ts", "// experimental minimap: draw a scaled overview in the corner\n");
  writeFile(path.join(repoPath, "src/ui/renderer.ts"), files["src/ui/renderer.ts"]);
  git(["stash", "push", "--quiet", "-m", "WIP: minimap prototype", "--", "src/ui/renderer.ts"], { cwd: repoPath, env: authorEnv(AUTHORS[2], c.tick(30 * 60 * 1000)) });
  // The stash reset renderer.ts to HEAD; restore the clean committed content.
  git(["checkout", "--quiet", "--", "src/ui/renderer.ts"], { cwd: repoPath });

  // ---- dirty working tree ------------------------------------------------
  // Unstaged: 3-hunk edit of docs/guide.md, a README section, an app.ts line,
  // and a deleted tracked file.
  writeFile(path.join(repoPath, "docs/guide.md"), GUIDE_V2);
  append(files, "README.md", `
## Local development

Run the renderer with the Vite dev server and the Electron shell in two
terminals. Fixture repositories live under \`.qa/fixtures\`.
`);
  writeFile(path.join(repoPath, "README.md"), files["README.md"]);
  append(files, "src/app.ts", `
export function reportShutdown(mode: string) {
  return "stopped in " + mode + " mode";
}
`);
  writeFile(path.join(repoPath, "src/app.ts"), files["src/app.ts"]);
  fs.rmSync(path.join(repoPath, "src/ui/theme.ts"));

  // Staged: modified file, added file and a rename.
  append(files, "src/core/parser.ts", `
export function isEmptyDiff(raw: string): boolean {
  return raw.trim().length === 0;
}
`);
  writeFile(path.join(repoPath, "src/core/parser.ts"), files["src/core/parser.ts"]);
  writeFile(path.join(repoPath, "src/features/search.ts"), `export interface SearchHit {
  hash: string;
  subject: string;
}

export function filterHits(hits: SearchHit[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return hits;
  return hits.filter((hit) => hit.subject.toLowerCase().includes(q));
}
`);
  git(["add", "src/core/parser.ts", "src/features/search.ts"], { cwd: repoPath });
  git(["mv", "src/utils/strings.ts", "src/utils/text.ts"], { cwd: repoPath });

  // Untracked files (inside tracked directories so `git status` lists them
  // individually instead of collapsing them into an untracked folder entry).
  writeFile(path.join(repoPath, "src/ui/scratchpad.ts"), `// local experiment, not committed yet
export const DRAFT_NOTE = "delete me";
`);
  writeFile(path.join(repoPath, "assets/logo-draft.txt"), "✳ draft mark\n");

  // Raw stdout: porcelain v1 status encodes worktree-only changes with a
  // leading space in column 1, which a trimmed helper would swallow.
  const status = git(["status", "--porcelain=v1"], { cwd: repoPath }).stdout;
  const lines = status.split(/\r?\n/).filter(Boolean);
  const branches = gitOut(["branch", "--list", "--format=%(refname:short)"], { cwd: repoPath }).split(/\r?\n/).filter(Boolean);
  const tags = gitOut(["tag", "--list"], { cwd: repoPath }).split(/\r?\n/).filter(Boolean);
  const stash = gitOut(["stash", "list"], { cwd: repoPath }).split(/\r?\n/).filter(Boolean);

  const expected = [
    "A  src/features/search.ts",
    "M  src/core/parser.ts",
    "R  src/utils/strings.ts -> src/utils/text.ts",
    " M README.md",
    " M docs/guide.md",
    " M src/app.ts",
    " D src/ui/theme.ts",
    "?? assets/logo-draft.txt",
    "?? src/ui/scratchpad.ts",
  ];
  for (const want of expected) {
    if (!lines.includes(want)) {
      throw new Error(`demo fixture status mismatch: expected ${JSON.stringify(want)} in\n${status}`);
    }
  }

  return {
    path: repoPath,
    head: gitOut(["rev-parse", "HEAD"], { cwd: repoPath }),
    branches,
    tags,
    stashCount: stash.length,
    commitCount: Number(gitOut(["rev-list", "--count", "HEAD"], { cwd: repoPath })),
    totalCommits: Number(gitOut(["rev-list", "--count", "--all"], { cwd: repoPath })),
    statusLines: lines,
    hasMergeCommit: gitOut(["log", "--merges", "--format=%H"], { cwd: repoPath }).split(/\r?\n/).filter(Boolean).length > 0,
  };
}

// ===========================================================================
// Conflict repository
// ===========================================================================

const CONFLICT_APP_YAML_MAIN = `app:
  name: zentree
  theme: claude
  density: comfortable
  features:
    aiPanel: true
    commandPalette: true
    minimap: false
  graph:
    laneWidth: 22
    rowHeight: 30
`;
const CONFLICT_APP_YAML_FEATURE = `app:
  name: zentree
  theme: claude-dark
  density: compact
  features:
    aiPanel: true
    commandPalette: true
    minimap: true
  graph:
    laneWidth: 24
    rowHeight: 34
`;
// The main line changes the same lines to yet another pair of values, so the
// merge is guaranteed to conflict (both sides edited the same lines).
const CONFLICT_APP_YAML_SIDE_MAIN = `app:
  name: zentree
  theme: claude-sand
  density: spacious
  features:
    aiPanel: true
    commandPalette: true
    minimap: true
  graph:
    laneWidth: 22
    rowHeight: 32
`;
const CONFLICT_SETTINGS_MAIN = `export interface Settings {
  theme: string;
  density: string;
}

export const DEFAULTS: Settings = {
  theme: "claude-dark",
  density: "compact",
};

export function normalize(input: Partial<Settings>): Settings {
  return { ...DEFAULTS, ...input };
}
`;
const CONFLICT_SETTINGS_FEATURE = `export interface Settings {
  theme: string;
  density: string;
}

export const DEFAULTS: Settings = {
  theme: "claude",
  density: "comfortable",
};

export function normalize(input: Partial<Settings>): Settings {
  return { ...DEFAULTS, ...input };
}
`;
const CONFLICT_SETTINGS_SIDE_MAIN = `export interface Settings {
  theme: string;
  density: string;
}

export const DEFAULTS: Settings = {
  theme: "claude-sand",
  density: "spacious",
};

export function normalize(input: Partial<Settings>): Settings {
  return { ...DEFAULTS, ...input };
}
`;

function buildConflict() {
  const repoPath = path.join(FIXTURES_DIR, "conflict");
  initRepo(repoPath);
  const files = {
    "README.md": "# ZenTree Conflict Fixture\n\nUsed to exercise the merge conflict UI.\n",
    "config/app.yaml": CONFLICT_APP_YAML_MAIN,
    "src/settings.ts": CONFLICT_SETTINGS_MAIN,
    "docs/operations.md": `# Operations

Read this before running a merge locally.
`,
  };
  const base = Date.UTC(2025, 1, 10, 2, 0, 0); // 2025-02-10T02:00:00Z
  const c = makeCommitter(repoPath, base, 61 * 60 * 1000);

  c.commit(files, "chore: initial application configuration", "Baseline for the merge conflict fixture.");
  append(files, "docs/operations.md", `
## Release checklist

1. Run the test suite.
2. Build the installers.
3. Publish the draft release.
`);
  c.commit(files, "docs: add release checklist", null, AUTHORS[3]);

  git(["checkout", "--quiet", "-b", "feature/ai-panel"], { cwd: repoPath });
  files["config/app.yaml"] = CONFLICT_APP_YAML_FEATURE;
  files["src/settings.ts"] = CONFLICT_SETTINGS_FEATURE;
  c.commit(files, "feat: compact AI panel with a dark default theme", "Product asked for denser controls in the AI panel.", AUTHORS[1]);
  append(files, "README.md", "\nThe AI panel can be toggled from the command palette.\n");
  c.commit(files, "docs: document the AI panel toggle", null, AUTHORS[2]);

  git(["checkout", "--quiet", "main"], { cwd: repoPath });
  files["config/app.yaml"] = CONFLICT_APP_YAML_SIDE_MAIN;
  files["src/settings.ts"] = CONFLICT_SETTINGS_SIDE_MAIN;
  c.commit(files, "feat: enable minimap and comfortable density", null, AUTHORS[0]);
  append(files, "docs/operations.md", "\nMerges must be resolved in the app, not by hand.\n");
  c.commit(files, "docs: note merge policy", null, AUTHORS[3]);

  git(["checkout", "--quiet", "feature/ai-panel"], { cwd: repoPath });
  const mergeEnv = authorEnv(AUTHORS[1], c.tick(2 * 60 * 60 * 1000));
  const merge = git(["merge", "main", "-m", "Merge branch 'main' into feature/ai-panel"], { cwd: repoPath, env: mergeEnv, allowFailure: true });
  if (merge.status === 0) throw new Error("conflict fixture: merge unexpectedly succeeded");

  const unmerged = gitOut(["diff", "--name-only", "--diff-filter=U"], { cwd: repoPath }).split(/\r?\n/).filter(Boolean);
  if (unmerged.length < 1) throw new Error("conflict fixture: no unresolved merge conflicts");

  const status = git(["status", "--porcelain=v1"], { cwd: repoPath }).stdout;
  const hasMergeHead = (() => {
    const res = git(["rev-parse", "-q", "--verify", "MERGE_HEAD"], { cwd: repoPath, allowFailure: true });
    return res.status === 0;
  })();
  if (!hasMergeHead) throw new Error("conflict fixture: MERGE_HEAD missing");

  return {
    path: repoPath,
    head: gitOut(["rev-parse", "HEAD"], { cwd: repoPath }),
    branches: gitOut(["branch", "--list", "--format=%(refname:short)"], { cwd: repoPath }).split(/\r?\n/).filter(Boolean),
    unmerged,
    hasMergeHead,
    statusLines: status.split(/\r?\n/).filter(Boolean),
    commitCount: Number(gitOut(["rev-list", "--count", "HEAD"], { cwd: repoPath })),
  };
}

// ===========================================================================
// Entry point
// ===========================================================================

function main() {
  ensureQaDirs();
  const requested = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  const names = requested.length > 0 ? requested : FIXTURE_NAMES;
  for (const name of names) {
    if (!FIXTURE_NAMES.includes(name)) {
      console.error(`Unknown fixture "${name}". Known fixtures: ${FIXTURE_NAMES.join(", ")}`);
      process.exit(2);
    }
  }

  const startedAt = Date.now();
  const manifest = { generatedAt: new Date().toISOString(), repos: {} };

  if (names.includes("demo")) {
    const demo = buildDemo();
    manifest.repos.demo = demo;
    console.log(`[demo] ${demo.commitCount} commits on HEAD (${demo.totalCommits} total), branches: ${demo.branches.join(", ")}`);
    console.log(`[demo] tags: ${demo.tags.join(", ")}; stash entries: ${demo.stashCount}; merge commit: ${demo.hasMergeCommit}`);
    console.log(`[demo] dirty entries: ${demo.statusLines.length} (${demo.statusLines.join(" | ")})`);
  }
  if (names.includes("conflict")) {
    const conflict = buildConflict();
    manifest.repos.conflict = conflict;
    console.log(`[conflict] unresolved files: ${conflict.unmerged.join(", ")}; MERGE_HEAD: ${conflict.hasMergeHead}`);
    console.log(`[conflict] status: ${conflict.statusLines.join(" | ")}`);
  }

  writeFile(path.join(FIXTURES_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Fixtures ready in ${FIXTURES_DIR} (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
}

main();
