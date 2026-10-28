# IPC API

## Overview

Every renderer ↔ main-process call goes through Electron IPC. `electron/preload.ts` exposes a typed
`window.gitAPI` object via `contextBridge`; the shared contract lives in `src/types/index.ts`, so a
change to a channel signature is a compile error on all three sides (main, preload, renderer).

- No Node integration in the renderer, `contextIsolation` and `sandbox` are on.
- Renderer-controlled paths and URLs are validated in the main process (see [Hardening](#hardening)).
- Diagnostics: `safeHandler` logs `channel + stack` in the main process on failure.

## Response convention

Channels registered through `handle()` (all `git:*` channels, `repo:*`, `shell:*`, `update:*`) return:

```ts
{ success: boolean; data?: T; error?: string }
```

Failures never throw across IPC; `safeHandler` catches, logs and converts to
`{ success: false, error: message }`. The renderer (`gitApi()`) returns these envelopes unchanged, so
callers check `.success` instead of `try/catch`.

Window-control channels (`window:*`) are fire-and-forget and resolve to `void` / `boolean`.
`settings:get-all` resolves to the settings object; `settings:set` resolves to `{ success, error? }`.

## Channels

### Repository inspection (`git:*`, read-only)

`git:is-repo`, `git:branches`, `git:log`, `git:status`, `git:show`, `git:last-message`,
`git:log-range`, `git:get-config`, `git:get-upstream`, `git:branch-tracking`, `git:get-ongoing`,
`git:tags`, `git:remotes`, `git:submodule-list`, `git:get-commit-template`, `git:get-sign-commits`,
`git:get-diff-tool`, `git:hosting-url`, `git:read-gitignore`, `git:read-file`, `git:show-stage`,
`git:diff-file`, `git:commit-file-diff`, `git:stash-list`, `git:stash-diff`, `git:file-history`,
`git:blame`, `git:compare`, `git:compare-file-diff`, `git:scan-repos`

### Working tree

`git:stage`, `git:unstage`, `git:stage-all`, `git:unstage-all`, `git:discard`, `git:commit`,
`git:stage-hunk`, `git:unstage-hunk`, `git:revert-hunk`, `git:write-file`, `git:write-gitignore`,
`git:checkout-file`, `git:launch-diff-tool`, `git:mergetool`

### Branches, refs and remotes

`git:checkout`, `git:checkout-remote`, `git:create-branch`, `git:delete-branch`, `git:rename-branch`,
`git:set-upstream`, `git:unset-upstream`, `git:batch-checkout`, `git:merge`, `git:rebase`,
`git:rebase-abort`, `git:rebase-continue`, `git:rebase-interactive`, `git:cherry-pick`,
`git:cherry-pick-abort`, `git:cherry-pick-continue`, `git:merge-abort`, `git:merge-continue`,
`git:reset`, `git:revert`, `git:fetch`, `git:fetch-branch`, `git:pull`, `git:pull-branch`, `git:push`,
`git:push-branch`, `git:delete-remote-branch`, `git:prune-remote`, `git:create-tag`, `git:delete-tag`,
`git:add-remote`, `git:remove-remote`, `git:set-remote-url`

### Stash, submodules, config, clone

`git:stash-save`, `git:stash-pop`, `git:stash-drop`, `git:submodule-add`, `git:submodule-update`,
`git:submodule-deinit`, `git:set-config`, `git:set-commit-template`, `git:set-sign-commits`,
`git:set-diff-tool`, `git:clone`

### Repository watching

`repo:watch` starts an `fs.watch` on the repository's git metadata (HEAD/index/packed-refs/refs, with
worktree support) and streams debounced `repo:changed` events to the renderer; `repo:unwatch` stops it.

### Shell & dialogs

`shell:open-git-bash`, `shell:open-external` (http/https only), `dialog:open-directory`

### Updates

`update:get-state`, `update:check`, `update:download`, `update:install` (only valid after a download
completed) plus the `update:event` broadcast.

### Window control

`window:minimize`, `window:maximize` (toggles), `window:is-maximized`, `window:close`

### Settings

`settings:get-all`, `settings:set` — known keys are shape-validated and clamped before they are
persisted, so a renderer bug cannot store a value that breaks the next launch.

## Hardening

- **Repository path validation**: every mutating `git:*` channel calls `requireRepoPath()`, which
  requires an existing directory containing a `.git` entry (`electron/ipc.ts`).
- **Working-tree path confinement**: `GitRepository.resolveWorkingFilePath()` rejects traversal,
  absolute paths, symlink escapes and any `.git` path component (`electron/gitRepository.ts`).
- **URL allow-list**: only `http:`/`https:` URLs reach `shell.openExternal`.
- **Navigation guards**: the window denies popups and blocks navigation away from the app origin.
- **Settings hygiene**: `sanitiseSettings()` drops/clamps invalid values on load and on save, backs up
  structurally corrupt settings files and never lets a corrupt file break git operations.
