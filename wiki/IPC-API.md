# IPC API

## Overview

All communication between the renderer (React) and main process (Node.js) goes through Electron IPC. The `preload.ts` script exposes a typed `window.gitAPI` object via `contextBridge`.

## Response Convention

All Git handlers return a unified response shape:

```typescript
{ success: boolean; data?: T; error?: string }
```

Wrapped by the `safeHandler()` utility which catches exceptions and converts them to `{ success: false, error: message }`.

## API Reference

### Repository

| Method | IPC Channel | Parameters | Returns |
|--------|-------------|-----------|---------|
| `isRepo(repoPath)` | `git:is-repo` | `string` | `boolean` |
| `openDirectory()` | `dialog:open-directory` | — | `string \| null` |

### Branches

| Method | IPC Channel | Parameters | Returns |
|--------|-------------|-----------|---------|
| `branches(repoPath)` | `git:branches` | `string` | `{ all, current, branches }` |
| `checkout(repoPath, branch)` | `git:checkout` | `string, string` | — |
| `checkoutRemote(repoPath, remoteBranch)` | `git:checkout-remote` | `string, string` | — |

### Commit Log

| Method | IPC Channel | Parameters | Returns |
|--------|-------------|-----------|---------|
| `log(repoPath, skip, maxCount)` | `git:log` | `string, number, number` | `CommitLogEntry[]` |
| `show(repoPath, hash)` | `git:show` | `string, string` | `CommitDetail` |
| `showDetail(repoPath, hash)` | `git:show-detail` | `string, string` | `string` (raw) |
| `lastMessage(repoPath)` | `git:last-message` | `string` | `string` |

### Working Directory

| Method | IPC Channel | Parameters | Returns |
|--------|-------------|-----------|---------|
| `status(repoPath)` | `git:status` | `string` | `GitStatusData` |
| `stage(repoPath, files)` | `git:stage` | `string, string[]` | — |
| `unstage(repoPath, files)` | `git:unstage` | `string, string[]` | — |
| `discard(repoPath, files)` | `git:discard` | `string, string[]` | — |
| `commit(repoPath, message, amend)` | `git:commit` | `string, string, boolean` | — |

### Diff & Hunks

| Method | IPC Channel | Parameters | Returns |
|--------|-------------|-----------|---------|
| `diffFile(repoPath, filePath, staged)` | `git:diff-file` | `string, string, boolean` | `string` (unified diff) |
| `commitFileDiff(repoPath, hash, filePath)` | `git:commit-file-diff` | `string, string, string` | `string` (unified diff) |
| `stageHunk(repoPath, patchContent)` | `git:stage-hunk` | `string, string` | — |
| `unstageHunk(repoPath, patchContent)` | `git:unstage-hunk` | `string, string` | — |
| `revertHunk(repoPath, patchContent)` | `git:revert-hunk` | `string, string` | — |

### Remote Operations

| Method | IPC Channel | Parameters | Returns |
|--------|-------------|-----------|---------|
| `fetch(repoPath)` | `git:fetch` | `string` | — |
| `pull(repoPath)` | `git:pull` | `string` | — |
| `push(repoPath)` | `git:push` | `string` | — |

### Configuration

| Method | IPC Channel | Parameters | Returns |
|--------|-------------|-----------|---------|
| `getConfig(repoPath)` | `git:get-config` | `string` | `{ userName, userEmail }` |
| `setConfig(repoPath, key, value)` | `git:set-config` | `string, string, string` | — |
| `getSettings()` | `settings:get-all` | — | `Record<string, any>` |
| `setSetting(key, value)` | `settings:set` | `string, any` | — |

### Window Controls

| Method | IPC Channel | Parameters | Returns |
|--------|-------------|-----------|---------|
| `minimizeWindow()` | `window:minimize` | — | `void` |
| `maximizeWindow()` | `window:maximize` | — | `void` (toggles) |
| `closeWindow()` | `window:close` | — | `void` |
| `isMaximized()` | `window:is-maximized` | — | `boolean` |

### Advanced Git Operations

| Method | IPC Channel | Parameters | Returns |
|--------|-------------|-----------|---------|
| `clone(url, destPath, branch?)` | `git:clone` | `string, string, string?` | `string` (path) |
| `fileHistory(repoPath, filePath, maxCount?)` | `git:file-history` | `string, string, number?` | `FileHistoryEntry[]` |
| `blame(repoPath, filePath, hash?)` | `git:blame` | `string, string, string?` | `BlameLine[]` |
| `revertCommit(repoPath, hash)` | `git:revert` | `string, string` | - |
| `compare(repoPath, fromRef, toRef)` | `git:compare` | `string, string, string` | `CompareResult` |
| `compareFileDiff(repoPath, fromRef, toRef, filePath)` | `git:compare-file-diff` | `string, string, string, string` | `string` (diff) |
| `cherryPick(repoPath, hash)` | `git:cherry-pick` | `string, string` | - |
| `rebase(repoPath, upstream)` | `git:rebase` | `string, string` | - |
| `rebaseAbort(repoPath)` | `git:rebase-abort` | `string` | - |
| `tags(repoPath)` | `git:tags` | `string` | `TagInfo[]` |
| `createTag(repoPath, name, ref, message?)` | `git:create-tag` | `string, string, string, string?` | - |
| `deleteTag(repoPath, name)` | `git:delete-tag` | `string, string` | - |
| `remotes(repoPath)` | `git:remotes` | `string` | `RemoteInfo[]` |
| `addRemote(repoPath, name, url)` | `git:add-remote` | `string, string, string` | - |
| `removeRemote(repoPath, name)` | `git:remove-remote` | `string, string` | - |
| `setRemoteUrl(repoPath, name, url)` | `git:set-remote-url` | `string, string, string` | - |
| `hostingUrl(repoPath, ref?)` | `git:hosting-url` | `string, string?` | `string \| null` |
| `readGitignore(repoPath)` | `git:read-gitignore` | `string` | `string` |
| `writeGitignore(repoPath, content)` | `git:write-gitignore` | `string, string` | - |
| `mergetool(repoPath, filePath?)` | `git:mergetool` | `string, string?` | - |
| `openExternal(url)` | `shell:open-external` | `string` | - |

### Updates

| Method | IPC Channel | Parameters | Returns |
|--------|-------------|-----------|---------|
| `getUpdateState()` | `update:get-state` | — | `UpdateState` |
| `checkForUpdates()` | `update:check` | — | `UpdateState` |
| `downloadUpdate()` | `update:download` | — | `UpdateState` |
| `installUpdate()` | `update:install` | — | `{ success }` |
| `onUpdateEvent(cb)` | `update:event` | — | unsubscribe fn |

`UpdateState` is `{ phase, currentVersion, version?, releaseNotes?, progress?, error?, reason? }` where `phase` is one of `idle | checking | available | not-available | downloading | downloaded | error | unsupported`. The main process broadcasts every state change on `update:event`; the renderer subscribes in Settings > About.
### Shell

| Method | IPC Channel | Parameters | Returns |
|--------|-------------|-----------|---------|
| `openGitBash(repoPath)` | `shell:open-git-bash` | `string` | `string` |

## Hunk Patch Mechanism

Hunk-level operations work by:
1. Renderer builds a minimal unified diff patch for the target hunk
2. Patch content is sent to main process via IPC
3. Main writes patch to a temp file (`os.tmpdir()/zentree-*.patch`)
4. Executes `git apply` with appropriate flags
5. Deletes temp file in a `finally` block

```
stageHunk   → git apply --cached <patch>
unstageHunk → git apply --cached --reverse <patch>
revertHunk  → git apply --reverse <patch>
```

## Git Binary Resolution

The `getGit(repoPath)` factory reads `settings.gitPath` (default: `"git"`) and passes it as the `binary` option to `simple-git`. This allows users to specify a custom Git installation path.

## Git Bash Discovery (4-Tier)

`shell:open-git-bash` uses a cascading discovery strategy:

1. **Tier 1:** Derive from user-configured `gitPath` (replace `git.exe` → `git-bash.exe`)
2. **Tier 2:** Hardcoded common paths + environment variables
3. **Tier 3:** `git --exec-path` relative traversal
4. **Tier 4:** Scan `Program Files` directories
