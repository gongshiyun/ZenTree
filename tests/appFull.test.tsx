// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";
import App from "../src/App";
import { useRepoStore } from "../src/application/repoStore";
import { setGlobalLocale } from "../src/i18n";
import { installCanvasStub } from "./helpers/canvasStub";

type Calls = [string, unknown[]][];

function installApi(overrides: Record<string, unknown> = {}): Calls {
  const calls: Calls = [];
  const api = new Proxy({}, {
    get(_target, prop: string | symbol) {
      if (prop === Symbol.toStringTag) return "GitAPI";
      const key = String(prop);
      return (...args: unknown[]) => {
        calls.push([key, args]);
        if (key in overrides) {
          const value = overrides[key];
          return typeof value === "function" ? value(...args) : value;
        }
        return Promise.resolve({ success: true });
      };
    },
  });
  (window as unknown as { gitAPI: unknown }).gitAPI = api;
  return calls;
}

function baseOverrides(): Record<string, unknown> {
  return {
    getSettings: () => Promise.resolve({}),
    onRepoChanged: () => () => {},
    branches: () => Promise.resolve({ success: true, data: { current: "main", all: ["main"], branches: {} } }),
    log: () => Promise.resolve({ success: true, data: [] }),
    status: () => Promise.resolve({ success: true, data: { staged: [], modified: [], created: [], deleted: [], renamed: [], not_added: [], conflicted: [], files: [], current: "main" } }),
    tags: () => Promise.resolve({ success: true, data: [] }),
    remotes: () => Promise.resolve({ success: true, data: [] }),
    branchTracking: () => Promise.resolve({ success: true, data: [] }),
    getOngoingOperation: () => Promise.resolve({ success: true, data: null }),
  };
}

let restoreStub: () => void;

beforeEach(() => {
  setGlobalLocale("en");
  restoreStub = installCanvasStub();
  useRepoStore.setState({
    currentRepo: "/r",
    currentBranch: "main",
    repos: [{ path: "/r", name: "r" }],
    branches: ["main"],
    graphData: { nodes: [], edges: [], maxLane: 0, branchRefs: {} },
    status: null,
    selectedFiles: [],
    showCommandPalette: false,
    error: null,
    loading: false,
  });
});

afterEach(() => {
  cleanup();
  restoreStub();
  delete (window as unknown as { gitAPI?: unknown }).gitAPI;
  setGlobalLocale("en");
});

describe("App full layout and keyboard shortcuts", () => {
  it("renders the full layout when a repository is open", () => {
    installApi(baseOverrides());
    const { container } = render(<App />);
    expect(container.querySelector(".top-bar")).toBeTruthy();
    expect(container.querySelector(".sidebar")).toBeTruthy();
    expect(container.querySelector(".commit-bar")).toBeTruthy();
  });

  it("refreshes on F5", async () => {
    const calls = installApi(baseOverrides());
    render(<App />);
    fireEvent.keyDown(window, { key: "F5" });
    await waitFor(() => expect(calls.some(([name]) => name === "branches")).toBe(true));
  });

  it("dismisses the error with Escape", () => {
    installApi(baseOverrides());
    useRepoStore.setState({ error: "boom" });
    render(<App />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useRepoStore.getState().error).toBeNull();
  });

  it("toggles the command palette with Ctrl+K", () => {
    installApi(baseOverrides());
    render(<App />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(useRepoStore.getState().showCommandPalette).toBe(true);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(useRepoStore.getState().showCommandPalette).toBe(false);
  });

  it("stages all with Ctrl+Shift+S", async () => {
    const calls = installApi(baseOverrides());
    render(<App />);
    fireEvent.keyDown(window, { key: "S", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(calls.some(([name]) => name === "stageAll")).toBe(true));
  });

  it("discards the multi-selection on Delete", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const calls = installApi(baseOverrides());
    useRepoStore.setState({ selectedFiles: ["a.txt"] });
    render(<App />);
    fireEvent.keyDown(window, { key: "Delete" });
    await waitFor(() => expect(calls.some(([name]) => name === "discard")).toBe(true));
    confirm.mockRestore();
  });
});
