import { app } from "electron";
import { autoUpdater, type UpdateInfo, type ProgressInfo } from "electron-updater";
import type { UpdateState } from "../src/types";

/**
 * Infrastructure service: wraps electron-updater to provide a
 * check -> download -> install flow with renderer-friendly state snapshots.
 */
export class UpdateManager {
  private state: UpdateState = { phase: "idle", currentVersion: app.getVersion() };
  private broadcast: (state: UpdateState) => void = () => {};
  private checking = false;

  constructor() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("checking-for-update", () => {
      this.setState({ phase: "checking" });
    });
    autoUpdater.on("update-available", (info: UpdateInfo) => {
      this.setState({
        phase: "available",
        version: info.version,
        releaseNotes: this.notesToString(info.releaseNotes),
      });
    });
    autoUpdater.on("update-not-available", (info: UpdateInfo) => {
      this.setState({ phase: "not-available", version: info.version });
    });
    autoUpdater.on("download-progress", (progress: ProgressInfo) => {
      this.setState({
        phase: "downloading",
        progress: {
          percent: Math.round(progress.percent * 10) / 10,
          transferred: progress.transferred,
          total: progress.total,
        },
      });
    });
    autoUpdater.on("update-downloaded", () => {
      this.setState({ phase: "downloaded" });
    });
    autoUpdater.on("error", (err: Error) => {
      this.setState({ phase: "error", error: err.message });
    });
  }

  /** Register a sink for state snapshots (e.g. webContents.send). */
  setBroadcast(fn: (state: UpdateState) => void): void {
    this.broadcast = fn;
  }

  getState(): UpdateState {
    return this.clone(this.state);
  }

  /** Check whether the running environment supports auto-update. */
  isSupported(): { ok: boolean; reason?: "dev" | "portable" } {
    if (!app.isPackaged) return { ok: false, reason: "dev" };
    // electron-builder portable builds expose PORTABLE_EXECUTABLE_DIR.
    if (process.env.PORTABLE_EXECUTABLE_DIR) return { ok: false, reason: "portable" };
    return { ok: true };
  }

  async check(): Promise<UpdateState> {
    const support = this.isSupported();
    if (!support.ok) {
      this.setState({ phase: "unsupported", reason: support.reason });
      return this.getState();
    }
    if (this.checking) return this.getState();
    this.checking = true;
    this.setState({ phase: "checking" });
    try {
      await autoUpdater.checkForUpdates();
    } catch (err: unknown) {
      this.setState({ phase: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.checking = false;
    }
    return this.getState();
  }

  async download(): Promise<UpdateState> {
    if (this.state.phase !== "available") {
      this.setState({ phase: "error", error: "No update available to download" });
      return this.getState();
    }
    try {
      this.setState({ phase: "downloading", progress: { percent: 0, transferred: 0, total: 0 } });
      await autoUpdater.downloadUpdate();
      return this.getState();
    } catch (err: unknown) {
      this.setState({ phase: "error", error: err instanceof Error ? err.message : String(err) });
      return this.getState();
    }
  }

  install(): void {
    autoUpdater.quitAndInstall(false, true);
  }

  private setState(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.broadcast(this.getState());
  }

  private clone(state: UpdateState): UpdateState {
    return {
      ...state,
      progress: state.progress ? { ...state.progress } : undefined,
    };
  }

  private notesToString(notes: UpdateInfo["releaseNotes"]): string | undefined {
    if (typeof notes === "string") return notes;
    if (Array.isArray(notes)) return notes.map((n) => n.note ?? "").join("\n");
    return undefined;
  }
}