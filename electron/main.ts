import { app, BrowserWindow } from "electron";
import { SettingsRepository } from "./settingsRepository";
import { GitRepository } from "./gitRepository";
import { createMainWindow } from "./windowManager";
import { registerIpcHandlers } from "./ipc";

/**
 * Composition root: wires the settings repository, git adapter,
 * window manager and IPC channels together.
 */
const settings = new SettingsRepository(app.getPath("userData"));
const git = new GitRepository(() => String(settings.get("gitPath") ?? ""));

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = createMainWindow(settings);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers({ settings, git, getWindow: () => mainWindow });
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
