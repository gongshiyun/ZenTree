import { app, BrowserWindow } from "electron";
import * as path from "path";
import type { SettingsRepository } from "./settingsRepository";
import { DEFAULT_THEME, getThemePreset } from "../src/domain/theme/presets";

/**
 * Window chrome background, matched to the saved theme so the frameless window
 * does not flash a mismatched colour while the renderer boots.
 */
function themeBackground(themePreset: string | undefined): string {
  const preset = getThemePreset(themePreset || DEFAULT_THEME) || getThemePreset(DEFAULT_THEME)!;
  return preset.colors["--bg-primary"];
}

/** The only origin the renderer is allowed to navigate to / open windows for. */
function isTrustedNavigationUrl(url: string, devServerUrl: string): boolean {
  try {
    const parsed = new URL(url);
    if (devServerUrl) return parsed.origin === new URL(devServerUrl).origin;
    return parsed.protocol === "file:";
  } catch {
    return false;
  }
}

/**
 * Infrastructure adapter: owns BrowserWindow lifecycle and persists
 * window bounds (debounced) back into settings.
 */
export function createMainWindow(settings: SettingsRepository): BrowserWindow {
  const s = settings.load();
  const background = themeBackground(s.themePreset);
  const win = new BrowserWindow({
    width: s.windowWidth || 1400,
    height: s.windowHeight || 900,
    minWidth: 900,
    minHeight: 600,
    title: "ZenTree",
    backgroundColor: background,
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  win.on("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      const bounds = win.getBounds();
      settings.set("windowWidth", bounds.width);
      settings.set("windowHeight", bounds.height);
    }, 300);
  });
  win.on("closed", () => {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }
  });

  // The packaged app must never load a dev server: a stray `--dev` flag or
  // NODE_ENV=development would otherwise hand a local process the full git
  // bridge. Only an unpackaged dev build may use the Vite server.
  const devServerUrl = !app.isPackaged && (process.env.NODE_ENV === "development" || process.argv.includes("--dev"))
    ? "http://localhost:5173"
    : "";
  if (devServerUrl) {
    win.loadURL(devServerUrl);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  }

  // Keep the frameless renderer locked to its own origin: no popups, no
  // navigation to arbitrary pages while the git bridge is exposed.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedNavigationUrl(url, devServerUrl)) event.preventDefault();
  });

  return win;
}
