// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";
import FilePanel from "../src/components/FilePanel";
import { useRepoStore } from "../src/application/repoStore";
import { setGlobalLocale } from "../src/i18n";

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

function makeStatus() {
  return {
    staged: ["staged.txt"],
    modified: ["modified.txt"],
    created: [],
    deleted: [],
    renamed: [],
    not_added: ["untracked.txt"],
    conflicted: ["conflict.txt"],
    files: [
      { path: "staged.txt", index: "M", working_dir: " " },
      { path: "modified.txt", index: " ", working_dir: "M" },
      { path: "untracked.txt", index: "?", working_dir: "?" },
      { path: "conflict.txt", index: "U", working_dir: "U" },
    ],
    current: "main",
  };
}

function rowByFile(container: HTMLElement, name: string): HTMLElement {
  const row = [...container.querySelectorAll<HTMLElement>(".file-item")].find((el) => el.querySelector(".file-name")?.textContent === name);
  expect(row, `file row ${name}`).toBeTruthy();
  return row!;
}

beforeEach(() => {
  setGlobalLocale("en");
  useRepoStore.setState({ currentRepo: "/r", status: null, selectedFiles: [], selectedDiffFile: null, selectedCommit: null, commitDetail: null, error: null });
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { gitAPI?: unknown }).gitAPI;
  setGlobalLocale("en");
});

describe("FilePanel", () => {
  it("renders unstaged and staged file lists with counts", () => {
    installApi();
    useRepoStore.setState({ status: makeStatus() });
    const { container } = render(<FilePanel />);
    expect(container.textContent).toContain("modified.txt");
    expect(container.textContent).toContain("untracked.txt");
    expect(container.textContent).toContain("conflict.txt");

    fireEvent.click([...container.querySelectorAll(".file-tab")].find((t) => t.textContent?.includes("Staged"))!);
    expect(container.textContent).toContain("staged.txt");
  });

  it("stages a single unstaged file through gitApi().stage", async () => {
    installApi({ stage: () => Promise.resolve({ success: true }) });
    useRepoStore.setState({ status: makeStatus() });
    const { container } = render(<FilePanel />);
    const row = rowByFile(container, "modified.txt");
    fireEvent.click([...row.querySelectorAll("button")].find((b) => b.textContent === "Stage")!);
    await waitFor(() => expect(useRepoStore.getState().loading).toBe(false));
  });

  it("unstages a file from the staged tab", async () => {
    installApi({ unstage: () => Promise.resolve({ success: true }) });
    useRepoStore.setState({ status: makeStatus() });
    const { container } = render(<FilePanel />);
    fireEvent.click([...container.querySelectorAll(".file-tab")].find((t) => t.textContent?.includes("Staged"))!);
    const row = rowByFile(container, "staged.txt");
    fireEvent.click([...row.querySelectorAll("button")].find((b) => b.textContent === "Unstage")!);
    await waitFor(() => expect(useRepoStore.getState().loading).toBe(false));
  });

  it("discards a file only after confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    installApi({ discard: () => Promise.resolve({ success: true }) });
    useRepoStore.setState({ status: makeStatus() });
    const { container } = render(<FilePanel />);
    const row = rowByFile(container, "modified.txt");
    fireEvent.click([...row.querySelectorAll("button")].find((b) => b.textContent === "Discard")!);
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("shows a resolve action for conflicted files", () => {
    installApi();
    useRepoStore.setState({ status: makeStatus() });
    const { container } = render(<FilePanel />);
    const row = rowByFile(container, "conflict.txt");
    expect([...row.querySelectorAll("button")].some((b) => b.textContent === "Resolve")).toBe(true);
  });
});
