import { BrowserWindow } from "electron";
import * as path from "path";
import type { SettingsRepository } from "./settingsRepository";

/**
 * Infrastructure adapter: owns BrowserWindow lifecycle and persists
 * window bounds (debounced) back into settings.
 */
export function createMainWindow(settings: SettingsRepository): BrowserWindow {
  const s = settings.load();
  const win = new BrowserWindow({
    width: s.windowWidth || 1400,
    height: s.windowHeight || 900,
    minWidth: 900,
    minHeight: 600,
    title: "ZenTree",
    backgroundColor: "#1a1b26",
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
      const bounds = win.getBounds();
      settings.set("windowWidth", bounds.width);
      settings.set("windowHeight", bounds.height);
    }, 300);
  });

  if (process.env.NODE_ENV === "development" || process.argv.includes("--dev")) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  }

  return win;
}
