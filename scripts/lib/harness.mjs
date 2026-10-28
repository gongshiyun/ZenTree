// Shared Electron + Playwright harness for ZenTree visual QA.
//
// Responsibilities:
//  - launch the *built* app against an isolated ZENTREE_USER_DATA profile
//  - collect renderer console/page errors, failed requests and main-process
//    stderr/stdout so a run can fail loudly on real problems
//  - take timestamped screenshots and objective layout/theme measurements
//  - provide small interaction helpers (graph node picking, overlay dismissal)
//
// Environment facts baked in:
//  - DSH exports ELECTRON_RUN_AS_NODE=1 globally; it MUST be removed from the
//    child environment or Electron starts as plain node and crashes.
//  - git runs from the portable installation with an isolated HOME (proc.mjs).

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { _electron as electron } from "playwright-core";
import { FIXTURES_DIR, PROFILES_DIR, REPO_ROOT, SHOTS_DIR, gitEnv } from "./proc.mjs";

export const ELECTRON_EXE = path.join(REPO_ROOT, "node_modules", "electron", "dist", "electron.exe");
export const DIST_INDEX = path.join(REPO_ROOT, "dist", "index.html");
export const DIST_MAIN = path.join(REPO_ROOT, "dist-electron", "electron", "main.js");
export const FIXTURE_MANIFEST = path.join(FIXTURES_DIR, "manifest.json");

export const THEME_PRESETS = ["claude", "claude-dark", "claude-code", "claude-sand"];
/** `--bg-primary` of every preset (kept in sync with src/domain/theme/presets.ts). */
export const THEME_BG = {
  claude: "#faf9f5",
  "claude-dark": "#262624",
  "claude-code": "#141413",
  "claude-sand": "#f6f1e7",
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// CLI / path helpers
// ---------------------------------------------------------------------------

/**
 * Minimal `--key value` / `--key=value` / `--flag` parser.
 * Boolean flags are declared in `booleans`.
 */
export function parseArgs(argv, { defaults = {}, booleans = [] } = {}) {
  const out = { ...defaults };
  for (const flag of booleans) out[flag] = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    const key = (eq >= 0 ? arg.slice(2, eq) : arg.slice(2)).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (booleans.includes(key)) {
      out[key] = true;
      continue;
    }
    if (eq >= 0) {
      out[key] = arg.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    }
  }
  return out;
}

export function toPosix(p) {
  return p.split(path.sep).join("/");
}

/** Path relative to the project root, as recorded in reports. */
export function relToRoot(absPath) {
  return toPosix(path.relative(REPO_ROOT, absPath));
}

/** Slug for directory names: keep it filesystem-safe. */
export function slugify(value) {
  return String(value)
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Build / fixture / profile preparation
// ---------------------------------------------------------------------------

/** Verify the built application exists and describe it (fonts, bundle, mtimes). */
export function describeBuild() {
  const missing = [DIST_INDEX, DIST_MAIN, ELECTRON_EXE].filter((p) => !fs.existsSync(p));
  if (missing.length > 0) {
    throw new Error(
      `Built app is missing:\n  ${missing.join("\n  ")}\nRun: npm.cmd run build`,
    );
  }
  const assetsDir = path.join(REPO_ROOT, "dist", "assets");
  const assets = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir).map((name) => {
      const file = path.join(assetsDir, name);
      const stat = fs.statSync(file);
      return { name, bytes: stat.size };
    })
    : [];
  return {
    builtAt: new Date(fs.statSync(DIST_INDEX).mtimeMs).toISOString(),
    mainBuiltAt: new Date(fs.statSync(DIST_MAIN).mtimeMs).toISOString(),
    electronVersion: (() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "node_modules", "electron", "package.json"), "utf8")).version;
      } catch {
        return "unknown";
      }
    })(),
    bundleAssets: assets.filter((a) => /\.(js|css|woff2?)$/i.test(a.name)),
    fonts: assets.filter((a) => /\.woff2?$/i.test(a.name)).map((a) => a.name),
    hasBundledFonts: assets.some((a) => /\.woff2$/i.test(a.name)),
  };
}

/** Create fixtures on demand (idempotent; `refresh` forces a clean rebuild). */
export function ensureFixtures({ refresh = false, names = ["demo", "conflict"] } = {}) {
  const manifestExists = fs.existsSync(FIXTURE_MANIFEST);
  const needed = names.filter((name) => !fs.existsSync(path.join(FIXTURES_DIR, name)));
  if (!manifestExists || refresh || needed.length > 0) {
    const target = refresh ? [] : needed.length > 0 ? needed : names;
    const args = [path.join(REPO_ROOT, "scripts", "make-fixture.mjs"), ...target];
    console.log(`[fixtures] ${refresh ? "refreshing" : "creating"} ${target.length ? target.join(", ") : "all"} ...`);
    const res = spawnSync(process.execPath, args, { cwd: REPO_ROOT, stdio: "inherit" });
    if (res.status !== 0) throw new Error(`make-fixture.mjs failed with exit ${res.status}`);
  }
  return readFixtureManifest();
}

export function readFixtureManifest() {
  try {
    return JSON.parse(fs.readFileSync(FIXTURE_MANIFEST, "utf8"));
  } catch {
    return null;
  }
}

/** Repo definitions stored in the app profile (name + absolute path). */
export function fixtureRepos() {
  const manifest = readFixtureManifest();
  const repos = [];
  for (const [name, info] of Object.entries(manifest?.repos ?? {})) {
    repos.push({ path: info.path, name: name === "demo" ? "zentree-demo" : "zentree-conflict" });
  }
  return repos;
}

export function fixturePath(name) {
  const manifest = readFixtureManifest();
  const fromManifest = manifest?.repos?.[name]?.path;
  if (fromManifest && fs.existsSync(fromManifest)) return fromManifest;
  return path.join(FIXTURES_DIR, name);
}

/**
 * Build the zentree-settings.json content for a run.
 * `windowWidth`/`windowHeight` are honoured by electron/windowManager.ts.
 */
export function buildProfileSettings({
  theme = "claude",
  width = 1400,
  height = 900,
  repos = [],
  tabs = [],
  lastRepo = null,
  repoGroups = [],
  language = "en",
} = {}) {
  return {
    windowWidth: width,
    windowHeight: height,
    themePreset: theme,
    language,
    repos,
    tabs,
    lastRepo: lastRepo ?? tabs[0] ?? null,
    repoGroups,
  };
}

/** Create a fresh, isolated profile directory with the given settings. */
export function writeProfile(dir, settings) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "zentree-settings.json"), JSON.stringify(settings, null, 2), "utf8");
  return dir;
}

/** Profile path for one launch: label/group/theme/fixture/size stay distinct. */
export function profileDirFor(label, group, theme, fixture, width, height) {
  return path.join(PROFILES_DIR, [slugify(label), group, theme, fixture, `${width}x${height}`].join("-"));
}

/** Shots directory for one run: .qa/shots/<label>/<theme>/. */
export function shotsDirFor(label, theme) {
  return path.join(SHOTS_DIR, slugify(label), theme);
}

// ---------------------------------------------------------------------------
// App launch & diagnostics
// ---------------------------------------------------------------------------

function attachDiagnostics(win, diag) {
  win.on("console", (msg) => {
    const entry = { type: msg.type(), text: msg.text(), location: msg.location() };
    if (msg.type() === "error") diag.consoleErrors.push(entry);
    else if (msg.type() === "warning") diag.consoleWarnings.push(entry);
    else diag.consoleLogs.push(entry);
  });
  win.on("pageerror", (error) => {
    diag.pageErrors.push({ message: error?.message ?? String(error), stack: error?.stack ?? "" });
  });
  win.on("requestfailed", (request) => {
    diag.requestFailures.push({ url: request.url(), method: request.method(), failure: request.failure()?.errorText ?? "unknown" });
  });
  win.on("response", (response) => {
    if (response.status() >= 400) diag.badResponses.push({ url: response.url(), status: response.status() });
  });
  win.on("crash", () => diag.crashes.push({ at: new Date().toISOString() }));
}

function attachProcessDiagnostics(child, diag) {
  if (!child) return;
  const collect = (chunk) => {
    const text = String(chunk);
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      diag.mainProcessOutput.push(line);
      if (diag.mainProcessOutput.length > 600) diag.mainProcessOutput.shift();
    }
  };
  child.stderr?.on("data", collect);
  child.stdout?.on("data", collect);
}

/**
 * Launch the built Electron app with an isolated profile.
 * @returns {Promise<{app: import('playwright-core').ElectronApplication, win: any, diag: object, close: () => Promise<void>}>}
 */
export async function launchApp({
  profileDir,
  theme = "claude",
  width = 1400,
  height = 900,
  fixture = "demo",
  group = "main",
  reload = true,
  instrumentCanvas = false,
  timeout = 90000,
} = {}) {
  const env = gitEnv({ ZENTREE_USER_DATA: profileDir });
  // DSH runs node with ELECTRON_RUN_AS_NODE=1; the Electron app must not inherit it.
  delete env.ELECTRON_RUN_AS_NODE;

  const diag = {
    group,
    theme,
    fixture,
    viewport: { width, height },
    consoleErrors: [],
    consoleWarnings: [],
    consoleLogs: [],
    pageErrors: [],
    requestFailures: [],
    badResponses: [],
    mainProcessOutput: [],
    crashes: [],
  };

  const app = await electron.launch({
    executablePath: ELECTRON_EXE,
    args: [REPO_ROOT],
    cwd: REPO_ROOT,
    env,
    timeout,
  });

  const child = app.process();
  attachProcessDiagnostics(child, diag);

  const win = await app.firstWindow({ timeout });
  attachDiagnostics(win, diag);
  await win.emulateMedia({ reducedMotion: "reduce" }).catch(() => {});
  win.setDefaultTimeout(15000);

  // Optional canvas instrumentation: records graph fillText calls so branch
  // pill labels can be asserted objectively (they are painted, not DOM text).
  if (instrumentCanvas) {
    await win.addInitScript(() => {
      try {
        window.__ztCanvasTexts = [];
        const original = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function instrumented(text, x, y, ...rest) {
          try {
            const canvasClass = String(this.canvas?.className ?? "");
            if (canvasClass.includes("graph-canvas")) {
              window.__ztCanvasTexts.push({ text: String(text), x: Number(x), y: Number(y), font: String(this.font) });
            }
          } catch {
            /* ignore instrumentation errors */
          }
          return original.call(this, text, x, y, ...rest);
        };
      } catch {
        /* instrumentation is best effort */
      }
    });
  }

  // Reload once so the full boot sequence (theme restore, repo load, warnings)
  // happens with our listeners attached instead of before them.
  if (reload) {
    await win.reload({ waitUntil: "domcontentloaded", timeout }).catch(() => {});
  }
  await win.waitForLoadState("domcontentloaded", { timeout }).catch(() => {});

  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    try {
      await Promise.race([app.close(), sleep(8000)]);
    } catch {
      /* already gone */
    }
    try {
      const proc = app.process();
      if (proc && proc.exitCode === null) proc.kill();
    } catch {
      /* already gone */
    }
  }

  return { app, win, diag, close };
}

// ---------------------------------------------------------------------------
// Waiting / interaction helpers
// ---------------------------------------------------------------------------

export async function settle(win, ms = 220) {
  await win.waitForTimeout(ms);
}

export async function waitForRenderer(win, { timeout = 30000 } = {}) {
  await win.waitForFunction(() => Boolean(window.gitAPI), null, { timeout });
  await win.evaluate(() => document.fonts?.ready ?? Promise.resolve()).catch(() => {});
}

/** Wait for the main window to finish restoring the repository. */
export async function waitMainReady(win, { expectRepo = true, conflict = false, timeout = 40000 } = {}) {
  await waitForRenderer(win, { timeout });
  if (expectRepo) {
    await win.waitForSelector(".status-bar", { state: "visible", timeout });
    if (conflict) {
      await win.waitForSelector(".conflict-badge", { state: "visible", timeout });
    } else {
      await win.waitForFunction(() => document.querySelectorAll(".file-item").length > 0, null, { timeout });
    }
    await win
      .waitForFunction(() => {
        const canvas = document.querySelector(".graph-canvas-overlay");
        return Boolean(canvas) && canvas.width > 10 && canvas.height > 10;
      }, null, { timeout })
      .catch(() => {});
    await settle(win, 350);
  } else {
    await win.waitForSelector(".welcome", { state: "visible", timeout });
    await settle(win, 250);
  }
}

/** Wait until the status bar spinner is gone (repo refresh finished). */
export async function waitForIdle(win, { timeout = 8000 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const busy = await win.locator(".status-bar .spinner").isVisible().catch(() => false);
    if (!busy) return;
    await sleep(90);
  }
}

/** Take a screenshot into `dir`, returning its absolute path. */
export async function shot(win, dir, name, { settleMs = 220, waitIdle = true } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  if (waitIdle) await waitForIdle(win);
  if (settleMs > 0) await settle(win, settleMs);
  const file = path.join(dir, `${name}.png`);
  await win.screenshot({ path: file });
  return file;
}

/** Save screenshot + rendered DOM for a failed scenario (best effort). */
export async function captureFailure(win, dir, name) {
  const saved = [];
  try {
    fs.mkdirSync(dir, { recursive: true });
    const png = path.join(dir, `_failure-${name}.png`);
    await win.screenshot({ path: png });
    saved.push(png);
    const html = path.join(dir, `_failure-${name}.html`);
    fs.writeFileSync(html, await win.content(), "utf8");
    saved.push(html);
  } catch {
    /* renderer may be gone */
  }
  return saved;
}

export function viewportSize(win) {
  try {
    return win.viewportSize() ?? { width: 1400, height: 900 };
  } catch {
    return { width: 1400, height: 900 };
  }
}

/** Try selectors in order until one resolves to a clickable element. */
export async function clickFirst(win, candidates, { timeout = 8000, what = "element" } = {}) {
  const errors = [];
  for (const candidate of candidates) {
    const selector = typeof candidate === "string" ? candidate : candidate.selector;
    const locator = typeof candidate === "string" ? win.locator(candidate) : candidate.locator(win);
    try {
      await locator.first().waitFor({ state: "visible", timeout: Math.min(timeout, 4000) });
      await locator.first().click({ timeout });
      return selector;
    } catch (error) {
      errors.push(`${selector}: ${error.message.split("\n")[0]}`);
    }
  }
  throw new Error(`could not click ${what}:\n  ${errors.join("\n  ")}`);
}

/**
 * Locate a graph node by hovering. The canvas renderer hit-tests pointer moves
 * and reveals .graph-tooltip, so this uses only real user input.
 *
 * Fast path: the layout is deterministic (first row is lane 0 at world
 * (22, 15), camera offset (16, 0)), so probe the expected point first.
 */
export async function pickGraphNode(win, { timeout = 15000 } = {}) {
  const canvas = win.locator(".graph-canvas-overlay");
  await canvas.waitFor({ state: "visible", timeout });
  const box = await canvas.boundingBox();
  if (!box || box.width < 20 || box.height < 20) throw new Error("graph canvas has no usable size");

  const tryPoint = async (x, y) => {
    await win.mouse.move(x, y);
    await win.waitForTimeout(40);
    return win.locator(".graph-tooltip").isVisible().catch(() => false);
  };

  const fast = [
    [box.x + 38, box.y + 15],
    [box.x + 38, box.y + 45],
    [box.x + 60, box.y + 15],
  ];
  for (const [x, y] of fast) {
    if (await tryPoint(x, y)) return { x, y, box };
  }

  const maxY = Math.min(box.height - 4, 420);
  const maxX = Math.min(box.width - 4, 260);
  for (let y = 8; y < maxY; y += 10) {
    for (let x = 10; x < maxX; x += 8) {
      if (await tryPoint(box.x + x, box.y + y)) return { x: box.x + x, y: box.y + y, box };
    }
  }
  throw new Error("could not find a graph node via hover (canvas empty or graph not painted)");
}

/** Move the pointer off the graph so tooltips disappear. */
export async function clearHover(win) {
  const size = viewportSize(win);
  await win.mouse.move(size.width - 6, 4).catch(() => {});
}

/**
 * Hover-scan the graph and return a node point, optionally skipping down whole
 * commit rows (useful to avoid the merge commit whose per-file diff is empty).
 */
export async function pickGraphNodeAtRow(win, rowOffset = 0) {
  const base = await pickGraphNode(win);
  if (rowOffset === 0) return base;
  const tooltipVisible = () => win.locator(".graph-tooltip").isVisible().catch(() => false);
  for (const dx of [0, -22, 22, -44, 44]) {
    const x = base.x + dx;
    const y = base.y + 30 * rowOffset;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await win.mouse.move(x, y);
      await win.waitForTimeout(50);
      if (await tooltipVisible()) return { ...base, x, y };
    }
  }
  return base;
}

/** Dismiss any open modal/overlay by clicking its backdrop. */
export async function dismissOverlays(win) {
  const size = viewportSize(win);
  for (let i = 0; i < 3; i += 1) {
    const overlays = win.locator(".settings-overlay");
    if ((await overlays.count()) === 0) return;
    const visible = await overlays.first().isVisible().catch(() => false);
    if (!visible) return;
    await win.mouse.click(10, Math.round(size.height / 2));
    await win.waitForTimeout(160);
  }
}

/** Dismiss a context menu / dropdown by clicking a neutral part of the chrome. */
export async function dismissMenus(win) {
  const size = viewportSize(win);
  await win.mouse.click(Math.round(size.width / 2), size.height - 6);
  await win.waitForTimeout(120);
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

/* eslint-disable no-undef */
// This function is serialized and executed inside the renderer.
function layoutProbe() {
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const describe = (el) => {
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      class: typeof el.className === "string" ? el.className : "",
      id: el.id || "",
      rect: {
        x: +rect.x.toFixed(1),
        y: +rect.y.toFixed(1),
        width: +rect.width.toFixed(1),
        height: +rect.height.toFixed(1),
        right: +rect.right.toFixed(1),
        bottom: +rect.bottom.toFixed(1),
      },
      scroll: {
        width: el.scrollWidth,
        clientWidth: el.clientWidth,
        height: el.scrollHeight,
        clientHeight: el.clientHeight,
      },
      overflow: `${cs.overflowX}/${cs.overflowY}`,
    };
  };

  const selectors = [
    ".app-layout", ".top-bar", ".filter-bar", ".tab-bar", ".sidebar", ".main-content",
    ".center-area", ".graph-container", ".file-panel", ".diff-panel", ".commit-bar",
    ".status-bar", ".welcome", ".settings-overlay", ".settings-dialog", ".command-palette",
    ".context-menu", ".diff-viewer", ".merge-dialog", ".date-picker-pop", ".graph-tooltip",
    ".graph-zoom-controls", ".graph-canvas-overlay", ".graph-canvas-base",
  ];
  const elements = {};
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    elements[selector] = el && visible(el) ? describe(el) : null;
  }

  const clipped = [];
  const outOfBounds = [];
  const width = window.innerWidth;
  const height = window.innerHeight;
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const scrollX = el.scrollWidth > el.clientWidth + 1;
    const scrollY = el.scrollHeight > el.clientHeight + 1;
    // Content that overflows a box which cannot scroll is clipped/overlapping.
    if ((scrollX && cs.overflowX === "visible") || (scrollY && cs.overflowY === "visible")) {
      if (clipped.length < 40) {
        clipped.push({
          ...describe(el),
          axis: scrollX && cs.overflowX === "visible" ? "x" : "y",
          overflowPx: scrollX ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight,
        });
      }
      continue;
    }
    // Elements painting outside the window are usually layout bugs (or menus
    // intentionally anchored near an edge; the consumer decides). Rows inside a
    // scrollable container are expected to lay out below the viewport.
    if (rect.right > width + 2 || rect.left < -2 || rect.bottom > height + 2 || rect.top < -2) {
      if (outOfBounds.length < 40) {
        let scrollableAncestor = false;
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          const parentStyle = getComputedStyle(parent);
          if (/(auto|scroll)/.test(parentStyle.overflowX + parentStyle.overflowY)) {
            scrollableAncestor = true;
            break;
          }
        }
        outOfBounds.push({ ...describe(el), scrollableAncestor });
      }
    }
  }

  const doc = document.documentElement;
  return {
    viewport: {
      innerWidth: width,
      innerHeight: height,
      devicePixelRatio: window.devicePixelRatio,
      scrollWidth: doc.scrollWidth,
      scrollHeight: doc.scrollHeight,
      clientWidth: doc.clientWidth,
      clientHeight: doc.clientHeight,
    },
    elements,
    overflow: {
      windowHorizontal: doc.scrollWidth > doc.clientWidth + 1,
      windowVertical: doc.scrollHeight > doc.clientHeight + 1,
      clipped,
      outOfBounds,
    },
  };
}
/* eslint-enable no-undef */

export async function collectLayout(win) {
  return win.evaluate(layoutProbe);
}

/* eslint-disable no-undef */
function themeProbe() {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const styleOf = (selector, prop) => {
    const el = document.querySelector(selector);
    return el ? getComputedStyle(el)[prop] : null;
  };
  const varNames = [
    "--bg-primary", "--bg-secondary", "--bg-tertiary", "--bg-elevated", "--bg-input",
    "--bg-hover", "--bg-active", "--border-color", "--text-primary", "--text-secondary",
    "--text-muted", "--text-faint", "--accent", "--accent-strong", "--font-sans",
    "--font-display", "--font-mono", "--topbar-height", "--statusbar-height", "--sidebar-width",
  ];
  const vars = {};
  for (const name of varNames) vars[name] = cs.getPropertyValue(name).trim();
  return {
    dataTheme: root.getAttribute("data-theme"),
    colorScheme: cs.colorScheme,
    vars,
    samples: {
      appBackground: styleOf(".app-layout", "backgroundColor"),
      appColor: styleOf(".app-layout", "color"),
      topBarBackground: styleOf(".top-bar", "backgroundColor"),
      sidebarBackground: styleOf(".sidebar", "backgroundColor"),
      statusBarBackground: styleOf(".status-bar", "backgroundColor"),
      topBarFontFamily: styleOf(".top-bar", "fontFamily"),
      statusBarFontFamily: styleOf(".status-bar", "fontFamily"),
    },
  };
}
/* eslint-enable no-undef */

/** Font readiness + CSS variable values of the live document. */
export async function collectThemeInfo(win) {
  await win.evaluate(async () => {
    try {
      await Promise.all([
        document.fonts.load('600 17px "Newsreader"'),
        document.fonts.load('14px "JetBrains Mono"'),
        document.fonts.load('13px "Segoe UI Variable Text"'),
      ]);
    } catch {
      /* font loading is best effort */
    }
    await document.fonts.ready;
  }).catch(() => {});
  const info = await win.evaluate(themeProbe);
  try {
    info.fontChecks = await win.evaluate(() => ({
      newsreader: document.fonts.check('600 17px "Newsreader"'),
      jetbrainsMono: document.fonts.check('14px "JetBrains Mono"'),
      fontStatus: document.fonts.status,
    }));
  } catch {
    info.fontChecks = null;
  }
  return info;
}

/* eslint-disable no-undef */
function canvasProbe() {
  const canvas = document.querySelector(".graph-canvas-base");
  if (!canvas) return null;
  let ctx;
  try {
    ctx = canvas.getContext("2d");
  } catch {
    return null;
  }
  if (!ctx || canvas.width === 0 || canvas.height === 0) return null;
  const { width, height } = canvas;
  const step = Math.max(4, Math.floor(Math.sqrt((width * height) / 60000)));
  const data = ctx.getImageData(0, 0, width, height).data;
  const counts = new Map();
  let samples = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const key = `${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`;
      counts.set(key, (counts.get(key) || 0) + 1);
      samples += 1;
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const background = sorted[0]?.[0] ?? "0,0,0,0";
  const ink = sorted.slice(1).reduce((sum, [, count]) => sum + count, 0);
  return {
    cssSize: { width: canvas.clientWidth, height: canvas.clientHeight },
    bitmapSize: { width, height },
    samples,
    distinctColors: counts.size,
    background,
    inkRatio: samples > 0 ? +(ink / samples).toFixed(4) : 0,
    topColors: sorted.slice(0, 6).map(([color, count]) => ({ color, share: +(count / samples).toFixed(4) })),
  };
}
/* eslint-enable no-undef */

/** How much non-background ink the commit-graph canvas actually painted. */
export async function measureGraphCanvas(win) {
  try {
    return await win.evaluate(canvasProbe);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Diagnostics classification
// ---------------------------------------------------------------------------

// Electron/Chromium chatter that is never caused by the app's own code.
const ENV_NOISE = /(gpu|GPU|Passthrough|DevTools|Autofill|libva|vaapi|dri3|EGL|Vulkan|Gtk|dbus|Xlib|Fontconfig|sandbox|zygote|CommandLine|PDB|crashpad|network_service|GetVSyncParametersIfAvailable|SharedImageManager)/i;
// Things that indicate a real renderer/main-process defect.
const FATAL = /(Uncaught|TypeError|ReferenceError|RangeError|SyntaxError|SecurityError|Content Security Policy|CSP violation|Failed to load resource|not defined|is not a function|Cannot read|Cannot access)/i;

/** Reduce raw diagnostics to the list of problems a run should fail on. */
export function classifyDiagnostics(diag) {
  const errors = [];
  for (const error of diag.pageErrors) errors.push(`pageerror: ${error.message}`);
  for (const entry of diag.consoleErrors) errors.push(`console.error: ${entry.text}`);
  // ERR_ABORTED means the request was cancelled (e.g. our deliberate reload
  // cancelled the first boot's in-flight bundle request); it is not a defect.
  for (const failure of diag.requestFailures) {
    if (/ERR_ABORTED/i.test(failure.failure ?? "")) continue;
    errors.push(`request failed: ${failure.url} (${failure.failure})`);
  }
  for (const response of diag.badResponses) errors.push(`HTTP ${response.status}: ${response.url}`);
  for (const crash of diag.crashes) errors.push(`renderer crash at ${crash.at}`);

  const seriousMain = [];
  let ignoredMain = 0;
  for (const line of diag.mainProcessOutput) {
    if (!FATAL.test(line)) continue;
    if (ENV_NOISE.test(line) && !/Uncaught|Content Security Policy|Failed to load resource|CONSOLE/i.test(line)) {
      ignoredMain += 1;
      continue;
    }
    seriousMain.push(line);
  }
  for (const line of seriousMain) errors.push(`main-process: ${line.slice(0, 500)}`);

  return {
    errors,
    warnings: diag.consoleWarnings.map((entry) => entry.text),
    ignoredMainLines: ignoredMain,
    mainOutputLines: diag.mainProcessOutput.length,
    counts: {
      pageErrors: diag.pageErrors.length,
      consoleErrors: diag.consoleErrors.length,
      consoleWarnings: diag.consoleWarnings.length,
      requestFailures: diag.requestFailures.length,
      badResponses: diag.badResponses.length,
      crashes: diag.crashes.length,
      mainProcessLines: diag.mainProcessOutput.length,
      seriousMainLines: seriousMain.length,
    },
  };
}

/** Human-readable multi-line diagnostics block. */
export function formatDiagnostics(group, classified) {
  const lines = [];
  lines.push(`[${group}] diagnostics: ${JSON.stringify(classified.counts)}`);
  if (classified.errors.length === 0) {
    lines.push(`[${group}] no uncaught errors, failed requests or crash output.`);
  } else {
    for (const error of classified.errors.slice(0, 40)) lines.push(`[${group}] ERROR ${error}`);
    if (classified.errors.length > 40) lines.push(`[${group}] ... ${classified.errors.length - 40} more errors`);
  }
  if (classified.warnings.length > 0) {
    lines.push(`[${group}] ${classified.warnings.length} console.warning(s):`);
    for (const warning of classified.warnings.slice(0, 10)) lines.push(`[${group}] WARN ${warning}`);
  }
  return lines.join("\n");
}

/** Return the fillText records captured on the graph canvases (instrumentCanvas). */
export async function getGraphCanvasTexts(win) {
  try {
    return await win.evaluate(() => window.__ztCanvasTexts ?? []);
  } catch {
    return [];
  }
}

/**
 * Wait until the graph canvas paints branch name pills (spec §4.5).
 * Returns the painted branch-name strings, or [] when none appeared in time.
 * With `instrumentCanvas` disabled the instrumentation array is absent, so call
 * only on launches that set instrumentCanvas: true.
 */
export async function waitForBranchLabels(win, { timeout = 10000 } = {}) {
  // Anchored on purpose: commit subjects may contain "feature/..." etc., while
  // a pill paints exactly the ref name.
  const looksLikeBranch = (text) =>
    /^(?:main|master|develop|trunk|HEAD|feature\/[\w.-]+|fix\/[\w.-]+|release\/[\w.-]+|hotfix\/[\w.-]+|remotes\/[\w./-]+)$/.test(text);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const texts = await getGraphCanvasTexts(win);
    const labels = texts.map((entry) => entry.text).filter(looksLikeBranch);
    if (labels.length > 0) return labels;
    await sleep(120);
  }
  return [];
}

/** Measure whether an element is visually clipped by its scroll ancestor. */
export async function measureClipping(win, childSelector, ancestorSelector) {
  return win.evaluate(([child, ancestor]) => {
    const childEl = document.querySelector(child);
    const ancestorEl = document.querySelector(ancestor);
    if (!childEl || !ancestorEl) return null;
    const childRect = childEl.getBoundingClientRect();
    const ancestorRect = ancestorEl.getBoundingClientRect();
    const ancestorStyle = getComputedStyle(ancestorEl);
    const clippedX = ancestorStyle.overflowX !== "visible";
    const clippedY = ancestorStyle.overflowY !== "visible";
    return {
      child: { top: +childRect.top.toFixed(1), left: +childRect.left.toFixed(1), bottom: +childRect.bottom.toFixed(1), right: +childRect.right.toFixed(1) },
      ancestor: { top: +ancestorRect.top.toFixed(1), left: +ancestorRect.left.toFixed(1), bottom: +ancestorRect.bottom.toFixed(1), right: +ancestorRect.right.toFixed(1) },
      ancestorOverflow: `${ancestorStyle.overflowX}/${ancestorStyle.overflowY}`,
      clippedTopPx: clippedY ? +Math.max(0, ancestorRect.top - childRect.top).toFixed(1) : 0,
      clippedBottomPx: clippedY ? +Math.max(0, childRect.bottom - ancestorRect.bottom).toFixed(1) : 0,
      clippedLeftPx: clippedX ? +Math.max(0, ancestorRect.left - childRect.left).toFixed(1) : 0,
      isClipped: (clippedY && childRect.top < ancestorRect.top - 1) || (clippedY && childRect.bottom > ancestorRect.bottom + 1)
        || (clippedX && childRect.left < ancestorRect.left - 1) || (clippedX && childRect.right > ancestorRect.right + 1),
    };
  }, [childSelector, ancestorSelector]);
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
  return file;
}
