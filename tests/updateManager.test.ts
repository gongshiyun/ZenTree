import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Isolated tests for UpdateManager. Both `electron` (app) and
 * `electron-updater` (autoUpdater) are mocked; the fake autoUpdater is a
 * minimal event emitter so tests can simulate the updater event stream.
 */
const mocked = vi.hoisted(() => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const app = {
    isPackaged: true,
    getVersion: () => "9.9.9",
  };
  const autoUpdater = {
    autoDownload: true as boolean,
    autoInstallOnAppQuit: false as boolean,
    checkCalls: 0,
    downloadCalls: 0,
    quitArgs: [] as unknown[],
    failNextCheck: false,
    failNextDownload: false,
    on(ev: string, fn: (...args: unknown[]) => void) {
      (listeners[ev] = listeners[ev] ?? []).push(fn);
    },
    emit(ev: string, ...args: unknown[]) {
      for (const fn of listeners[ev] ?? []) fn(...args);
    },
    reset() {
      for (const key of Object.keys(listeners)) delete listeners[key];
      this.autoDownload = true;
      this.autoInstallOnAppQuit = false;
      this.checkCalls = 0;
      this.downloadCalls = 0;
      this.quitArgs = [];
      this.failNextCheck = false;
      this.failNextDownload = false;
    },
    async checkForUpdates() {
      this.checkCalls += 1;
      if (this.failNextCheck) {
        this.failNextCheck = false;
        throw new Error("check failed");
      }
    },
    async downloadUpdate() {
      this.downloadCalls += 1;
      if (this.failNextDownload) {
        this.failNextDownload = false;
        throw new Error("download failed");
      }
    },
    quitAndInstall(...args: unknown[]) {
      this.quitArgs = args;
    },
  };
  return { app, autoUpdater };
});

vi.mock("electron", () => ({ app: mocked.app }));
vi.mock("electron-updater", () => ({ autoUpdater: mocked.autoUpdater }));

import { UpdateManager } from "../electron/updateManager";
import type { UpdateState } from "../src/types";

let manager: UpdateManager;
let broadcasts: UpdateState[];

beforeEach(() => {
  mocked.autoUpdater.reset();
  mocked.app.isPackaged = true;
  delete process.env.PORTABLE_EXECUTABLE_DIR;
  manager = new UpdateManager();
  broadcasts = [];
  manager.setBroadcast((s) => broadcasts.push(s));
});

afterEach(() => {
  delete process.env.PORTABLE_EXECUTABLE_DIR;
});

describe("constructor", () => {
  it("disables auto download and keeps install-on-quit enabled", () => {
    expect(mocked.autoUpdater.autoDownload).toBe(false);
    expect(mocked.autoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  it("starts in the idle phase with the current app version", () => {
    expect(manager.getState()).toEqual({ phase: "idle", currentVersion: "9.9.9" });
  });
});

describe("isSupported", () => {
  it("rejects unpackaged (dev) environments", () => {
    mocked.app.isPackaged = false;
    expect(manager.isSupported()).toEqual({ ok: false, reason: "dev" });
  });

  it("rejects portable builds", () => {
    process.env.PORTABLE_EXECUTABLE_DIR = "C:\\portable";
    expect(manager.isSupported()).toEqual({ ok: false, reason: "portable" });
  });

  it("accepts packaged installer builds", () => {
    expect(manager.isSupported()).toEqual({ ok: true });
  });
});

describe("check", () => {
  it("reports unsupported without touching the updater in dev mode", async () => {
    mocked.app.isPackaged = false;
    const state = await manager.check();
    expect(state.phase).toBe("unsupported");
    expect(state.reason).toBe("dev");
    expect(mocked.autoUpdater.checkCalls).toBe(0);
    expect(broadcasts.at(-1)?.phase).toBe("unsupported");
  });

  it("walks checking -> available with version and string release notes", async () => {
    const pending = manager.check();
    mocked.autoUpdater.emit("checking-for-update");
    mocked.autoUpdater.emit("update-available", { version: "2.0.0", releaseNotes: "notes!" });
    const state = await pending;
    expect(state).toEqual({
      phase: "available", currentVersion: "9.9.9", version: "2.0.0", releaseNotes: "notes!",
    });
  });

  it("joins array release notes with newlines", async () => {
    const pending = manager.check();
    mocked.autoUpdater.emit("update-available", {
      version: "2.0.0",
      releaseNotes: [{ note: "first" }, { note: "second" }, {}],
    });
    const state = await pending;
    expect(state.releaseNotes).toBe("first\nsecond\n");
  });

  it("reports not-available when the updater says so", async () => {
    const pending = manager.check();
    mocked.autoUpdater.emit("update-not-available", { version: "1.3.5" });
    const state = await pending;
    expect(state.phase).toBe("not-available");
    expect(state.version).toBe("1.3.5");
  });

  it("captures updater errors into the state", async () => {
    mocked.autoUpdater.failNextCheck = true;
    const state = await manager.check();
    expect(state.phase).toBe("error");
    expect(state.error).toBe("check failed");
  });

  it("does not start a second concurrent check", async () => {
    const pending = manager.check();
    await manager.check(); // second call while the first is in flight
    mocked.autoUpdater.emit("update-available", { version: "2.0.0" });
    await pending;
    expect(mocked.autoUpdater.checkCalls).toBe(1);
  });
});

describe("download", () => {
  it("refuses to download when no update is available", async () => {
    const state = await manager.download();
    expect(state.phase).toBe("error");
    expect(state.error).toBe("No update available to download");
    expect(mocked.autoUpdater.downloadCalls).toBe(0);
  });

  it("streams rounded progress and ends in downloaded", async () => {
    const pending = manager.check();
    mocked.autoUpdater.emit("update-available", { version: "2.0.0" });
    await pending;

    const downloading = manager.download();
    expect(broadcasts.at(-1)).toMatchObject({ phase: "downloading", progress: { percent: 0 } });
    mocked.autoUpdater.emit("download-progress", { percent: 33.3333, transferred: 100, total: 300 });
    expect(manager.getState().progress).toEqual({ percent: 33.3, transferred: 100, total: 300 });
    mocked.autoUpdater.emit("update-downloaded");
    expect((await downloading).phase).toBe("downloaded");
  });

  it("reports download failures as an error phase", async () => {
    const pending = manager.check();
    mocked.autoUpdater.emit("update-available", { version: "2.0.0" });
    await pending;
    mocked.autoUpdater.failNextDownload = true;
    const state = await manager.download();
    expect(state.phase).toBe("error");
    expect(state.error).toBe("download failed");
  });
});

describe("install / broadcast", () => {
  it("install delegates to quitAndInstall with force-runAfter", () => {
    manager.install();
    expect(mocked.autoUpdater.quitArgs).toEqual([false, true]);
  });

  it("broadcasts deep-cloned snapshots so callers cannot mutate internal state", async () => {
    const pending = manager.check();
    mocked.autoUpdater.emit("update-available", { version: "2.0.0" });
    await pending;
    mocked.autoUpdater.emit("download-progress", { percent: 50, transferred: 1, total: 2 });
    const snapshot = manager.getState();
    snapshot.progress!.percent = 999;
    expect(manager.getState().progress?.percent).toBe(50);
    expect(broadcasts.length).toBeGreaterThanOrEqual(3);
  });
});
