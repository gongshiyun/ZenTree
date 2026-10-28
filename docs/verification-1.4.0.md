# ZenTree 1.4.0 — verification record

This file records the acceptance evidence for the 1.4.0 release (Claude-style redesign + defect
fixes). Everything below was executed on this machine against the delivered build.

## Gates

| Gate | Command | Result |
|---|---|---|
| Renderer types | `npm run typecheck` | pass (0 errors) |
| Main-process types | `npm run typecheck:main` | pass (0 errors) |
| Test-suite types | `npm run typecheck:test` | pass (0 errors) |
| Unit + integration tests | `npm test` | **504 / 504 pass** (30 files) |
| Production build | `npm run build` | pass (fonts hashed into `dist/assets`) |
| Visual acceptance | `node scripts/shots.mjs` + smoke | **PASS**, 16/16 main scenarios in light + dark, welcome/min/conflict suites, `claude-code`/`claude-sand` spot checks, smoke 11/11 both themes, zero console/page/network/main-process errors |
| Style coverage | `node scripts/css-coverage.mjs` | 398 classNames used / 422 defined / 0 uncovered, 0 hardcoded hex, `App.css` unused |
| Packaged app smoke | Playwright against `release/win-unpacked/ZenTree.exe` | pass: Git bridge present, repository loads, theme tokens applied, bundled fonts load, 0 console errors |
| Installer / portable metadata | PowerShell `VersionInfo` | product `ZenTree` 1.4.0 on installer, portable exe and app exe |
| Portable launch | `release/ZenTree 1.4.0.exe` | window opens (requires no `ELECTRON_RUN_AS_NODE` in the environment) |

## Artefacts

| File | Size | SHA-256 |
|---|---|---|
| `release/ZenTree Setup 1.4.0.exe` | 87,928,358 B | `D66C0B32C9736D2A45BC58E175F4C694ACC9B0C26268311FD7ADF80D8B15E455` |
| `release/ZenTree 1.4.0.exe` | 87,712,810 B | `0648522FCAAC062B60094D596A921CE16887B345A214F8AE9236830D5DD542E0` |

Auto-update metadata (`release/latest.yml`, blockmap) is generated for the GitHub release. The Windows
artefacts are not code-signed, so SmartScreen may warn on first run.

## Published release

- **Commit:** `0b7850d` — `feat: Claude-style redesign + hardened git/IPC layer (v1.4.0)`
- **Tag:** `v1.4.0` (annotated, commit `0b7850d`)
- **Release:** <https://github.com/gongshiyun/ZenTree/releases/tag/v1.4.0>
- **Assets:** `ZenTree-Setup-1.4.0.exe`, `ZenTree-1.4.0.exe`, `ZenTree-Setup-1.4.0.exe.blockmap`,
  `latest.yml`
- **Integrity:** the uploaded `latest.yml` sha512 (`3wfBVyCh…`) matches the local installer bytes and
  the downloaded metadata file is byte-identical.

## Review findings closed

The independent audit is in [`docs/review-findings.md`](review-findings.md). All High findings and the
actionable Medium/Low items were fixed with regression tests, including: interactive-rebase todo
order, hunk patches for added/deleted files, submodule https/ssh protocol allow-list, editor paths
with spaces, `.git` metadata confinement, IPC path validation, settings corruption recovery, failed-log
refresh poisoning, stale metadata after tab switch, compare renames, untracked stash, worktree
watcher, packaged dev-server guard, updater install guard, i18n placeholder substitution, missing git
identity reads, and the canvas viewport defects (short-graph clamp, stale DPR, camera reset).

Two defects found during the final visual acceptance were also fixed and re-verified: graph ref pills
were never painted (branch summary now returns full hashes) and a persisted 900×600 window height was
dropped by settings sanitisation.

## Known limitations (documented, not regressions)

- Builds are unsigned (no certificate in this environment); auto-update works but SmartScreen warns.
- Drag-panning the commit graph is intentionally not implemented; the graph scrolls vertically and
  zooms around the viewport centre.
- Working-tree edits are detected by the 30 s / window-focus fingerprint fallback; the `fs.watch`
  layer covers git metadata (including linked worktrees).
- Merge-panel conflict resolution does not re-read external edits made while the panel is open.
