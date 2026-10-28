#!/usr/bin/env node
// ZenTree interaction smoke test.
//
//   node scripts/smoke.mjs
//   node scripts/smoke.mjs --label smoke --theme claude-dark
//
// Drives one real session end to end (open repo → select commit → open diff →
// switch theme via the top-bar toggle and via Settings theme cards → open/close
// dialogs → command palette → tab picker → file tabs/tree → composer) and checks:
//   - every core surface renders
//   - no uncaught renderer errors, page errors, failed requests or renderer crash
//   - the dark theme actually applies (html[data-theme], CSS variables and
//     computed colours of the app background / status bar / text)
//
// Screenshots land in .qa/shots/<label>/<theme>/smoke-*.png, the machine report
// in .qa/shots/<label>/<theme>/smoke-report.json. Exit code 1 on any failure.

import fs from "node:fs";
import path from "node:path";
import {
  THEME_BG, buildProfileSettings, classifyDiagnostics, clearHover, clickFirst, describeBuild,
  dismissOverlays, ensureFixtures, fixturePath, fixtureRepos, formatDiagnostics, launchApp,
  parseArgs, pickGraphNodeAtRow, profileDirFor, readFixtureManifest, relToRoot, settle, shot,
  shotsDirFor, slugify, waitMainReady, writeJson, writeProfile,
} from "./lib/harness.mjs";

const HELP = `
ZenTree interaction smoke test

Usage: node scripts/smoke.mjs [options]

Options:
  --label <name>     Output folder under .qa/shots/<label>/ (default: smoke)
  --theme <preset>   Start theme: claude | claude-dark | claude-code | claude-sand (default: claude)
  --fixture <name>   Repository to open: demo | conflict (default: demo)
  --width <px>       Window width (default: 1400)
  --height <px>      Window height (default: 900)
  --help             Show this help

Exit code is non-zero when a step fails or the app logs an uncaught error.
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hexToRgb(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function parseRgb(value) {
  const match = /rgba?\(([^)]+)\)/.exec(String(value));
  if (!match) return null;
  const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const alpha = parts.length >= 4 ? parts[3] : 1;
  return { r: parts[0], g: parts[1], b: parts[2], a: alpha };
}

function luminance(rgb) {
  if (!rgb) return null;
  const channel = (c) => {
    const value = c / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

async function themeState(win) {
  return win.evaluate(() => {
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const surface = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, color: style.color, fontFamily: style.fontFamily };
    };
    return {
      dataTheme: root.getAttribute("data-theme"),
      vars: {
        bgPrimary: cs.getPropertyValue("--bg-primary").trim(),
        bgTertiary: cs.getPropertyValue("--bg-tertiary").trim(),
        textPrimary: cs.getPropertyValue("--text-primary").trim(),
        accent: cs.getPropertyValue("--accent").trim(),
      },
      surfaces: {
        app: surface(".app-layout"),
        topBar: surface(".top-bar"),
        sidebar: surface(".sidebar"),
        statusBar: surface(".status-bar"),
      },
      fonts: {
        newsreader: document.fonts.check('600 17px "Newsreader"'),
        jetbrainsMono: document.fonts.check('14px "JetBrains Mono"'),
      },
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    defaults: { label: "smoke", theme: "claude", fixture: "demo", width: "1400", height: "900" },
    booleans: ["help"],
  });
  if (args.help) {
    console.log(HELP.trim());
    return;
  }

  const label = slugify(String(args.label));
  const theme = String(args.theme);
  const fixture = String(args.fixture);
  const width = Number(args.width);
  const height = Number(args.height);

  const build = describeBuild();
  ensureFixtures({ names: ["demo"] });
  const fixtures = readFixtureManifest();
  const repos = fixtureRepos();
  const repoPath = fixturePath(fixture);
  const outDir = shotsDirFor(label, theme);
  fs.mkdirSync(outDir, { recursive: true });

  const profileDir = profileDirFor(label, "smoke", theme, fixture, width, height);
  writeProfile(
    profileDir,
    buildProfileSettings({ theme, width, height, repos, tabs: [repoPath], lastRepo: repoPath }),
  );

  const report = {
    kind: "smoke",
    label,
    theme,
    fixture,
    viewport: { width, height },
    startedAt: new Date().toISOString(),
    build,
    fixtureHead: fixtures?.repos?.[fixture]?.head ?? null,
    steps: [],
    diagnostics: null,
    ok: false,
  };

  const step = async (name, fn) => {
    const record = { name, status: "pass", details: null, screenshots: [] };
    const capture = async (screenshotName) => {
      const file = await shot(win, outDir, screenshotName);
      record.screenshots.push(relToRoot(file));
      return file;
    };
    try {
      record.details = (await fn({ win, capture })) ?? null;
      console.log(`[smoke] PASS ${name}${record.details ? ` ${JSON.stringify(record.details)}` : ""}`);
    } catch (error) {
      record.status = "fail";
      record.error = String(error?.message ?? error).slice(0, 2000);
      console.log(`[smoke] FAIL ${name}: ${record.error.split("\n")[0]}`);
      // Never let a failed step poison the following ones with a stuck overlay.
      try {
        await dismissOverlays(win);
      } catch {
        /* renderer may be gone */
      }
    }
    report.steps.push(record);
    return record.status === "pass";
  };

  let win;
  let launched;
  try {
    launched = await launchApp({ profileDir, theme, width, height, fixture, group: "smoke" });
    win = launched.win;
    await waitMainReady(win, { expectRepo: true, conflict: fixture === "conflict" });

    // ---- 1. core surfaces --------------------------------------------------
    await step("layout-surfaces", async ({ win: page, capture }) => {
      const required = [".app-layout", ".top-bar", ".tab-bar", ".sidebar", ".main-content", ".graph-container", ".file-panel", ".commit-bar", ".status-bar"];
      const missing = [];
      for (const selector of required) {
        if ((await page.locator(selector).count()) === 0) missing.push(selector);
      }
      if (missing.length > 0) throw new Error(`missing core surfaces: ${missing.join(", ")}`);
      await capture("smoke-01-main");
      return { surfaces: required.length };
    });

    // ---- 2. select a commit (second row: merge commits have no per-file diff) --
    await step("select-commit", async ({ win: page, capture }) => {
      const point = await pickGraphNodeAtRow(page, 1);
      await page.mouse.click(point.x, point.y, { button: "left" });
      await clearHover(page);
      await page.locator(".file-panel .commit-actions").first().waitFor({ state: "visible", timeout: 15000 });
      await page.waitForFunction(() => document.querySelectorAll(".file-panel .file-item").length > 0, null, { timeout: 15000 });
      const files = await page.locator(".file-panel .file-item").count();
      await capture("smoke-02-commit-selected");
      return { files };
    });

    // ---- 3. file diff with hunks -------------------------------------------
    await step("open-file-diff", async ({ win: page, capture }) => {
      await page.locator(".file-panel .file-item").first().click();
      await page.locator(".diff-viewer .diff-hunk").first().waitFor({ state: "visible", timeout: 15000 });
      const hunks = await page.locator(".diff-viewer .diff-hunk").count();
      await capture("smoke-03-commit-diff");
      const back = page.locator(".diff-back-btn").first();
      if ((await back.count()) > 0) await back.click();
      await sleep(200);
      return { hunks };
    });

    // ---- 4. theme switch via the top-bar toggle ----------------------------
    await step("theme-toggle-topbar", async ({ win: page, capture }) => {
      const before = await themeState(page);
      const toggle = page.locator('.top-bar [title="Toggle theme"]').first();
      await toggle.waitFor({ state: "visible", timeout: 10000 });
      await toggle.click();
      const expectedTheme = before.dataTheme === "dark" ? "light" : "dark";
      try {
        await page.waitForFunction((value) => document.documentElement.getAttribute("data-theme") === value, expectedTheme, { timeout: 5000 });
      } catch {
        const after = await themeState(page);
        throw new Error(
          `top-bar theme toggle did not switch to ${expectedTheme} (html[data-theme] stayed "${after.dataTheme}", ` +
          `--bg-primary=${after.vars.bgPrimary})`,
        );
      }
      await settle(page, 300);
      const after = await themeState(page);
      const expectedBg = THEME_BG[expectedTheme === "dark" ? "claude-dark" : "claude"];
      if (after.vars.bgPrimary.toLowerCase() !== expectedBg.toLowerCase()) {
        throw new Error(`theme variable mismatch: --bg-primary=${after.vars.bgPrimary}, expected ${expectedBg}`);
      }
      const appRgb = parseRgb(after.surfaces.app?.background);
      const expectedRgb = hexToRgb(expectedBg);
      if (!appRgb || !expectedRgb || appRgb.r !== expectedRgb[0] || appRgb.g !== expectedRgb[1] || appRgb.b !== expectedRgb[2]) {
        throw new Error(`.app-layout did not repaint with the theme background: ${after.surfaces.app?.background} != ${expectedBg}`);
      }
      await capture(`smoke-04-theme-${expectedTheme}`);
      // Flip back to the original theme.
      await toggle.click();
      await page.waitForFunction((value) => document.documentElement.getAttribute("data-theme") === value, before.dataTheme, { timeout: 5000 });
      return { from: before.dataTheme, to: expectedTheme };
    });

    // ---- 5. settings dialog + appearance theme cards -----------------------
    await step("settings-appearance-theme-cards", async ({ win: page, capture }) => {
      await clickFirst(page, [
        { selector: '.top-bar [title="Settings"]:last-of-type', locator: () => page.locator('.top-bar [title="Settings"]').last() },
      ], { what: "settings button" });
      await page.locator(".settings-dialog").first().waitFor({ state: "visible", timeout: 10000 });
      await clickFirst(page, [
        { selector: ".settings-tab (Appearance)", locator: () => page.locator(".settings-tab").filter({ hasText: /^\s*Appearance\s*$/ }).first() },
      ], { what: "appearance settings tab" });
      await page.locator(".theme-card").first().waitFor({ state: "visible", timeout: 10000 });
      const cards = await page.locator(".theme-card").count();
      if (cards !== 4) throw new Error(`expected 4 theme cards, found ${cards}`);
      await capture("smoke-05-settings-appearance");

      const clickThemeCard = async (labelText) => {
        const list = page.locator(".theme-card");
        const total = await list.count();
        for (let i = 0; i < total; i += 1) {
          const card = list.nth(i);
          const lines = (await card.innerText())
            .split("\n")
            .map((line) => line.replace(/[✓✔\u2713]/g, "").trim())
            .filter(Boolean);
          if (lines.includes(labelText)) {
            await card.click();
            return true;
          }
        }
        return false;
      };

      // Selecting a dark preset through Settings must repaint immediately.
      if (!(await clickThemeCard("Claude Dark"))) throw new Error('theme card "Claude Dark" not found');
      await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark", null, { timeout: 5000 });
      await settle(page, 250);
      const dark = await themeState(page);
      if (dark.vars.bgPrimary.toLowerCase() !== THEME_BG["claude-dark"]) {
        throw new Error(`settings theme card did not apply --bg-primary: ${dark.vars.bgPrimary}`);
      }
      await capture("smoke-06-settings-dark");

      // And the light preset must restore the original palette.
      if (!(await clickThemeCard("Claude"))) throw new Error('theme card "Claude" not found');
      await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "light", null, { timeout: 5000 });
      await settle(page, 200);
      const light = await themeState(page);
      if (light.vars.bgPrimary.toLowerCase() !== THEME_BG.claude) {
        throw new Error(`settings theme card did not restore light --bg-primary: ${light.vars.bgPrimary}`);
      }
      await page.locator(".settings-close").first().click();
      await page.locator(".settings-dialog").first().waitFor({ state: "hidden", timeout: 8000 });
      return { cards, dark: dark.dataTheme, light: light.dataTheme };
    });

    // ---- 6. dark theme paint quality ---------------------------------------
    await step("dark-theme-paint", async ({ win: page, capture }) => {
      // Normalise to light first (the run may have started in a dark preset).
      const initial = await themeState(page);
      if (initial.dataTheme === "dark") {
        await page.locator('.top-bar [title="Toggle theme"]').first().click();
        await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "light", null, { timeout: 6000 });
        await settle(page, 250);
      }
      // Switch to dark through the top bar, verify every major surface is dark
      // (no light leak) and text stays readable over the app background.
      await page.locator('.top-bar [title="Toggle theme"]').first().click();
      await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark", null, { timeout: 6000 }).catch(async () => {
        const current = await themeState(page);
        throw new Error(`could not enter dark mode via top bar (data-theme=${current.dataTheme})`);
      });
      await settle(page, 350);
      const state = await themeState(page);
      const expectedDark = THEME_BG["claude-dark"];
      const expectedRgb = hexToRgb(expectedDark);
      const problems = [];
      const app = state.surfaces.app;
      const appRgb = parseRgb(app?.background);
      if (!appRgb || appRgb.r !== expectedRgb[0] || appRgb.g !== expectedRgb[1] || appRgb.b !== expectedRgb[2]) {
        problems.push(`app background is ${app?.background} (expected ${expectedDark})`);
      }
      for (const surfaceName of ["topBar", "sidebar", "statusBar"]) {
        const surface = state.surfaces[surfaceName];
        if (!surface) continue;
        const rgb = parseRgb(surface.background);
        const alpha = rgb?.a ?? 0;
        if (alpha > 0.05) {
          const lum = luminance(rgb);
          if (lum !== null && lum > 0.5) problems.push(`${surfaceName} background is light in dark mode: ${surface.background}`);
        }
      }
      const textRgb = parseRgb(state.surfaces.app?.color);
      if (textRgb && luminance(textRgb) < 0.5) {
        problems.push(`text colour is too dark on the dark surface: ${state.surfaces.app?.color}`);
      }
      if (!state.fonts.newsreader) problems.push("bundled Newsreader font is not available");
      if (!state.fonts.jetbrainsMono) problems.push("bundled JetBrains Mono font is not available");
      await capture("smoke-07-dark-theme");
      // Restore light for the remaining steps.
      await page.locator('.top-bar [title="Toggle theme"]').first().click();
      if (problems.length > 0) throw new Error(`dark theme paint problems: ${problems.join("; ")}`);
      return { appBackground: app?.background, statusBarBackground: state.surfaces.statusBar?.background, fonts: state.fonts };
    });

    // ---- 7. command palette / tab picker ----------------------------------
    await step("command-palette", async ({ win: page, capture }) => {
      await dismissOverlays(page);
      await page.keyboard.press("Control+K");
      await page.locator(".command-palette").first().waitFor({ state: "visible", timeout: 8000 });
      await settle(page, 200);
      const items = await page.locator(".palette-item").count();
      await capture("smoke-08-command-palette");
      await page.keyboard.press("Escape");
      await page.locator(".command-palette").first().waitFor({ state: "hidden", timeout: 8000 });
      return { items };
    });

    await step("tab-picker", async ({ win: page, capture }) => {
      await page.keyboard.press("Control+P");
      await page.locator(".tab-picker").first().waitFor({ state: "visible", timeout: 8000 });
      await settle(page, 200);
      const items = await page.locator(".tab-picker .picker-item").count();
      await capture("smoke-09-tab-picker");
      await page.keyboard.press("Escape");
      await page.locator(".tab-picker").first().waitFor({ state: "hidden", timeout: 8000 });
      return { items };
    });

    // ---- 8. file panel interactions ---------------------------------------
    await step("file-panel-interactions", async ({ win: page, capture }) => {
      // The commit selected earlier leaves the panel in commit-file mode; reload
      // the working tree view by refreshing (F5 keeps the selection, so instead
      // open the staged/unstaged tabs only if they are present).
      const tabs = page.locator(".file-panel .file-tab");
      const tabCount = await tabs.count();
      if (tabCount >= 2) {
        await tabs.nth(1).click();
        await settle(page, 180);
        const staged = await page.locator(".file-panel .file-item").count();
        await capture("smoke-10-staged-files");
        await tabs.nth(0).click();
        await settle(page, 180);
        return { tabCount, staged };
      }
      return { tabCount, note: "working-tree tabs hidden by commit selection (commit file list shown instead)" };
    });

    await step("composer-focus", async ({ win: page, capture }) => {
      const textarea = page.locator(".commit-bar textarea").first();
      await textarea.click();
      await page.keyboard.type("wip: smoke check");
      await settle(page, 150);
      const focused = await page.evaluate(() => document.activeElement?.tagName === "TEXTAREA");
      if (!focused) throw new Error("commit composer did not take focus");
      await capture("smoke-11-commit-bar");
      await textarea.fill("");
      return { focused };
    });

    // ---- 9. everything closed ---------------------------------------------
    await step("close-dialogs", async ({ win: page }) => {
      await dismissOverlays(page);
      const overlays = await page.locator(".settings-overlay").count();
      if (overlays > 0) throw new Error(`${overlays} overlay(s) still open at end of run`);
      // Leave the app in a clean state, one last screenshot for the record.
      await shot(page, outDir, "smoke-12-final", { settleMs: 150 });
      return { overlays };
    });
  } catch (error) {
    report.steps.push({ name: "session", status: "fail", error: String(error?.message ?? error).slice(0, 3000) });
    console.log(`[smoke] FAIL session: ${String(error?.message ?? error).split("\n")[0]}`);
  } finally {
    if (launched) {
      const classified = classifyDiagnostics(launched.diag);
      report.diagnostics = {
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
      console.log(formatDiagnostics("smoke", classified));
      await launched.close();
    }
  }

  const failed = report.steps.filter((entry) => entry.status === "fail");
  const diagnosticErrors = report.diagnostics?.errors?.length ?? 0;
  report.finishedAt = new Date().toISOString();
  report.ok = failed.length === 0 && diagnosticErrors === 0;
  report.summary = {
    steps: report.steps.length,
    passed: report.steps.length - failed.length,
    failed: failed.length,
    diagnosticErrors,
  };
  writeJson(path.join(outDir, "smoke-report.json"), report);

  const lines = [];
  lines.push(`=== ZenTree smoke: label=${label} theme=${theme} fixture=${fixture} ===`);
  lines.push(`${report.summary.passed}/${report.summary.steps} steps passed, ${report.summary.failed} failed, ${diagnosticErrors} runtime error(s)`);
  for (const entry of failed) lines.push(`FAIL ${entry.name}: ${String(entry.error).split("\n")[0]}`);
  for (const error of report.diagnostics?.errors ?? []) lines.push(`ERROR ${error}`);
  lines.push(`report: ${relToRoot(path.join(outDir, "smoke-report.json"))}`);
  lines.push(`screenshots: ${relToRoot(outDir)}`);
  lines.push(report.ok ? "RESULT: PASS" : "RESULT: FAIL");
  console.log(lines.join("\n"));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`smoke.mjs failed: ${error?.stack ?? error}`);
  process.exitCode = 1;
});
