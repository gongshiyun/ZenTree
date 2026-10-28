# ZenTree 1.3.9 — Independent defect & requirement-gap review

**Reviewer:** code-reviewer (independent, read-only on source)
**Snapshot:** 2026-10-28 01:32 (UTC+8), working tree at `HEAD 9cab8e7` **plus uncommitted edits by the Lead/ui-*/qa teammates** (the tree was visibly moving during the review: theme rewrite to 4 Claude presets, IPC `openExternal` allow-list, single-instance lock, `gitRepository` discard/unborn/Git-Bash fixes, test identity fixes). Line numbers refer to that snapshot and may shift by a few lines as edits land; findings were re-verified against the files as read.
**Method:** full reads of `electron/**`, `src/application`, `src/domain`, `src/renderer`, component logic, tests and stated requirements; 4 read-only probe suites under `.qa/reviewer/` against a real `git` (see [Appendix](#appendix--reproduction)); targeted Vitest runs; `npm.cmd run typecheck` / `typecheck:main`.

**Current test state at snapshot:** `tests/gitRepository.test.ts` 82/82 ✓ (201 s), `tests/ipc.test.ts` 16/16 ✓, `tests/componentsExtra.test.tsx` + App/top-bar suites green after the UI teammate's latest edit. An earlier full run (01:18) was 454/456 with 2 failures in `tests/componentsExtra.test.tsx` caused by the in-flight theme rewrite — re-run after the UI edits they pass. `typecheck` and `typecheck:main` both pass.

**Nothing Critical was found** (no unrecoverable data-loss path in normal use). The list below is severity-ordered; H/M/L ids are referenced in the summary message to the Lead.

---

## High

### H1 — Interactive rebase sends the todo list in reverse order (rewrites history / conflicts)
- **Owner file:** `src/components/RebaseDialog.tsx:54-75` (ui-dialogs), supported by `electron/gitRepository.ts:150-162` (`logRange` returns oldest-first).
- **Evidence:**
  - `gitRepository.logRange()` = `git log <from>..<to> --reverse` → **oldest-first**. Probe P9 confirms `["c2","c3"]` for `HEAD~2..HEAD`.
  - `RebaseDialog` stores rows in that order (no reverse) but `handleStart` does `[...rows].reverse()` (line 57) before sending, i.e. it sends **newest-first** while git replays a todo list in order.
  - Probe E2 (`.qa/reviewer/rebase-editor.probe.test.ts`): sending `[pick c3, pick c2]` onto `HEAD~2` fails with `error: could not apply <c3> ... Resolve all conflicts manually` — a "pick everything" rebase turns into a conflict instead of leaving history alone. With non-overlapping edits it silently reorders the commits.
- **Impact:** every interactive rebase either inverts commit order or conflicts on commits that would replay cleanly; users are pushed into `git rebase --abort`. History-rewriting feature, high blast radius.
- **Minimal fix:** remove the `.reverse()` in `handleStart` (send rows as they are displayed, oldest-first) **or** reverse the display order and keep the current todo order — exactly one of the two must reverse. Regression test: rebase a 3-commit branch with all rows `pick` and assert `log()` order is unchanged.
- **Regression test needed:** yes (unit test around `handleStart` todo order; gitRepository-level probe already exists).

### H2 — Hunk stage/revert patches are invalid for new and deleted files (feature reachable from the UI fails)
- **Owner files:** `src/domain/diff/parser.ts:31-39` (`buildHunkPatch`, Lead), UI exposure in `src/components/DiffViewer.tsx:274-276` (ui-panels).
- **Evidence:**
  - `buildHunkPatch` always emits `diff --git a/<p> b/<p>`, `--- a/<p>`, `+++ b/<p>`. It drops the real headers that `git diff` produced: `--- /dev/null` + `new file mode` for a new file, `+++ /dev/null` + `deleted file mode` for a deleted file, and rename headers.
  - Probe P5: untracked file, UI path `buildUntrackedDiff` → `parseDiff` → `buildHunkPatch` → `stageHunk` fails with `error: new.txt: does not exist in index`.
  - Probe P7: deleted tracked file → stage? no, revert hunk → `error: gone.txt: No such file or directory` (file is not restored).
  - `DiffViewer` still renders the Stage/Revert hunk buttons for untracked files (`status === "untracked"` is not excluded) and for deleted files (`workingDir === "D"`), so both traps are one click away.
- **Impact:** two user-facing actions advertised as "hunk-level staging/unstaging/reverting" (README:11) fail on new/deleted files. Git state is unchanged (no data loss) but the feature is broken and the error is a raw git message.
- **Minimal fix:** build the patch header from the diff that was parsed instead of reconstructing it: keep `filePath + raw hunk header + header lines` and use `/dev/null` sides for add/delete; simplest robust version is to feed the *original diff* hunk (including its file header lines) to `git apply`. Queue: `parser.buildHunkPatch` signature change + `DiffViewer` must pass the raw header block.
- **Regression test needed:** yes — untracked stage, deleted revert, rename stage (real-git integration, like probe P5/P7/P6).

### H3 — All non-`file://` submodule operations are blocked by an over-restrictive `GIT_ALLOW_PROTOCOL`
- **Owner file:** `electron/gitRepository.ts:911-923` (`runGit`), used by `submoduleAdd`/`submoduleUpdate` (`:903-909`).
- **Evidence:** `env: { ...process.env, GIT_ALLOW_PROTOCOL: "file" }` **replaces** the allow-list with `file` only. Probe P3: `submoduleAdd(parent, "https://example.invalid/org/lib.git", "libs/lib")` → `fatal: transport 'https' not allowed`. Real users add https/ssh submodules; both are blocked. (The existing test `submodule-add` only uses a local bare repo, so CI is green.)
- **Impact:** submodule management claimed in Settings/CHANGELOG 1.3.4 is broken for every remote URL. Same code path for `submodule update --init` (any `.gitmodules` with https/ssh URLs fails).
- **Minimal fix:** don't override the user's protocol policy; if local paths must work, extend instead of replace: `GIT_ALLOW_PROTOCOL: process.env.GIT_ALLOW_PROTOCOL ?? "file:https:ssh:git:http"` (or simply drop the override — modern git already allows file for submodules). Regression test: `submoduleAdd` with an unreachable **https** URL must fail with a network/DNS error, not `transport 'https' not allowed` (works offline).
- **Regression test needed:** yes.

### H4 — Editor paths are unquoted for the shell git runs → merge/rebase/cherry-pick continue and reword break when `%TEMP%` contains a space
- **Owner file:** `electron/gitRepository.ts:568-583` (`runWithNoopEditor`, editor env at `:575`), `:627-664` (`rebaseInteractive` todo/reword/sequence editors).
- **Evidence:** `GIT_EDITOR` / `GIT_SEQUENCE_EDITOR` are set to raw `C:/Users/.../AppData/Local/Temp/...` paths. Git executes editors through `sh -c`, so a path containing a space is split. Probe E1 (Windows profile/temp with a space, e.g. `C:\Users\John Doe\AppData\Local\Temp`):
  - `…/tmp dir with spaces/zentree-noop-….sh: line 1: C:/Users/gongs/…/tmp: No such file or directory`
  - `error: there was a problem with the editor …` → `Merge continue failed: Command failed: git merge --continue`
  - Same mechanism affects `rebaseContinue`, `cherryPickContinue`, and **every** interactive rebase (all reword/squash execs).
- **Impact:** on machines whose Windows user name (or configured TEMP) contains a space, users cannot continue a merge/rebase/cherry-pick at all — the repo is left mid-operation. `gitRepository` also drops stderr from the surfaced message (`err.message` only), so the UI shows `Command failed: git merge --continue` without the cause.
- **Minimal fix:** quote/escape the editor path for the msys shell (single-quote it and convert backslashes: `GIT_EDITOR="'/c/Users/John Doe/.../noop.sh'"`), or pass `-c core.editor=...`; keep the script LF and `chmod`-free as now. Also include stderr in the rejected error text (`err.stderr || err.message`). Regression test: run merge-continue with `process.env.TEMP` set to a directory containing a space (works on any CI, probe E1 is the template).
- **Regression test needed:** yes.

---

## Medium

### M1 — Renderer can write/read git metadata inside a repo (`.git/config`, hooks) — contradicts the stated path confinement
- **Owner files:** `electron/gitRepository.ts:172-200` (`resolveWorkingFilePath` only rejects traversal/absolute/symlink escapes), `:237-246` (`writeWorkingFile`), used by `electron/ipc.ts:128-139`.
- **Evidence:** probe G4: `writeWorkingFile(repo, ".git/config", "[core]\n\tfsmonitor = calc\n")` succeeds, and `readWorkingFile(repo, ".git/config")` succeeds. `resolveWorkingFilePath` never rejects a `.git` path component.
- **Impact:** defense-in-depth break in the Electron trust model: any renderer-side injection/bug can rewrite `.git/config` (e.g. `core.fsmonitor`, `core.hooksPath`) or drop `.git/hooks/*`, which executes attacker code on the next commit/checkout; it can also read `.git/config` where remote URLs with embedded credentials live. AGENTS.md:49 claims "working-tree paths are confined to the repository" — metadata writes are not working-tree paths.
- **Minimal fix:** reject any path segment equal to `.git` (case-insensitive on Windows) in `resolveWorkingFilePath`, and additionally require that mutating channels (`write-file`, `write-gitignore`, `checkout-file`, hunk apply) act on a path present in `git status` (the UI only ever sends those). Regression test: `.git/config` write must throw `Invalid file path`.
- **Regression test needed:** yes.

### M2 — IPC has no argument validation and a mixed response contract; destructive channels accept any path
- **Owner file:** `electron/ipc.ts` (all channels; e.g. `:57-208`), `electron/preload.ts`.
- **Evidence:** every handler only does `String(args[n])`; there is no check that `repoPath` exists, is a repository, or is one of the user's opened repos — `git:discard`, `git:reset`, `git:delete-branch`, `git:write-gitignore`, `git:commit` etc. will act on any path whose `.git` happens to exist. A second inconsistency: `window:*`, `settings:get-all`, `dialog:open-directory`, `update:install`, `settings:set` are registered with raw `ipcMain.handle` (`:39-54`, `:224-229`, `:238`) while everything else goes through `safeHandler`; a throw inside those (e.g. `settings.set` on a corrupt file, see M8) reaches the renderer as a rejected promise, not `{success:false}`. `README:114`/wiki Architecture.md:73 claim "validation" that does not exist.
- **Impact:** (a) no least-privilege boundary between renderer and arbitrary local repositories; (b) renderer code must handle two error shapes, and store calls like `gitApi().setSetting(...)` have no `.catch` → unhandled rejections; (c) a user-typed invalid `settings.set` value persists and can crash the next launch (see L3).
- **Minimal fix:** add a `validateRepoPath()` (exists + `git rev-parse --git-dir`, optional allow-list of opened repos) used by every `git:` channel; validate primitive types (`typeof`/`Number.isInteger`/enum checks) instead of `String()`; wrap the raw handlers in `safeHandler` and keep the envelope uniform. Needs fixture/test updates → coordinate with Lead.
- **Regression test needed:** yes (ipc.test.ts).

### M3 — A failed log call poisons the cache and disables retry until something else changes
- **Owner file:** `src/application/repoStore.ts:497,515-525,336-351`.
- **Evidence:** probe S1 (mock bridge): first `refreshAll()` has `log` fail (`{success:false}`) → `entries=[]`, cached snapshot with an empty log, `lastStatusFingerprint` set from the successful status call (`:525`). Then `silentDiffRefresh()` sees the same fingerprint and short-circuits at `:348` → `api.log` is never called again (`logCalls 1 -> 1`, `logEntries` stays empty). Only F5/30 s poll/working-tree change recovers.
- **Impact:** transient git failures (index.lock, huge repo timeout, antivirus, network filesystem) leave an empty commit graph; users see "no commits" on a repo with commits until they manually refresh. Same pattern for pagination (`loadMoreCommits` catch sets `hasMoreCommits=false`, `:420-422`).
- **Minimal fix:** record per-refresh failure and don't let a partial refresh seed `lastStatusFingerprint`; have `silentDiffRefresh` retry when the last full refresh failed (`lastRefreshFailed` flag) and don't write an empty cache on log failure (keep previous entries or mark `stale`). Add a retry/backoff on the watcher path.
- **Regression test needed:** yes (store unit test mirroring probe S1).

### M4 — `reloadMeta` / `refreshOngoing` apply stale responses after a tab switch
- **Owner file:** `src/application/repoStore.ts:377-397`.
- **Evidence:** probe S2: start `reloadMeta()` for repo A (deferred `tags`), switch `currentRepo` to B, resolve A's tags → `store.tags` becomes `["tag-from-A"]` while `currentRepo === "/r/b"`. Same for `refreshOngoing` (`:390-397`) and `checkoutBranch` (`:325-335` calls `refreshAll()` with the *new* current repo after the await).
- **Impact:** after tagging/removing a remote or checking out a branch, if the user switches tabs before git answers, repo B shows repo A's tags/remotes/ongoing banner. Confusing and can lead to acting on the wrong repo.
- **Minimal fix:** capture `repo` before the awaits and drop the result if `get().currentRepo !== repo` (or write it into `repoCache[repo]` like `refreshAll` does).
- **Regression test needed:** yes.

### M5 — `compare()` mishandles renames: path is `"old => new"`, status is `M`, file diff is unusable
- **Owner files:** `electron/gitRepository.ts:822-851` (`compare`, numstat/name-status join), `src/components/CompareDialog.tsx:57-61` (opens the returned path).
- **Evidence:** probe G3: comparing two refs across a rename returns `{"path":"old.txt => new.txt","status":"M",...}`. `compareFileDiff(repo, from, to, "old.txt => new.txt")` cannot match a pathspec → empty/error diff; the Compare list shows a wrong status and a non-existent path.
- **Impact:** Compare is a documented feature (README:30); comparisons containing renames show wrong rows and clicking a row shows nothing/errors.
- **Minimal fix:** parse `--name-status -z` together with `--numstat -z` and keep `{path, fromPath}` (or run `git diff --no-renames` for the stats so paths are always concrete); extend `CompareFileStat` with `fromPath` and pass both to `compareFileDiff` like `diffFile` already does.
- **Regression test needed:** yes.

### M6 — "Stash this file" is broken for untracked files (button is shown for them)
- **Owner files:** `electron/gitRepository.ts:510-515` (`stashSave`), UI in `src/components/FilePanel.tsx:144-147,309`.
- **Evidence:** probe P11: `stashSave(repo, undefined, ["untracked.txt"])` → `error: pathspec ':(prefix:0)untracked.txt' did not match any file(s) known to git`. `FilePanel` renders the Stash button for every non-conflict row, including `status:"untracked"`.
- **Impact:** clicking Stash on a new file shows a raw git error; the file is not stashed. Documented as "Targeted stash" (CHANGELOG 1.3.4).
- **Minimal fix:** pass `-u` when any path is untracked (`git stash push -u -m … -- paths`), or hide the Stash button for untracked rows and update the UI hint. Regression test: targeted stash of an untracked file.
- **Regression test needed:** yes.

### M7 — File watcher silently does nothing for linked worktrees/submodules (`.git` is a file), and never sees working-tree edits
- **Owner file:** `electron/watcher.ts:21-35`.
- **Evidence:** targets are `path.join(repoPath, ".git")/HEAD|index|packed-refs|refs` filtered by `existsSync`; in a linked worktree/submodule `.git` is a **file** (`tests/gitRepository.test.ts:1279` even asserts that), so no target exists and `RepoWatcher.start()` installs zero watchers. Additionally only `.git` metadata is watched, so ordinary file edits are detected only by the renderer's 30 s/focus fallback (`App.tsx:161-170`) — CHANGELOG 1.3.6's "instead of blind 30s polling" overstates this for working-tree changes.
- **Impact:** incremental refresh never fires for worktree/submodule repositories (they are supported elsewhere: `validateRepo` accepts `.git` files, worktree test exists). Users of `git worktree` get stale UI.
- **Minimal fix:** resolve the git dir with `git rev-parse --git-dir` (the adapter already has `gitDir()`), watch `HEAD`/`index`/`packed-refs`/`refs` there; for worktrees also watch the common refs dir (`git rev-parse --git-common-dir`). Optionally document the 30 s working-tree fallback as intentional. Regression test: watcher fires for a commit in a linked worktree.
- **Regression test needed:** yes.

### M8 — Corrupted-but-valid settings JSON crashes settings and every git operation
- **Owner file:** `electron/settingsRepository.ts:27-56`.
- **Evidence:** probe I2: settings file containing `null` → `settings.get("gitPath")` throws `TypeError: Cannot read properties of null (reading 'gitPath')`; `set()` throws too. Because `main.ts:21` wires `new GitRepository(() => String(settings.get("gitPath") ?? ""))`, **every** git IPC call then fails with the same TypeError. `load()` only catches `JSON.parse` errors; `null`/`"text"`/`[]` are accepted as the cache.
- **Impact:** a hand-edited or partially migrated `zentree-settings.json` (or a future writer bug) bricks all git operations; also `settings:set` is not wrapped (M2) so the renderer sees a rejected promise.
- **Minimal fix:** after parse, require `parsed && typeof parsed === "object" && !Array.isArray(parsed)`, else fall back to `{}` (and optionally back up the corrupt file); clamp/validate known keys on load. Regression test: `null`/`[]`/`"x"` settings file → `get` returns undefined and `set` persists.
- **Regression test needed:** yes.

### M9 — Development URL is loaded with the full git bridge even in a packaged app
- **Owner file:** `electron/windowManager.ts:49-51` (and missing navigation/new-window guards, `:22-37`).
- **Evidence:** `if (process.env.NODE_ENV === "development" || process.argv.includes("--dev")) win.loadURL("http://localhost:5173")`. A packaged `ZenTree.exe --dev` (or a process with `NODE_ENV=development`) loads whatever is served on localhost:5173 with `preload.js` exposing the complete `window.gitAPI` (git write/discard/commit/openExternal/…). There is also no `setWindowOpenHandler`/`will-navigate` guard on the window.
- **Impact:** starting the packaged app with a stray `--dev` arg (or a launcher/IDE setting) hands a local process the app's git capabilities (write arbitrary repo files, rewrite config, open external). Security hardening of a frameless app whose renderer is otherwise well isolated (contextIsolation/sandbox/nodeIntegration off are correct).
- **Minimal fix:** gate the dev URL on `!app.isPackaged` (or a dedicated `ZENTREE_DEV_SERVER` env used only by `npm run dev`); add `win.webContents.setWindowOpenHandler(() => ({action:"deny"}))` and a `will-navigate` handler that only allows the app origin.
- **Regression test needed:** unit test can assert `loadFile` vs `loadURL` selection with `app.isPackaged` mocked (windowManager.test.ts pattern).

### M10 — Test hermeticity: identity fix landed but tests still depend on the machine's global git config
- **Owner files:** `tests/gitRepository.test.ts:24-37,556,616,707`, `tests/ipc.test.ts:47-51`, `vitest.config.ts`.
- **Evidence:**
  - The Lead's 4-failure report is explained and **fixed in the working tree**: at HEAD the three `git clone` work dirs committed without local identity (HEAD lacked `configureIdentity(work)`); current tree sets it (lines above) — empty-`HOME` run of the remote-branch suite now passes (job `pwsh-baba…`, 2/2 ✓).
  - Remaining gap: no suite isolates global/system config. There is no `setupFiles`/`globalSetup`, no `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_NOSYSTEM`/`HOME` override in `vitest.config.ts`, so a developer's `commit.gpgsign=true`, `core.hooksPath`, `init.defaultBranch`, `core.autocrlf`, `user.signingkey` can change results. The harness `HOME` (`_tools/git-home`) even carries a global identity (`user.name=ZenTree Test`) and `init.defaultBranch=main`, which can mask future regressions in exactly this area.
  - AGENTS.md:24 makes "must never rely on the machine's global git identity" an explicit project requirement.
- **Impact:** suite is green here but not reproducible on a clean CI machine/other dev box; the same class of failure the Lead hit can return.
- **Minimal fix:** add a Vitest `setupFiles`/`globalSetup` that creates a temp `HOME`/`GIT_CONFIG_GLOBAL`, sets `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`; keep local identity per repo. Document it in README's Testing section (which currently only says "git must be on PATH", `README.md:96`).
- **Regression test needed:** n/a (infrastructure), but run the full suite once with an empty `HOME` in CI.

### M11 — `typecheck` does not cover `tests/`, so test type errors bypass `npm run check`
- **Owner files:** `tsconfig.json:20` (`"include": ["src"]`), `package.json:11,19`.
- **Evidence:** `npm run typecheck` = `tsc -p tsconfig.json --noEmit` with `include:["src"]`; `npm run check` only runs that + `typecheck:main` (electron only) + vitest (esbuild transpile, no type checking). Type errors in `tests/**`, `vitest.config.ts`, `scripts/*.mjs` are never gated.
- **Impact:** test helpers/mocks can drift from the `GitAPI` contract (e.g. a renamed method) and `npm run check` still passes; the CI gate is weaker than it looks.
- **Minimal fix:** add `tsconfig.test.json` (extends base, `include:["src","tests"]`, `types:["vitest/globals"]` if globals used) and add it to `check`/`build`; reference it in `vitest` type checking via `test.typecheck` if desired.
- **Regression test needed:** n/a (build gate).

### M12 — Status fingerprint computes synchronous, potentially large file reads on the main process for every watch/poll event
- **Owner file:** `electron/gitRepository.ts:80-120`.
- **Evidence:** after `git status` + 3 raw git calls, the loop over `status.files` does `statSync`, and for every file with working-side changes **reads the whole file** (`readFileSync(fullPath)`) up to 2 MiB and feeds it to SHA-1. There is a per-file cap but no total cap and no async I/O; `silentDiffRefresh` runs this on every debounced watcher event (500 ms) and every 30 s poll (`App.tsx:160-169`, `repoStore.ts:342`).
- **Impact:** N modified files of size S ⇒ up to N×2 MiB sync reads on the Electron main thread per refresh (e.g. 100 generated/minified files = up to 200 MiB) → UI stalls, native git IPC blocked; also every refresh re-hashes unchanged content because no stat-cache memo.
- **Minimal fix:** cap total bytes (e.g. 4 MiB), hash only `size+mtime` above a threshold, memoize per path+mtime+size between refreshes, or move hashing to a worker/async `fs.promises`. Regression test: fingerprint stable across calls, bounded work (spy on readFileSync).
- **Regression test needed:** optional (unit test for the cap/memo), plus a manual perf check.

### M13 — i18n substitution only replaces the first occurrence → confirmation dialog shows a literal `{0}`
- **Owner files:** `src/i18n/index.ts:20-27`, `src/components/Sidebar.tsx:221` (ui-shell).
- **Evidence:** probe I1 (real `t()`): `t("sidebar.confirmRebase","develop","main")` → `"Rebase main onto develop? Local commits will be replayed on top of {0}."`; Sidebar's manual `.replace("{0}",branch).replace("{1}",currentBranch)` has the same defect because the en string `sidebar.confirmRebase` contains `{0}` twice (`src/i18n/en.ts:53`). en/zh key+placeholder parity is otherwise clean (406/406 keys, no mismatches — script `.qa/reviewer/i18n-parity.mjs`).
- **Impact:** the "Rebase onto…" confirmation dialog displays `{0}`. Cosmetic but user-visible, one-line fix.
- **Minimal fix:** `String.prototype.replaceAll` (Electron 36/Chromium supports it
) or `val.split(token).join(arg)`; add a unit test with a repeated placeholder.
- **Regression test needed:** yes (`tests/i18n.test.ts`).

### M14 — Fresh-machine identity: `getConfig()` throws when `user.name`/`user.email` are unset, and Settings can then write empty identity
- **Owner files:** `electron/gitRepository.ts:670-675`, `src/components/SettingsDialog.tsx:68-71,86-94`.
- **Evidence:** `git config user.name` exits 1 with no output when the key is absent (verified: `exit=1` with an empty `HOME`), and both `raw()` calls are awaited unguarded → `getConfig` rejects; the IPC envelope turns that into a silent failure, so Settings > Git Config shows empty fields with no explanation. Pressing **Save** (the footer button is present on *every* tab) calls `setConfig(repo,"user.name","")`/`user.email`, writing empty local values that override a global identity later — commits then fail with git's empty-ident error. No test covers this path (the harness always has a global identity, see M10).
- **Impact:** fresh machine / CI user without identity: the dialog looks broken; an accidental Save persists an empty identity that keeps blocking commits even after the user configures a global one.
- **Minimal fix:** read each key with `try/catch` (return `""`), and in Settings only write `user.*` when the field is non-empty and the Git tab was actually edited; return a helpful hint when both are unset. Regression test: repo without any identity → `getConfig()` resolves `{userName:"",userEmail:""}`.
- **Regression test needed:** yes.

### M15 — Canvas viewport: short graphs jump after scrolling, DPR is stale after monitor/zoom changes, and cached tab switches can keep the previous repo's scroll offset
- **Owner file:** `src/renderer/canvasRenderer.ts` (ui-panels; current line refs `:97` DPR read once, `:135-147` `setData`, `:190-202` `handleResize`, `:651-671` wheel/`minOffsetY`). The store half of C3 is `src/application/repoStore.ts:264-282` (Lead).
- **Evidence (probes C1-C3, `.qa/reviewer/canvas.probe.test.ts`, re-run green→failing on the latest tree):**
  - C1: 3-commit graph in a 600 px viewport; wheel down → `minOffsetY()` returns `min(120, 600-90-40)=120`, then the clamp `Math.min(120, Math.max(120, offsetY))` **forces `offsetY = 120`** — the short graph jumps down 120 px and can never scroll back to 0 (`PROBE C1 offsetY after scroll-down: 120`).
  - C2: `this.dpr` is captured once in the constructor (`:97`) and `handleResize` reuses it (`:194-199`); after a monitor/DPR change (or Electron zoom) the backing store stays at the old ratio (`PROBE C2 backing width: 1600 (expect 800)`), so the graph is blurry until the renderer is recreated.
  - C3: `setData` only resets the camera when the previous graph was empty (`firstLoad`, `:136-144`). Switching between two **cached** repos paints non-empty→non-empty in one synchronous `activateTab` update (`repoStore.ts:277-279`), so `CommitGraph` may never see an empty graph and keeps the old `offsetY` (`PROBE C3 offsetY after repo switch: -500`), opening the new repo scrolled into blank space.
- **Impact:** (C1) scrolling any repo with fewer commits than the viewport permanently shifts the graph and leaves a blank band; (C2) blurry text on HiDPI changes; (C3) cached tab switches can land on an empty-looking graph. All cosmetic but user-visible in the primary view.
- **Minimal fix:** (C1) `minOffsetY()` should return `Math.max(0, height - last.y*scale - 40)` when the content is shorter than the viewport (and clamp offsetY into `[minOffsetY(), 120]` in the right order); (C2) re-read `this.dpr = window.devicePixelRatio || 1` at the start of `handleResize()`; (C3) expose a `resetCamera()`/`setRepo(key)` on `GraphRenderer` and call it when the store's current repo changes (or reset the camera when `data.nodes[0]?.hash` changes).
- **Regression test needed:** yes — three assertions in `tests/canvasRenderer.test.ts` (mirror probes C1-C3).

---

## Low

| id | Finding | Evidence (file:line) | Impact / minimal fix |
|---|---|---|---|
| L1 | `parseDiff` appends a phantom empty context line for every diff that ends with `\n` | `src/domain/diff/parser.ts:24`; probe P4: a 1-hunk diff parses to an extra `{type:"context",content:"", oldLineNum:…}` | Diff view shows an extra blank line with bogus line numbers in the last hunk; the line also leaks into `buildHunkPatch` (currently tolerated by `git apply`, probe P6 passes). Fix: `if (line === "" && i === lines.length-1) continue;` (or drop trailing empty line before the loop). Add parser test. |
| L2 | `parseHostingUrl` treats an ssh URL's port as a path segment | `electron/gitRepository.ts:1041-1065`; probe P12: `ssh://git@example.com:2222/owner/repo.git` → `https://example.com/2222/owner/repo` | Wrong "open on hosting" link for port-bearing ssh remotes. Fix: strip `:port` in the `ssh://` branch / use `new URL` for ssh URLs. |
| L3 | `settings:set` accepts any key/value with no schema; invalid `windowWidth` etc. persisted and used raw at startup | `electron/ipc.ts:51-54`, `electron/settingsRepository.ts:4-13`, `electron/windowManager.ts:23-24` | A renderer bug/settings edit storing `windowWidth:"x"` or `tabs:42` breaks the next launch (BrowserWindow throws) or `initFromSettings` silently ignores. Fix: validate/normalise known keys on set and on load. |
| L4 | `findGitBash` Tier 3 interpolates the user-configured git path into a shell string via `execSync` | `electron/gitRepository.ts:713-715` | A `gitPath` containing `"`/`&` executes injected commands (settings are renderer-writable; the same setting already selects the executable, so low incremental risk) and blocks the main thread. Fix: `execFileSync(gitBin,["--exec-path"])`. |
| L5 | `openGitBash` spawns without a callback/error listener and returns "Git Bash opened" unconditionally | `electron/gitRepository.ts:734-742` | If the shell cannot start (deleted repo dir, bad path), the error is swallowed and the UI reports success. Fix: wrap in a promise, reject on spawn error, surface the message. |
| L6 | Window resize debounce is not cleared when the window closes | `electron/windowManager.ts:39-47` | Closing within 300 ms of a resize can fire `win.getBounds()` on a destroyed BrowserWindow from a timer (uncaught main-process error during quit). Fix: `win.on("closed", () => resizeTimer && clearTimeout(resizeTimer))` or `win.isDestroyed()` guard. |
| L7 | `webContents.send` is guarded only by `mainWindow?.` | `electron/main.ts:59`, `electron/ipc.ts:213` | Update/watcher events can fire between window destruction and the `"closed"` handler; `send` on a destroyed `webContents` throws. Fix: `mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()`. |
| L8 | `UpdateManager.install()` has no state guard and the build is unsigned | `electron/updateManager.ts:100-102`, `package.json:21-99` (no `win.signing`/`mac.notarize`) | `update:install` can be invoked at any phase (quit-and-install without a downloaded update); unsigned NSIS artifacts mean SmartScreen warnings and updates without publisher verification. Fix: guard `phase === "downloaded"`; decide on code-signing policy before public releases. |
| L9 | Mixed IPC response contract (raw vs `safeHandler` envelope) | `electron/ipc.ts:39-54,152,239`; `src/types/index.ts` | Renderer error handling is inconsistent (some calls reject, others return `{success:false}`); `setSetting` has no `.catch` in the store → unhandled rejections. Fix: wrap all handlers; standardise the envelope (or document exceptions in the type). |
| L10 | Set-upstream prompt parses only `remote/branch` (drops extra segments) | `src/components/Sidebar.tsx:118-127` (`split("/")`, `parts[0]`) | Typing `upstream/feature/x` sets `upstream/<branch>` instead of `upstream/feature/x`. Fix: split at the first `/` and pass remote + rest, or use `--set-upstream-to=<value>` verbatim after validating against `git branch -r`. |
| L11 | Stale async UI: graph click sets commit detail without a current-repo/hash check; Compare/Rebase loads have no cancellation | `src/components/CommitGraph.tsx:119-126`; `src/components/CompareDialog.tsx:46-55`; `src/components/RebaseDialog.tsx:27-38` | Click commit A then B quickly / switch tabs: the slower `show()` can overwrite `commitDetail` while `selectedCommit` is B (or another repo). Fix: capture repo+hash and verify `getState().currentRepo/selectedCommit` before `setCommitDetail`; cancel in Compare/Rebase with a sentinel. |
| L12 | Multi-select Delete discards only the "from" side of a rename | `src/components/FilePanel.tsx:201-208` (stores `discardPaths[0]`), `src/App.tsx:133-145` | Ctrl+click a staged rename + Delete restores the old path but leaves the new path behind (single-row discard sends both). Fix: keep the full `discardPaths` in `selectedFiles` or store file entries, not bare paths. |
| L13 | Merge panel overwrites external edits and always appends a trailing newline | `src/components/MergePanel.tsx:81-113` | `handleSave` re-reads neither disk state nor EOL/external changes; `out.join("\n") + "\n"` adds a final newline the original may not have (writeWorkingFile only fixes CRLF). Fix: re-stat/compare `workingText` before writing, preserve final-newline presence. |
| L14 | `log`/`show` never load commit bodies; tooltip `body` is dead code | `electron/gitRepository.ts:44-76,120-128` (formats have no `%b`), `src/components/CommitGraph.tsx:328-329` (renders `node.body`) | Graph/commit tooltips can never show a body. Either add `%b` (watch `LOG_SEP` collisions) or remove the render. |
| L15 | Settings contract drift: `tabs`/`repoGroups` are persisted but missing from `AppSettings` (both copies) and from the docs' stored-key list | `src/types/index.ts:277-286`, `electron/settingsRepository.ts:4-13`, `wiki/Getting-Started.md:87` | New settings keys are untyped/undocumented; easy to break on rename. Fix: add optional fields and update the wiki. |
| L16 | Coverage tooling is installed but unusable as documented | `package.json:113` (`@vitest/coverage-v8`), `vitest.config.ts` (no coverage config/script), CHANGELOG:58 claims coverage numbers | The claimed ~77 %/83 % coverage cannot be reproduced with the repo scripts. Fix: add `"test:coverage": "vitest run --coverage"` (+ thresholds) or drop the dep/claim. |
| L17 | Integration-test timeout margin is too small for the slowest git tests | `vitest.config.ts:7-8` (30 s), observed submodule test **22.4 s** and full git suite 201 s | On slower CI/Windows runners the 30 s per-test timeout can trip (`tests/gitRepository.test.ts` submodule/clone suites). Fix: raise `testTimeout` for that suite (e.g. `describe`-level 60 s) or set `testTimeout: 60000`. |
| L18 | Missing/inconsistent docs for features recently added or changed (see requirement gaps) | see next section | Documentation-only; Lead owns README/CHANGELOG/wiki. |

### Verified-fixed during this review (do **not** re-report)
- `shell:open-external` now allow-lists `http(s)` (`electron/ipc.ts:225-238`; `tests/ipc.test.ts:303-320` green) — was unvalidated at session start.
- Discard of a **staged new file** and of a **staged rename** in a repo with commits works (manual `git restore --source=HEAD --staged --worktree -- <paths>` verified; probes P1/P2 pass) — my initial suspicion was wrong; no action.
- Unborn-repo `unstage`/`unstageAll`/`discard` now branch on `hasHead()` (`electron/gitRepository.ts:283-337`); tests `unborn-*` pass.
- Theme toggle no longer references removed catppuccin presets: `TopBar.tsx:310` uses `claude`/`claude-dark`, and `initFromSettings` falls back to `DEFAULT_THEME` (`repoStore.ts:429-436`).
- Test-identity fixes for cloned work repos: `tests/gitRepository.test.ts:556,616,707` (see M10).

---

## Requirement gaps (claimed vs actual)

| # | Claim | Where claimed | Actual code | Verdict |
|---|---|---|---|---|
| R1 | "10 Color Themes — Catppuccin, Dracula, Nord, One Dark Pro, Tokyo Night, Monokai, GitHub Dark, Solarized…" | `README.md:13`, `README_zh.md:13`, `wiki/Home.md:13`, `wiki/Theming.md:5-22` | `src/domain/theme/presets.ts:37-126` now has **4** Claude presets (`claude/claude-dark/claude-code/claude-sand`); tests assert this family and explicitly assert `getThemePreset("dracula")` is `undefined` (`tests/theme.test.ts:28-34,72-74`); the new `docs/design-spec.md:29,93` specifies the 4-preset Claude family and the `claude`/`claude-dark` toggle | **Docs are stale** (Lead owns README/wiki per design-spec §5). Update README/README_zh/wiki Home/Theming to the 4-preset Claude family (or decide to restore 10 presets — but the spec says 4). |
| R2 | IPC layer does "validation" | `README.md:114`, `README_zh.md:114`, `wiki/Architecture.md:73`, `wiki/Home.md:69` | `electron/ipc.ts` only coerces with `String()`; no path/type validation (M2) | **Docs claim a property the code lacks** — either implement validation (recommended) or fix the docs. |
| R3 | `wiki/IPC-API.md` documents a channel that does not exist and misses most of the current surface | `wiki/IPC-API.md:40` (`git:show-detail`), list of channels `:19-130` | No `showDetail`/`git:show-detail` anywhere in `electron/`; the doc omits `git:batch-checkout`, `git:scan-repos`, `git:stash-*`, `git:tags/remotes/submodule-*`, `git:get-ongoing`, `git:rebase/cherry-pick/merge continue/abort`, `repo:watch/unwatch`, `git:launch-diff-tool`, `git:read/write-gitignore`, `settings:*` details etc. AGENTS.md:44 requires the wiki to be updated with every new capability | **Stale docs** (Lead). Regenerate from `preload.ts`/`ipc.ts` or add a check script. |
| R4 | Canvas renderer: drag-pan, zoom-toward-cursor, DPR-aware on monitor changes, reverse-order hit testing, constants 28/22, constructor `(canvas)` | `wiki/Canvas-Renderer.md:25-37,88-117` | Actual renderer: drag-panning **intentionally disabled** (`canvasRenderer.ts:673-678`), zoom anchored at viewport centre (`:169-176`), DPR read **once** at construction (`:97`; probe C2 / M15), hit test uses a binary-search window (`:592-639`), constants 30/22 via `src/domain/graph/layout.ts:4-7`, constructor takes **two** canvases. | **Stale docs**; update after the canvas rewrite (ui-panels owns the renderer, Lead owns wiki). |
| R5 | "Incremental refresh instead of blind 30 s polling" / "Auto Refresh — detects external changes every 30 s and on focus" | `CHANGELOG.md:69`, `README.md:35` | Watcher only sees `.git` metadata (`electron/watcher.ts:21-35`); working-tree edits are only noticed by the 30 s/focus fallback (`src/App.tsx:161-170`) and for worktrees/submodules not at all (M7) | Claim is **overstated** for working-tree changes and false for worktrees. Either broaden the watcher or reword README/CHANGELOG. |
| R6 | "Hunk-level staging/unstaging/reverting", "Three-column… file diff viewer" | `README.md:11`, `wiki/Home.md:11` | Broken for new/deleted files and exposed in the UI (H2) | Feature partially broken; fix code (H2), then docs are fine. |
| R7 | "i18n — Full English and Chinese support" | `README.md:14` | Keys/placeholders are in parity (406/406), but hard-coded English remains: canvas commit count `"${n} commits"` (`canvasRenderer.ts:305`, the `graph.commits` key at `src/i18n/en.ts:70` is unused), `"Drag to resize"` (`src/components/CommitBar.tsx:115`), English placeholders in `SettingsDialog` ("Your name", "your@email.com", "vimdiff", …), repeat-placeholder bug (M13) | Mostly complete; close the remaining hard-coded strings and M13. |
| R8 | "10,000+ commits" performance / "zoom/pan" | `README.md:9`, `wiki/Home.md:9` | Pagination 200/page, culling implemented; canvas viewport defect for short graphs (M15/probe C1) and no drag-pan (by design) | Performance claim plausible; fix M15 and reword "pan" (scroll) if needed. |
| R9 | Tests are isolated temp-repo integration tests; "verify `git --version` works" is the only prerequisite | `README.md:96`, AGENTS.md:24 | Identity fixed (M10) but global git config/hook-signing can still influence tests; no env isolation | Update Testing docs with the hermetic env setup once M10 is implemented. |
| R10 | Windows-only system requirements | `README.md:61-64` / `README_zh.md` | `package.json:14` ships a Linux target and `pack:all`; mac targets are configured in `build` (`package.json:49-96`) but README says Windows only | Decide product scope: either drop the unused linux/mac packaging or document supported platforms (release risk otherwise). |
| R11 | CHANGELOG test counts / coverage | `CHANGELOG.md:21` ("427 -> 445 tests"), `CHANGELOG.md:58` (~77 %/83 %) | Snapshot run: 456 tests (working tree has newer tests; 82 in gitRepository + 16 ipc); no coverage command/config | Update at release time; add coverage script (L16). |

---

## Test-suite / hermeticity findings (detailed)

1. **Identity hermeticity (fixed in working tree, verify it is committed).** At `HEAD` the three cloned work dirs in the remote/upstream/pull suites had no local identity; current tree adds `configureIdentity(work)` at `tests/gitRepository.test.ts:556,616,707`. Empty-`HOME` reproduction now passes. Keep `tests/ipc.test.ts:47-51` in sync.
2. **Global git config still leaks into tests (M10).** No `setupFiles`/`globalSetup` in `vitest.config.ts`; no `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_NOSYSTEM` isolation. The harness `HOME=D:\ai-code\_tools\git-home` contains `user.name`, `user.email`, `init.defaultBranch=main`, `core.autocrlf=true`, `filter.lfs.*`, which can mask failures or change file contents; `commit.gpgsign` on a dev machine would break every commit test. Add the hermetic env in one shared setup file.
3. **Timing/flakiness.**
   - `tests/watcher.test.ts` is sleep-based (`:44,57,70-72,78,91`, 800 ms waits) and the re-hook test (`:62-81`) is explicitly non-deterministic ("may emit an event on Windows") — a slow/AV-scanned temp dir can flake. Consider `vi.waitFor` with polling and a larger timeout.
   - `vitest.config.ts:7-8` 30 s per-test timeout vs observed 22.4 s for the submodule test and 201 s for `tests/gitRepository.test.ts` — raise integration timeout or document.
   - Temp-dir names in `gitRepository.test.ts` use `Math.random()`; harmless but makes failures harder to reproduce.
4. **Missing coverage for the defects above (regression-test candidates):**
   - hunk stage of an untracked file / revert of a deleted file / rename hunk (H2),
   - submodule add/update with an **https** URL (H3),
   - merge/rebase continue with a spaced `TEMP` (H4),
   - `.git/config` read/write rejection (M1),
   - compare() across a rename (M5),
   - targeted stash of an untracked file (M6),
   - watcher on a linked worktree (M7),
   - corrupt settings JSON (`null`, `[]`) (M8),
   - `getConfig` with unset identity (M14),
   - i18n repeated placeholder (M13),
   - store: retry after failed log (M3), stale `reloadMeta` after tab switch (M4),
   - canvas: short-graph wheel clamp, DPR change on resize, camera reset on repo switch (probes C1-C3),
   - windowManager: no dev-URL on packaged app, resize timer after close,
   - RebaseDialog: todo order unchanged for all-pick, squash/fixup first row validation.
5. **Weak assertions found while reading.**
   - `tests/canvasRenderer.test.ts:159-170` "scrolls with plain wheel" only asserts the zoom did not change; it never asserts `offsetY`, which is why probe C1 passes the suite while being wrong.
   - `tests/repoStore.test.ts:232-263` tests the happy fingerprint short-circuit but no failure-recovery case (probe S1 uncovered).
   - `tests/watcher.test.ts:74-81` accepts "at minimum a later change must still be observed" — a weak proxy for re-hook correctness.
   - `tests/theme.test.ts:28-34,72-74` was updated for the 4-theme family; README/wiki must follow (R1), otherwise the "documented requirement" and the test now disagree.
6. **Test/typing gate:** tests are not type-checked (M11); `vitest.config.ts` has no coverage configuration despite the dependency/claim (L16).

---

## Quick wins vs risky changes

**Quick wins the Lead can apply safely (small, localized, testable):**
1. `RebaseDialog.handleStart`: remove the `.reverse()` (H1) + reject `squash|fixup` as the first non-drop row before invoking git (probe E3).
2. `parser.parseDiff`: skip the trailing empty line (L1); make `buildHunkPatch` reuse the diff's real file headers (H2 — medium but contained).
3. `i18n/index.ts`: `replaceAll`/split-join (M13).
4. `gitRepository.getConfig`: per-key `try/catch` returning `""`; `SettingsDialog` only writes non-empty identity and only from the Git tab (M14).
5. `resolveWorkingFilePath`: reject `.git` components (M1) — small, no UI change.
6. `settingsRepository.load`: object-shape guard + backup corrupt file (M8).
7. `stashSave`: add `-u` when a path is untracked, or hide the Stash action for untracked rows (M6).
8. `runGit`: don't replace `GIT_ALLOW_PROTOCOL` (keep env or append `file`) (H3).
9. Quote `GIT_EDITOR`/`GIT_SEQUENCE_EDITOR` paths and surface stderr (H4).
10. `watcher.start`: resolve the git dir via `git rev-parse --git-dir` (M7).
11. Canvas: `minOffsetY` should clamp to `max(0, ...)` when content is shorter than the viewport; re-read DPR in `handleResize`; add `resetCamera` on repo change (probes C1-C3) — small edits in `canvasRenderer.ts` (ui-panels).
12. `windowManager`: `!app.isPackaged` guard for dev URL, `setWindowOpenHandler` deny, clear resize timer on `closed` (M9/L6); `isDestroyed()` guards for sends (L7).
13. `compare()`: use `--no-renames` (or parse `-z` name-status) so paths are concrete (M5) — UI can stay unchanged if `--no-renames` is used.
14. Docs: README/README_zh/wiki Theming/Home/Canvas-Renderer/IPC-API updates (R1-R5); add `tabs`/`repoGroups` to `AppSettings` (L15); add coverage script (L16).
15. Tests: add the regression cases listed in the Test section; add the hermetic git env setup (M10); raise integration timeout (L17); type-check tests (M11).

**Risky / needs design agreement (don't do half-way):**
- **IPC trust boundary** (M2/counterpart of M1): validating every `repoPath` and argument type changes the IPC contract and all fixtures; decide whether to allow only opened repositories, and whether to keep the raw handlers. Also decide the error-envelope policy for window/settings/dialog channels.
- **Refresh/cache semantics** (M3/M4): retry/backoff and "keep stale cache on partial failure" are product behaviours; needs a clear rule for what the graph shows while a refresh is failing.
- **Fingerprint computation** (M12): async/worker hashing or stat-based memoization changes `status()` latency/contract; benchmark first.
- **Watcher scope** (M7): watching the working tree means recursive `fs.watch` on the whole repository on Windows (permissions, huge trees, editor temp files); needs a bounded design (e.g. watch only when cheap, or keep the 30 s fallback and document).
- **MergePanel/merge safety** (L13): re-reading and 3-way re-applying on external changes is real merge design, not a one-liner.
- **Updater/release** (L8): code signing/notarization, update signature policy, and whether `--dev`-style flags may ship are release decisions.
- **Cross-platform clone path** (M9/M5/L?) and Linux/mac packaging scope (R10) need a product decision (README says Windows-only).

---

## Appendix — reproduction

Probes live in `.qa/reviewer/` (scratch, not shipped):

```powershell
$env:PATH = "D:\ai-code\_tools\git\cmd;D:\ai-code\_tools\git\bin;" + $env:PATH
$env:HOME = "D:\ai-code\_tools\git-home"
node node_modules\vitest\vitest.mjs run --config .qa/reviewer/vitest.config.ts
```

| Probe file | Tests that fail (evidence) |
|---|---|
| `.qa/reviewer/gitops.probe.test.ts` | P3 submodule https (`transport 'https' not allowed`), P4 phantom context line, P5 untracked hunk stage (`does not exist in index`), P7 deleted-file hunk revert (`No such file or directory`), P11 untracked stash (`pathspec did not match`), P12 ssh-port hosting URL. Passes: P1/P2 discard staged new/rename, P6 normal hunk, P8 getConfig with harness identity, P9 logRange oldest-first, P10 checkoutRemote. |
| `.qa/reviewer/store.probe.test.ts` | I1 i18n `{0}` leftover, I2 corrupt `null` settings throws, G3 compare rename path, G4 `.git/config` read/write allowed, S1 no retry after failed log, S2 stale `reloadMeta`. Passes: unicode filenames, log filter metacharacters. |
| `.qa/reviewer/canvas.probe.test.ts` | C1 short-graph wheel clamp (`offsetY=120`), C2 DPR change ignored (backing 1600 vs 800), C3 repo-switch camera offset kept (`-500`). |
| `.qa/reviewer/rebase-editor.probe.test.ts` | E1 merge continue with spaced `TEMP` (editor not found), E2 reversed todo order → conflict instead of no-op, E3 squash-first accepted (git error, rebase left in progress). |

Manual checks: `git restore --source=HEAD --staged --worktree -- new.txt` and staged-rename discard on a real repo both behave correctly (verified); `git config user.name` exits 1 with an empty `HOME` (M14); `childProcess.execFile()` without a callback does not crash Node 24 but silently drops the spawn error (L5); i18n parity script `.qa/reviewer/i18n-parity.mjs` reports 406/406 keys, no placeholder mismatch.
