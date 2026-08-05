import { app, BrowserWindow } from "electron";
import { SettingsRepository } from "./settingsRepository";
import { GitRepository } from "./gitRepository";
import { createMainWindow } from "./windowManager";
import { UpdateManager } from "./updateManager";
import { RepoWatcher } from "./watcher";
import { registerIpcHandlers } from "./ipc";

/**
 * Composition root: wires the settings repository, git adapter,
 * window manager and IPC channels together.
 */
const settings = new SettingsRepository(app.getPath("userData"));
const git = new GitRepository(() => String(settings.get("gitPath") ?? ""));
const update = new UpdateManager();
const watcher = new RepoWatcher();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = createMainWindow(settings);
  mainWindow.on("closed", () => {
    watcher.stop();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  update.setBroadcast((state) => { mainWindow?.webContents.send("update:event", state); });
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
