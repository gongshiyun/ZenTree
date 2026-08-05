import { describe, it, expect, vi } from "vitest";

/**
 * Isolated tests for the preload script: verifies the bridge is exposed as
 * "gitAPI" and that API methods forward to the correct IPC channels.
 */
const mocked = vi.hoisted(() => {
  const invokeCalls: [string, unknown[]][] = [];
  const onListeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const ipcRenderer = {
    invoke: (channel: string, ...args: unknown[]) => {
      invokeCalls.push([channel, args]);
      return Promise.resolve({ success: true });
    },
    on: (ev: string, fn: (...args: unknown[]) => void) => {
      (onListeners[ev] = onListeners[ev] ?? []).push(fn);
    },
    removeListener: (ev: string, fn: (...args: unknown[]) => void) => {
      const arr = onListeners[ev] ?? [];
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
  };
  const exposed: { name: string | null; api: Record<string, unknown> | null } = { name: null, api: null };
  const contextBridge = {
    exposeInMainWorld: (name: string, api: Record<string, unknown>) => {
      exposed.name = name;
      exposed.api = api;
    },
  };
  return { invokeCalls, onListeners, ipcRenderer, contextBridge, exposed };
});

vi.mock("electron", () => ({ contextBridge: mocked.contextBridge, ipcRenderer: mocked.ipcRenderer }));

import "../electron/preload";

type Api = Record<string, (...args: unknown[]) => unknown>;

const api = mocked.exposed.api as unknown as Api;

describe("preload bridge", () => {
  it("exposes the api under the gitAPI key", () => {
    expect(mocked.exposed.name).toBe("gitAPI");
    expect(api).toBeTruthy();
  });

  it("exposes a complete surface of callable methods", () => {
    const expected = [
      "isRepo", "branches", "log", "status", "commit", "checkout", "stage", "unstage",
      "discard", "reset", "deleteBranch", "clone", "fetch", "pull", "push", "stashSave",
      "diffFile", "fileHistory", "blame", "compare", "cherryPick", "tags", "remotes",
      "getSettings", "setSetting", "minimizeWindow", "closeWindow",
      "getUpdateState", "checkForUpdates", "onUpdateEvent", "openExternal",
      "checkoutFile", "showStage", "writeWorkingFile", "stashDiff",
      "watchRepo", "unwatchRepo", "onRepoChanged",
    ];
    for (const name of expected) {
      expect(typeof api[name], `missing api.${name}`).toBe("function");
    }
  });

  it("forwards method calls to the matching IPC channels with arguments", () => {
    mocked.invokeCalls.length = 0;
    api.log("/repo", 0, 25, { query: "fix" }, "main");
    expect(mocked.invokeCalls[0]).toEqual(["git:log", ["/repo", 0, 25, { query: "fix" }, "main"]]);

    api.commit("/repo", "msg", true);
    expect(mocked.invokeCalls[1]).toEqual(["git:commit", ["/repo", "msg", true]]);

    api.deleteBranch("/repo", "feature", true);
    expect(mocked.invokeCalls[2]).toEqual(["git:delete-branch", ["/repo", "feature", true]]);

    api.setSetting("themePreset", "nord");
    expect(mocked.invokeCalls[3]).toEqual(["settings:set", ["themePreset", "nord"]]);

    api.checkoutFile("/repo", "abc123", "f.txt");
    expect(mocked.invokeCalls[4]).toEqual(["git:checkout-file", ["/repo", "abc123", "f.txt"]]);

    api.showStage("/repo", 2, "f.txt");
    expect(mocked.invokeCalls[5]).toEqual(["git:show-stage", ["/repo", 2, "f.txt"]]);

    api.writeWorkingFile("/repo", "f.txt", "content");
    expect(mocked.invokeCalls[6]).toEqual(["git:write-file", ["/repo", "f.txt", "content"]]);

    api.stashDiff("/repo", "stash@{0}");
    expect(mocked.invokeCalls[7]).toEqual(["git:stash-diff", ["/repo", "stash@{0}"]]);

    api.watchRepo("/repo");
    expect(mocked.invokeCalls[8]).toEqual(["repo:watch", ["/repo"]]);

    api.unwatchRepo();
    expect(mocked.invokeCalls[9]).toEqual(["repo:unwatch", []]);
  });

  it("onUpdateEvent subscribes to update:event and unsubscribes on dispose", () => {
    const received: unknown[] = [];
    const dispose = api.onUpdateEvent((state: unknown) => received.push(state)) as () => void;

    expect(mocked.onListeners["update:event"]).toHaveLength(1);
    // simulate the main process pushing an update snapshot
    mocked.onListeners["update:event"][0]({}, { phase: "available", currentVersion: "1.0.0" });
    expect(received).toEqual([{ phase: "available", currentVersion: "1.0.0" }]);

    dispose();
    expect(mocked.onListeners["update:event"]).toHaveLength(0);
  });

  it("onRepoChanged subscribes to repo:changed and unsubscribes on dispose", () => {
    const received: unknown[] = [];
    const dispose = api.onRepoChanged((repoPath: unknown) => received.push(repoPath)) as () => void;

    expect(mocked.onListeners["repo:changed"]).toHaveLength(1);
    mocked.onListeners["repo:changed"][0]({}, "/work/repo");
    expect(received).toEqual(["/work/repo"]);

    dispose();
    expect(mocked.onListeners["repo:changed"]).toHaveLength(0);
  });
});
