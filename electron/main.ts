import { app, BrowserWindow, Menu } from "electron";
import * as path from "path";
import { SettingsRepository } from "./settingsRepository";
import { GitRepository } from "./gitRepository";
import { createMainWindow } from "./windowManager";
import { UpdateManager } from "./updateManager";
import { RepoWatcher } from "./watcher";
import { registerIpcHandlers } from "./ipc";

const isDev = !app.isPackaged;

// Isolated profile for automated UI checks: never touch the real user settings
// when the app is driven by the screenshot/QA harness.
if (process.env.ZENTREE_USER_DATA) {
  app.setPath("userData", path.resolve(process.env.ZENTREE_USER_DATA));
}

/**
 * Composition root: wires the settings repository, git adapter,
 * window manager and IPC channels together.
 */
const settings = new SettingsRepository(app.getPath("userData"));
const git = new GitRepository(() => String(settings.get("gitPath") ?? ""));
const update = new UpdateManager();
const watcher = new RepoWatcher();

let mainWindow: BrowserWindow | null = null;

/** Send to the live window only; events can arrive while the window is closing. */
function sendToWindow(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function createWindow(): void {
  mainWindow = createMainWindow(settings);
  mainWindow.on("closed", () => {
    watcher.stop();
    mainWindow = null;
  });
}

/**
 * A second launch must focus the existing window instead of opening a second
 * app instance: two instances would fight over the same settings file and both
 * run update checks.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else if (app.isReady()) {
      createWindow();
    }
  });

  app.whenReady().then(() => {
    // The app draws its own frameless chrome; the default menu would only
    // contribute hidden accelerators (e.g. Ctrl+W quitting the window).
    if (!isDev) Menu.setApplicationMenu(null);
    update.setBroadcast((state) => { sendToWindow("update:event", state); });
    registerIpcHandlers({ settings, git, update, watcher, getWindow: () => mainWindow });
    createWindow();
    if (app.isPackaged) {
      // Silent auto-check on startup; the renderer surfaces the result.
      setTimeout(() => { update.check(); }, 5000);
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
