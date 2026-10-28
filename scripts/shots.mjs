#!/usr/bin/env node
// ZenTree visual QA screenshot matrix.
//
//   node scripts/shots.mjs --label baseline
//   node scripts/shots.mjs --label baseline --theme claude-dark
//   node scripts/shots.mjs --label quick --only 01-main,02-graph-tooltip
//   node scripts/shots.mjs --label min --groups min
//
// The script launches the BUILT app (dist/ + dist-electron/ via
// `npm.cmd run build`) with an isolated profile per launch, drives every screen
// with real UI interaction (clicks / keyboard), screenshots the result into
// `.qa/shots/<label>/<theme>/`, records layout + theme measurements, and fails
// (exit 1) on uncaught renderer errors, failed requests, crashes or serious
// main-process errors.
//
// Screens per theme: main view, graph hover tooltip, graph context menu, file
// tree/plain views, staged list, diff with hunk actions, focused commit bar,
// selected commit + commit diff, settings/appearance, command palette, tab
// picker, compare + results, date picker, repo groups dialog, interactive
// rebase dialog, welcome (empty profile), clone dialog, 900x600 minimum-size
// main + settings, and the merge-conflict main view + merge panel.

import fs from "node:fs";
import path from "node:path";
import {
  THEME_PRESETS, buildProfileSettings, captureFailure, classifyDiagnostics, clickFirst,
  clearHover, collectLayout, collectThemeInfo, describeBuild, dismissMenus, dismissOverlays,
  ensureFixtures, fixturePath, fixtureRepos, formatDiagnostics, getGraphCanvasTexts, launchApp,
  measureClipping, measureGraphCanvas, parseArgs, pickGraphNode, pickGraphNodeAtRow,
  profileDirFor, readFixtureManifest, relToRoot, settle, shot, shotsDirFor, slugify,
  waitForBranchLabels, waitMainReady, writeJson, writeProfile,
} from "./lib/harness.mjs";

const HELP = `
ZenTree visual QA screenshot matrix

Usage:
  node scripts/shots.mjs [options]

Options:
  --label <name>        Output folder under .qa/shots/<label>/ (default: run)
  --theme <preset>      claude | claude-dark | claude-code | claude-sand (default: claude)
  --fixture <name>      demo | conflict (repository opened by the main group, default: demo)
  --width <px>          Window width for main/welcome/conflict groups (default: 1400)
  --height <px>         Window height (default: 900)
  --min-width <px>      Width of the minimum-size group (default: 900)
  --min-height <px>     Height of the minimum-size group (default: 600)
  --groups <list>       Comma list of groups: main,welcome,min,conflict (default: all)
  --only <list>         Comma list of scenario-name substrings to run (filters inside groups)
  --refresh-fixture     Recreate fixture repositories before the run
  --help                Show this help

Examples:
  node scripts/shots.mjs --label baseline
  node scripts/shots.mjs --label baseline --theme claude-dark --only 01-main,02-graph-tooltip
  node scripts/shots.mjs --label acceptance --groups main,welcome --width 900 --height 600

Outputs per theme run:
  .qa/shots/<label>/<theme>/*.png            screenshots
  .qa/shots/<label>/<theme>/manifest.json    scenarios, measurements, diagnostics
  .qa/shots/<label>/<theme>/layout-*.json    layout/overflow measurements
  .qa/shots/<label>/<theme>/theme-*.json     applied CSS variables and font checks
  .qa/profiles/<...>/                        isolated Electron userData profiles

Exit code is non-zero when a scenario fails or the app logs uncaught errors,
failed requests, renderer crashes or serious main-process errors.
`;

/** Wait for a locator and click it (visible-state timeout first). */
async function clickLocator(locator, what, { timeout = 10000 } = {}) {
  try {
    await locator.first().waitFor({ state: "visible", timeout });
    await locator.first().click({ timeout });
  } catch (error) {
    throw new Error(`could not click ${what}: ${error.message.split("\n")[0]}`);
  }
}

async function waitVisible(win, selector, what, { timeout = 12000 } = {}) {
  try {
    await win.locator(selector).first().waitFor({ state: "visible", timeout });
  } catch (error) {
    throw new Error(`timed out waiting for ${what ?? selector}: ${error.message.split("\n")[0]}`);
  }
}

async function waitHidden(win, selector, what, { timeout = 8000 } = {}) {
  try {
    await win.locator(selector).first().waitFor({ state: "hidden", timeout });
  } catch (error) {
    throw new Error(`timed out waiting for ${what ?? selector} to close: ${error.message.split("\n")[0]}`);
  }
}

async function count(win, selector) {
  return win.locator(selector).count();
}

/** Guard: these captures expect the working-tree file panel, not a commit. */
async function assertWorkingTree(win, context) {
  if ((await count(win, ".file-panel .commit-actions")) > 0) {
    throw new Error(`unexpected commit selection: ${context} expects the working-tree file panel`);
  }
}

/** Layout snapshot writer for the scenario currently running (set by runGroup). */
let activeLayoutSaver = null;
async function saveLayout(name) {
  if (!activeLayoutSaver) throw new Error("no active layout saver (runGroup not initialised)");
  return activeLayoutSaver(name);
}

/** Screenshot scenario definition list for the main demo repository. */
function demoScenarios() {
  return [
    {
      name: "01-main",
      async run({ win, capture, instrumented }) {
        if (instrumented) {
          // Spec §4.5: branch refs must be painted as pills on the graph canvas.
          const labels = await waitForBranchLabels(win, { timeout: 12000 });
          if (labels.length === 0) {
            throw new Error("branch pill labels are not painted on the commit graph (branchRefs key mismatch?)");
          }
        }
        await capture("01-main");
        return instrumented
          ? { branchLabels: await getGraphCanvasTexts(win).then((texts) => texts.map((t) => t.text).filter((text) => /^(?:main|feature\/[\w.-]+|fix\/[\w.-]+|remotes\/[\w./-]+)$/.test(text))) }
          : null;
      },
    },
    {
      name: "02-graph-tooltip",
      async run({ win, capture }) {
        const point = await pickGraphNode(win);
        await waitVisible(win, ".graph-tooltip", "graph hover tooltip");
        const clipping = await measureClipping(win, ".graph-tooltip", ".graph-container");
        await capture("02-graph-tooltip");
        await clearHover(win);
        await waitHidden(win, ".graph-tooltip", "graph hover tooltip").catch(() => {});
        if (clipping?.isClipped) {
          throw new Error(
            `graph hover tooltip is clipped by .graph-container (top clipped ${clipping.clippedTopPx}px, ` +
            `bottom clipped ${clipping.clippedBottomPx}px; tooltip ${JSON.stringify(clipping.child)} vs container ${JSON.stringify(clipping.ancestor)})`,
          );
        }
        return { point, clipping };
      },
    },
    {
      name: "03-file-tree",
      async run({ win, capture }) {
        await assertWorkingTree(win, "file tree");
        // Default FilePanel state is the directory tree.
        await waitVisible(win, ".file-panel .file-item", "file rows");
        const treeDirs = await count(win, ".file-panel .tree-dir");
        await capture("03-file-tree");
        await clickLocator(
          win.locator('.file-panel [title="Flat view"]').or(win.locator(".file-panel .file-action-btn").filter({ hasText: "☰" })),
          "file panel flat-view toggle",
        );
        await settle(win, 200);
        await capture("04-file-flat");
        await clickLocator(
          win.locator('.file-panel [title="Tree view"]').or(win.locator(".file-panel .file-action-btn").filter({ hasText: "◄" })),
          "file panel tree-view toggle",
        );
        await settle(win, 150);
        return { treeDirs };
      },
    },
    {
      name: "05-staged-files",
      async run({ win, capture }) {
        await assertWorkingTree(win, "staged files");
        const stagedTab = win.locator(".file-panel .file-tab").filter({ hasText: /^\s*Staged/ }).first();
        await clickLocator(stagedTab, "staged files tab");
        await settle(win, 250);
        const stagedRows = await count(win, ".file-panel .file-item");
        if (stagedRows < 1) throw new Error("staged tab shows no files (fixture should stage 3 entries)");
        const stagedStatuses = await win.locator(".file-panel .file-item .file-status").allTextContents();
        await capture("05-staged-files");
        const unstagedTab = win.locator(".file-panel .file-tab").filter({ hasText: /Unstaged/ }).first();
        await clickLocator(unstagedTab, "unstaged files tab");
        await settle(win, 200);
        return { stagedRows, stagedStatuses };
      },
    },
    {
      name: "06-diff-hunks",
      async run({ win, capture }) {
        await assertWorkingTree(win, "diff hunks");
        // docs/guide.md has three separate hunks plus word-level changes, so it
        // exercises hunk headers/actions, syntax tokens and word diff at once.
        const preferred = win.locator(".file-panel .file-item").filter({ has: win.locator('.file-name[title*="docs/guide.md"]') });
        let target = preferred.first();
        if ((await preferred.count()) === 0) target = win.locator(".file-panel .file-item").first();
        await clickLocator(target, "guide.md file row");
        await waitVisible(win, ".diff-viewer .diff-hunk", "diff hunks");
        const hunks = await count(win, ".diff-viewer .diff-hunk");
        const wordTokens = (await count(win, ".diff-viewer .word-add")) + (await count(win, ".diff-viewer .word-del"));
        const synTokens = await count(win, ".diff-viewer [class^='syn-']");
        // Hover a hunk header so the hover-revealed hunk action buttons show up.
        await win.locator(".diff-viewer .diff-hunk-header").first().hover().catch(() => {});
        await settle(win, 250);
        await capture("06-diff-hunks");
        const layout = await saveLayout("diff");
        const actions = await count(win, ".diff-viewer .diff-hunk-actions .diff-hunk-btn");
        if (hunks < 2) throw new Error(`expected multiple hunks in docs/guide.md, found ${hunks}`);
        return {
          hunks,
          wordTokens,
          synTokens,
          actions,
          diffPanel: layout.elements[".diff-panel"]?.rect ?? null,
          diffPanelClipped: layout.overflow.clipped.filter((entry) => entry.class.includes("diff")).length,
          file: await win.locator(".diff-file-name").first().textContent().catch(() => null),
        };
      },
    },
    {
      name: "07-commit-bar-focused",
      async run({ win, capture }) {
        await assertWorkingTree(win, "commit bar");
        // Close any open diff first so the composer is fully visible.
        if ((await count(win, ".diff-back-btn")) > 0) {
          await clickLocator(win.locator(".diff-back-btn").first(), "diff back button");
          await settle(win, 200);
        }
        const textarea = win.locator(".commit-bar textarea").first();
        await clickLocator(textarea, "commit message textarea");
        await win.keyboard.type("wip: visual QA check");
        await settle(win, 200);
        const focused = await win.evaluate(() => document.activeElement?.tagName === "TEXTAREA");
        if (!focused) throw new Error("commit textarea did not receive focus");
        await capture("07-commit-bar-focused");
        await textarea.fill("");
        await settle(win, 120);
        return { focused };
      },
    },
    {
      name: "10-graph-context-menu",
      async run({ win, capture }) {
        // Regression check: right-clicking a node must not select the commit
        // (canvasRenderer.handleMouseUp historically ignored e.button).
        const point = await pickGraphNode(win);
        const hadCommitView = (await count(win, ".file-panel .commit-actions")) > 0;
        await win.mouse.click(point.x, point.y, { button: "right" });
        await waitVisible(win, ".context-menu", "graph context menu");
        const items = await count(win, ".context-menu .context-menu-item");
        if (items < 5) throw new Error(`graph context menu has only ${items} items`);
        // React applies the selection on the next paint: wait before checking.
        await settle(win, 400);
        const commitSelectedByRightClick = (await count(win, ".file-panel .commit-actions")) > 0;
        await capture("10-graph-context-menu");
        await saveLayout("context-menu");
        await dismissMenus(win);
        await waitHidden(win, ".context-menu", "graph context menu").catch(() => {});
        if (!hadCommitView && commitSelectedByRightClick) {
          throw new Error("right-click on a graph node also selects the commit (context menu opens over the commit-detail file panel)");
        }
        return { items, commitSelectedByRightClick };
      },
    },
    {
      name: "08-commit-selected",
      async run({ win, capture }) {
        // Use the second row (a non-merge commit): `git show <merge> -- <file>`
        // returns no per-file diff, so a merge commit would render "No changes".
        const point = await pickGraphNodeAtRow(win, 1);
        await win.mouse.click(point.x, point.y, { button: "left" });
        await waitVisible(win, ".file-panel .commit-actions", "selected-commit file header");
        await win.waitForFunction(() => document.querySelectorAll(".file-panel .file-item").length > 0, null, { timeout: 15000 });
        await settle(win, 300);
        const commitFiles = await count(win, ".file-panel .file-item");
        await capture("08-commit-selected");
        await saveLayout("commit");
        await clickLocator(win.locator(".file-panel .file-item").first(), "file in selected commit");
        await waitVisible(win, ".diff-viewer .diff-hunk", "commit file diff");
        await settle(win, 200);
        await capture("09-commit-diff");
        const hunks = await count(win, ".diff-viewer .diff-hunk");
        await clickLocator(win.locator(".diff-back-btn").first(), "diff back button");
        await settle(win, 200);
        return { point, commitFiles, hunks };
      },
    },
    {
      name: "11-settings-appearance",
      async run({ win, capture }) {
        await clickLocator(win.locator('.top-bar [title="Settings"]').last(), "settings button");
        await waitVisible(win, ".settings-dialog", "settings dialog");
        await clickLocator(win.locator(".settings-tab").filter({ hasText: /^\s*Appearance\s*$/ }).first(), "appearance tab");
        await waitVisible(win, ".theme-card", "theme cards");
        const cards = await count(win, ".theme-card");
        if (cards !== 4) throw new Error(`expected 4 theme cards, found ${cards}`);
        await capture("11-settings-appearance");
        const layout = await saveLayout("settings");
        return { cards, dialog: layout.elements[".settings-dialog"]?.rect ?? null };
      },
    },
    {
      name: "11b-settings-general",
      async run({ win, capture }) {
        await dismissOverlays(win);
        await clickLocator(win.locator('.top-bar [title="Settings"]').last(), "settings button");
        await waitVisible(win, ".settings-dialog", "settings dialog");
        await clickLocator(win.locator(".settings-tab").filter({ hasText: /^\s*General\s*$/ }).first(), "general tab");
        await settle(win, 220);
        const rows = await count(win, ".settings-dialog .setting-row");
        await capture("11b-settings-general");
        await clickLocator(win.locator(".settings-close").first(), "settings dialog close");
        await waitHidden(win, ".settings-dialog", "settings dialog");
        return { rows };
      },
    },
    {
      name: "12-command-palette",
      async run({ win, capture }) {
        // Close settings if the previous scenario left it open.
        await dismissOverlays(win);
        await win.keyboard.press("Control+K");
        await waitVisible(win, ".command-palette", "command palette");
        await settle(win, 200);
        const items = await count(win, ".command-palette .palette-item");
        if (items < 3) throw new Error(`command palette shows only ${items} items`);
        await capture("12-command-palette");
        const layout = await saveLayout("palette");
        await win.keyboard.press("Escape");
        await waitHidden(win, ".command-palette", "command palette");
        return { items, palette: layout.elements[".command-palette"]?.rect ?? null };
      },
    },
    {
      name: "13-tab-picker",
      async run({ win, capture }) {
        await win.keyboard.press("Control+P");
        await waitVisible(win, ".tab-picker", "tab picker");
        await settle(win, 200);
        const items = await count(win, ".tab-picker .picker-item");
        await capture("13-tab-picker");
        await win.keyboard.press("Escape");
        await waitHidden(win, ".tab-picker", "tab picker");
        return { items };
      },
    },
    {
      name: "14-compare-dialog",
      async run({ win, capture }) {
        await clickLocator(win.locator('.top-bar [title="Compare two branches/commits"]').first(), "compare button");
        await waitVisible(win, ".settings-dialog .compare-select", "compare dialog");
        await capture("14-compare-dialog");
        // Pick a target ref and run the comparison so the file list renders.
        const selects = win.locator(".settings-dialog .compare-select");
        const values = await selects.nth(1).locator("option").evaluateAll((options) => options.map((o) => o.value));
        const target = values.find((value) => value && value !== "HEAD");
        if (!target) throw new Error("compare dialog has no selectable target ref");
        await selects.nth(1).selectOption(target);
        // The primary Compare button lives in the dialog body (not the footer).
        await clickLocator(
          win.locator(".compare-actions .settings-btn.primary").or(win.locator(".settings-footer .settings-btn.primary")),
          "compare confirm",
        );
        await waitVisible(win, ".compare-file-item, .settings-dialog .empty-state", "compare result list");
        await settle(win, 250);
        await capture("15-compare-results");
        const files = await count(win, ".compare-file-item");
        await clickLocator(win.locator(".settings-close").first(), "compare dialog close");
        await waitHidden(win, ".settings-dialog", "compare dialog");
        return { target, files };
      },
    },
    {
      name: "16-date-picker",
      async run({ win, capture }) {
        await clickLocator(win.locator(".date-picker-trigger").first(), "date picker trigger");
        await waitVisible(win, ".date-picker-pop", "date picker popover");
        await settle(win, 200);
        const cells = await count(win, ".date-picker-pop .date-picker-cell");
        await capture("16-date-picker");
        // Outside mousedown closes the popover.
        await win.mouse.click(30, 120);
        await waitHidden(win, ".date-picker-pop", "date picker popover");
        return { cells };
      },
    },
    {
      name: "17-repo-groups-dialog",
      async run({ win, capture }) {
        await clickLocator(win.locator('.top-bar [title="Batch operations across repositories"]').first(), "repo groups button");
        await waitVisible(win, ".settings-dialog", "repo groups dialog");
        await settle(win, 200);
        await capture("17-repo-groups-dialog");
        await clickLocator(win.locator(".settings-close").first(), "repo groups dialog close");
        await waitHidden(win, ".settings-dialog", "repo groups dialog");
      },
    },
    {
      name: "18-rebase-dialog",
      async run({ win, capture }) {
        const branch = win.locator(".sidebar .branch-item").filter({ hasNot: win.locator(".current") }).first();
        const rootBranch = win.locator(".sidebar .branch-item:not(.current)").first();
        const target = (await branch.count()) > 0 ? branch : rootBranch;
        await target.waitFor({ state: "visible", timeout: 10000 });
        await target.click({ button: "right" });
        await waitVisible(win, ".context-menu", "branch context menu");
        const rebaseItem = win.locator(".context-menu .context-menu-item").filter({ hasText: /Interactive rebase/ }).first();
        await clickLocator(rebaseItem, "interactive rebase menu item");
        await waitVisible(win, ".settings-dialog", "rebase dialog");
        await settle(win, 250);
        await capture("18-rebase-dialog");
        const rows = await count(win, ".settings-dialog .rebase-row");
        await clickLocator(win.locator(".settings-close").first(), "rebase dialog close");
        await waitHidden(win, ".settings-dialog", "rebase dialog");
        return { rows };
      },
    },
  ];
}

/** Scenarios for the merge-conflict repository (main view + merge panel). */
function conflictScenarios() {
  return [
    {
      name: "conflict-main",
      async run({ win, capture }) {
        const badge = await win.locator(".conflict-badge").first().textContent().catch(() => null);
        const conflictRows = await count(win, ".file-item.conflict");
        await capture("conflict-main");
        return { badge, conflictRows };
      },
    },
    {
      name: "conflict-merge-panel",
      async run({ win, capture }) {
        // File-row action buttons are hover/focus-revealed, so hover the row first.
        const conflictRow = win.locator(".file-item.conflict").first();
        await conflictRow.waitFor({ state: "visible", timeout: 12000 });
        await conflictRow.hover();
        await settle(win, 180);
        const resolveButton = win.locator(".file-item.conflict .file-action-btn").filter({ hasText: /Resolve/ }).first();
        await clickLocator(resolveButton, "resolve conflict button");
        await waitVisible(win, ".merge-dialog", "merge panel dialog");
        await waitVisible(win, ".merge-block", "merge conflict blocks");
        await settle(win, 250);
        const blocks = await count(win, ".merge-block");
        await capture("conflict-merge-panel");
        await clickLocator(win.locator(".settings-close").first(), "merge panel close");
        await waitHidden(win, ".merge-dialog", "merge panel dialog");
        return { blocks };
      },
    },
  ];
}

function welcomeScenarios() {
  return [
    {
      name: "welcome-main",
      async run({ win, capture }) {
        const buttons = await count(win, ".welcome .open-btn");
        if (buttons < 2) throw new Error(`welcome screen has ${buttons} open buttons, expected 2`);
        await capture("welcome-main");
        return { buttons };
      },
    },
    {
      name: "welcome-clone-dialog",
      async run({ win, capture }) {
        await clickLocator(win.locator(".welcome .open-btn.secondary").first(), "clone repository button");
        await waitVisible(win, ".settings-dialog", "clone dialog");
        await settle(win, 200);
        await capture("welcome-clone-dialog");
        await dismissOverlays(win);
        await waitHidden(win, ".settings-dialog", "clone dialog").catch(() => {});
      },
    },
  ];
}

function minSizeScenarios() {
  return [
    {
      name: "min-main-900x600",
      async run({ win, capture }) {
        // Hard gate: the window must be exactly 900x600 (covers profile
        // settings sanitisation / windowManager restore regressions).
        const actual = await win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
        if (actual.width !== 900 || actual.height !== 600) {
          throw new Error(`expected a 900x600 viewport, got ${actual.width}x${actual.height}`);
        }
        await capture("min-main-900x600");
        // No window-level scrolling, and the center column must contain both its
        // panels; the composer must sit below the file panel (not overlap it).
        const layout = await collectLayout(win);
        if (layout.overflow.windowHorizontal) throw new Error("window has horizontal overflow at 900x600");
        const center = layout.elements[".center-area"]?.rect ?? null;
        const filePanel = layout.elements[".file-panel"]?.rect ?? null;
        const commitBar = layout.elements[".commit-bar"]?.rect ?? null;
        const problems = [];
        if (center && filePanel && filePanel.bottom > center.bottom + 1) {
          problems.push(`file-panel bottom ${filePanel.bottom}px exceeds center-area bottom ${center.bottom}px (${(filePanel.bottom - center.bottom).toFixed(1)}px overflow)`);
        }
        if (filePanel && commitBar && commitBar.y < filePanel.bottom - 1) {
          problems.push(`commit-bar top ${commitBar.y}px overlaps file-panel bottom ${filePanel.bottom}px (${(filePanel.bottom - commitBar.y).toFixed(1)}px overlap)`);
        }
        const strayOutOfBounds = layout.overflow.outOfBounds.filter((entry) => !entry.scrollableAncestor);
        if (strayOutOfBounds.length > 0) {
          problems.push(`${strayOutOfBounds.length} element(s) outside the window with no scrollable ancestor: ${strayOutOfBounds.slice(0, 4).map((entry) => `${entry.tag}.${entry.class}`).join(", ")}`);
        }
        if (problems.length > 0) throw new Error(`900x600 layout overlaps: ${problems.join("; ")}`);
        return {
          viewport: actual,
          centerBottom: center?.bottom ?? null,
          filePanelBottom: filePanel?.bottom ?? null,
          commitBarTop: commitBar?.y ?? null,
          composerGap: filePanel && commitBar ? +(commitBar.y - filePanel.bottom).toFixed(1) : null,
          clipped: layout.overflow.clipped.length,
          outOfBounds: layout.overflow.outOfBounds.length,
          scrollDescendantOutOfBounds: layout.overflow.outOfBounds.filter((entry) => entry.scrollableAncestor).length,
          layoutViewport: layout.viewport,
        };
      },
    },
    {
      name: "min-settings-appearance",
      async run({ win, capture }) {
        await clickLocator(win.locator('.top-bar [title="Settings"]').last(), "settings button");
        await waitVisible(win, ".settings-dialog", "settings dialog");
        await clickLocator(win.locator(".settings-tab").filter({ hasText: /^\s*Appearance\s*$/ }).first(), "appearance tab");
        await waitVisible(win, ".theme-card", "theme cards");
        await settle(win, 200);
        await capture("min-settings-appearance");
        await saveLayout("min-settings");
        const fit = await win.evaluate(() => {
          const dialog = document.querySelector(".settings-dialog");
          if (!dialog) return null;
          const rect = dialog.getBoundingClientRect();
          return {
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
            viewport: { width: window.innerWidth, height: window.innerHeight },
            fits: rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1 && rect.left >= -1 && rect.top >= -1,
          };
        });
        await clickLocator(win.locator(".settings-close").first(), "settings dialog close");
        await waitHidden(win, ".settings-dialog", "settings dialog");
        if (fit && !fit.fits) {
          throw new Error(`settings dialog overflows the 900x600 window: ${JSON.stringify(fit)}`);
        }
        return { dialogFit: fit };
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Group runner
// ---------------------------------------------------------------------------

async function runGroup({ group, label, theme, fixture, width, height, scenarios, repos, tabs, readyKind, outDir, report, instrumentCanvas = false }) {
  const profileDir = profileDirFor(label, group.name, theme, fixture, width, height);
  const settings = buildProfileSettings({
    theme,
    width,
    height,
    repos,
    tabs,
    lastRepo: tabs[0] ?? null,
    repoGroups: [{ name: "Design system", repos: repos.map((repo) => repo.path) }],
  });
  writeProfile(profileDir, settings);

  const result = {
    group: group.name,
    theme,
    fixture,
    viewport: { width, height },
    profileDir: relToRoot(profileDir),
    scenarios: [],
    measurements: {},
    diagnostics: null,
  };

  let launched = null;
  try {
    console.log(`[${group.name}] launching (${theme}, ${fixture}, ${width}x${height}) ...`);
    launched = await launchApp({ profileDir, theme, width, height, fixture, group: group.name, instrumentCanvas });
    const { win } = launched;

    if (readyKind === "welcome") await waitMainReady(win, { expectRepo: false });
    else if (readyKind === "conflict") await waitMainReady(win, { expectRepo: true, conflict: true });
    else await waitMainReady(win, { expectRepo: true });

    // Objective measurements taken once the app is idle.
    const layout = await collectLayout(win);
    const themeInfo = await collectThemeInfo(win);
    const graph = await measureGraphCanvas(win);
    const canvasTexts = instrumentCanvas ? await getGraphCanvasTexts(win) : [];
    const branchLabels = instrumentCanvas
      ? canvasTexts.map((entry) => entry.text).filter((text) => /^(?:main|feature\/[\w.-]+|fix\/[\w.-]+|remotes\/[\w./-]+)$/.test(text))
      : [];
    result.measurements = {
      layout: relToRoot(writeJson(path.join(outDir, `layout-${group.name}.json`), layout)),
      theme: relToRoot(writeJson(path.join(outDir, `theme-${group.name}.json`), themeInfo)),
      graph: graph ? relToRoot(writeJson(path.join(outDir, `graph-${group.name}.json`), graph)) : null,
      windowHorizontalOverflow: layout.overflow.windowHorizontal,
      windowVerticalOverflow: layout.overflow.windowVertical,
      branchPillLabels: branchLabels,
    };
    console.log(
      `[${group.name}] ready: theme=${themeInfo.dataTheme} bg=${themeInfo.vars["--bg-primary"]} ` +
      `fonts(newsreader=${themeInfo.fontChecks?.newsreader}, mono=${themeInfo.fontChecks?.jetbrainsMono}) ` +
      `graphInk=${graph ? graph.inkRatio : "n/a"} clipped=${layout.overflow.clipped.length} oob=${layout.overflow.outOfBounds.length}`,
    );

    for (const scenario of scenarios) {
      const record = { group: group.name, name: scenario.name, status: "pass", screenshots: [], details: null };
      const capture = async (name) => {
        const file = await shot(win, outDir, name);
        record.screenshots.push(relToRoot(file));
        return file;
      };
      const saveLayoutForScenario = async (name) => {
        const layout = await collectLayout(win);
        const file = writeJson(path.join(outDir, `layout-${name}.json`), layout);
        record.layouts = [...(record.layouts ?? []), relToRoot(file)];
        return layout;
      };
      activeLayoutSaver = saveLayoutForScenario;
      const startedAt = Date.now();
      try {
        record.details = (await scenario.run({ win, app: launched.app, capture, saveLayout: saveLayoutForScenario, group: group.name, instrumented: Boolean(instrumentCanvas) })) ?? null;
        record.durationMs = Date.now() - startedAt;
        console.log(`[${group.name}] PASS ${scenario.name} (${record.screenshots.length} shot(s), ${record.durationMs}ms)`);
      } catch (error) {
        record.status = "fail";
        record.error = String(error?.message ?? error).slice(0, 3000);
        record.durationMs = Date.now() - startedAt;
        const files = await captureFailure(win, outDir, scenario.name);
        record.screenshots.push(...files.map(relToRoot));
        console.log(`[${group.name}] FAIL ${scenario.name}: ${record.error.split("\n")[0]}`);
        await dismissOverlays(win).catch(() => {});
      }
      result.scenarios.push(record);
      report.scenarios.push(record);
    }
  } catch (error) {
    const record = {
      group: group.name,
      name: `${group.name}:group`,
      status: "fail",
      error: String(error?.message ?? error).slice(0, 3000),
      screenshots: [],
    };
    result.scenarios.push(record);
    report.scenarios.push(record);
    console.log(`[${group.name}] FAIL group startup: ${record.error.split("\n")[0]}`);
  } finally {
    if (launched) {
      const classified = classifyDiagnostics(launched.diag);
      result.diagnostics = {
        ...classified,
        raw: {
          consoleErrors: launched.diag.consoleErrors.slice(0, 50),
          consoleWarnings: launched.diag.consoleWarnings.slice(0, 50),
          pageErrors: launched.diag.pageErrors.slice(0, 20),
          requestFailures: launched.diag.requestFailures.slice(0, 20),
          badResponses: launched.diag.badResponses.slice(0, 20),
          mainProcessOutput: launched.diag.mainProcessOutput.slice(-120),
        },
      };
      console.log(formatDiagnostics(group.name, classified));
      report.diagnostics.push({ group: group.name, ...classified });
      await launched.close();
    }
    activeLayoutSaver = null;
  }

  result.ok = result.scenarios.every((scenario) => scenario.status === "pass")
    && (result.diagnostics?.errors?.length ?? 0) === 0;
  report.groups.push(result);
  return result;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    defaults: {
      label: "run",
      theme: "claude",
      fixture: "demo",
      width: "1400",
      height: "900",
      "min-width": "900",
      "min-height": "600",
      groups: "main,welcome,min,conflict",
      only: "",
    },
    booleans: ["help", "refresh-fixture", "no-welcome", "no-min", "no-conflict", "no-main"],
  });
  if (args.help) {
    console.log(HELP.trim());
    return;
  }

  const label = slugify(String(args.label));
  const theme = String(args.theme);
  const fixture = String(args.fixture);
  if (!THEME_PRESETS.includes(theme)) throw new Error(`unknown --theme "${theme}" (expected ${THEME_PRESETS.join(", ")})`);
  if (!["demo", "conflict"].includes(fixture)) throw new Error(`unknown --fixture "${fixture}"`);
  const width = Number(args.width);
  const height = Number(args.height);
  const minWidth = Number(args["min-width"]);
  const minHeight = Number(args["min-height"]);
  for (const [name, value] of [["width", width], ["height", height], ["min-width", minWidth], ["min-height", minHeight]]) {
    if (!Number.isFinite(value) || value < 320) throw new Error(`invalid --${name}: ${value}`);
  }

  const groupList = new Set(
    String(args.groups)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (args.noMain) groupList.delete("main");
  if (args.noWelcome) groupList.delete("welcome");
  if (args.noMin) groupList.delete("min");
  if (args.noConflict) groupList.delete("conflict");
  for (const group of groupList) {
    if (!["main", "welcome", "min", "conflict"].includes(group)) throw new Error(`unknown --groups entry "${group}"`);
  }
  const only = String(args.only)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const scenarioFilter = (scenario) => only.length === 0 || only.some((token) => scenario.name.toLowerCase().includes(token));
  const filterScenarios = (list) => list.filter(scenarioFilter);

  const buildInfo = describeBuild();
  console.log(`[build] dist/index.html built at ${buildInfo.builtAt}; bundled fonts: ${buildInfo.fonts.length ? buildInfo.fonts.join(", ") : "MISSING"}`);
  ensureFixtures({ refresh: args.refreshFixture, names: ["demo", "conflict"] });
  const fixtures = readFixtureManifest();
  const repos = fixtureRepos();
  const outDir = shotsDirFor(label, theme);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const report = {
    label,
    theme,
    fixture,
    viewport: { width, height },
    minimumSize: { width: minWidth, height: minHeight },
    startedAt: new Date().toISOString(),
    build: buildInfo,
    fixtures: fixtures
      ? Object.fromEntries(Object.entries(fixtures.repos).map(([name, info]) => [name, {
        path: relToRoot(info.path),
        head: info.head,
        commitCount: info.commitCount,
      }]))
      : null,
    scenarios: [],
    groups: [],
    diagnostics: [],
    ok: false,
  };

  const demoPath = fixturePath("demo");
  const conflictPath = fixturePath("conflict");
  const repoList = repos.length > 0 ? repos : [
    { path: demoPath, name: "zentree-demo" },
    { path: conflictPath, name: "zentree-conflict" },
  ];
  const mainRepoPath = fixture === "conflict" ? conflictPath : demoPath;
  const mainScenarios = fixture === "conflict" ? conflictScenarios() : demoScenarios();

  const jobs = [];
  if (groupList.has("main")) {
    const scenarios = filterScenarios(mainScenarios);
    if (scenarios.length > 0) {
      jobs.push({
        group: { name: "main" },
        scenarios,
        readyKind: fixture === "conflict" ? "conflict" : "main",
        fixture,
        width,
        height,
        repos: repoList,
        tabs: [mainRepoPath],
        instrumentCanvas: fixture === "demo",
      });
    }
  }
  if (groupList.has("welcome")) {
    const scenarios = filterScenarios(welcomeScenarios());
    if (scenarios.length > 0) {
      jobs.push({ group: { name: "welcome" }, scenarios, readyKind: "welcome", fixture: "demo", width, height, repos: [], tabs: [] });
    }
  }
  if (groupList.has("min")) {
    const scenarios = filterScenarios(minSizeScenarios());
    if (scenarios.length > 0) {
      jobs.push({
        group: { name: "min" },
        scenarios,
        readyKind: "main",
        fixture: "demo",
        width: minWidth,
        height: minHeight,
        repos: repoList,
        tabs: [demoPath],
        instrumentCanvas: true,
      });
    }
  }
  if (groupList.has("conflict") && fixture !== "conflict") {
    const scenarios = filterScenarios(conflictScenarios());
    if (scenarios.length > 0) {
      jobs.push({
        group: { name: "conflict" },
        scenarios,
        readyKind: "conflict",
        fixture: "conflict",
        width,
        height,
        repos: repoList,
        tabs: [conflictPath],
      });
    }
  }

  if (jobs.length === 0) {
    console.error("no scenarios selected: check --groups / --only");
    process.exitCode = 2;
    return;
  }

  try {
    for (const job of jobs) {
      await runGroup({ ...job, label, theme, outDir, report });
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    const failedScenarios = report.scenarios.filter((scenario) => scenario.status !== "pass");
    const errorCount = report.diagnostics.reduce((sum, entry) => sum + (entry.errors?.length ?? 0), 0);
    report.ok = failedScenarios.length === 0 && errorCount === 0;
    report.summary = {
      scenarios: report.scenarios.length,
      passed: report.scenarios.length - failedScenarios.length,
      failed: failedScenarios.length,
      diagnosticErrors: errorCount,
    };
    writeJson(path.join(outDir, "manifest.json"), report);

    const lines = [];
    lines.push(`=== ZenTree shots: label=${label} theme=${theme} fixture=${fixture} ===`);
    for (const group of report.groups) {
      const passed = group.scenarios.filter((scenario) => scenario.status === "pass").length;
      const failed = group.scenarios.length - passed;
      lines.push(`[${group.group}] ${passed}/${group.scenarios.length} scenarios passed${failed ? ` (${failed} FAILED)` : ""}`);
    }
    for (const scenario of failedScenarios) {
      lines.push(`[${scenario.group}] FAIL ${scenario.name}: ${String(scenario.error).split("\n")[0]}`);
    }
    for (const diag of report.diagnostics) {
      if (diag.errors.length > 0) {
        lines.push(`[${diag.group}] ${diag.errors.length} runtime error(s) — see manifest.json`);
      }
    }
    lines.push(`screenshots: ${relToRoot(outDir)}`);
    lines.push(report.ok ? "RESULT: PASS (no failed scenarios, no uncaught errors)" : "RESULT: FAIL");
    console.log(lines.join("\n"));
    if (!report.ok) process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`shots.mjs failed: ${error?.stack ?? error}`);
  process.exitCode = 1;
});
