// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";
import FilePanel from "../src/components/FilePanel";
import { useRepoStore } from "../src/application/repoStore";
import { setGlobalLocale, t } from "../src/i18n";

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
    modified: ["src/modified.ts"],
    created: [],
    deleted: [],
    renamed: [],
    not_added: ["untracked.txt"],
    conflicted: [],
    files: [
      { path: "staged.txt", index: "M", working_dir: " " },
      { path: "src/modified.ts", index: " ", working_dir: "M" },
      { path: "untracked.txt", index: "?", working_dir: "?" },
    ],
    current: "main",
  };
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

describe("FilePanel extra", () => {
  it("renders the commit detail view and opens a file diff", () => {
    installApi();
    useRepoStore.setState({
      selectedCommit: "abc1234",
      commitDetail: { hash: "abc1234", author: "A", email: "e", timestamp: 1, subject: "s", files: ["a.txt"], stats: [{ path: "a.txt", additions: 2, deletions: 1 }] },
    });
    const { container } = render(<FilePanel />);
    expect(container.textContent).toContain("Files in abc1234");
    expect(container.textContent).toContain("a.txt");
    expect(container.textContent).toContain("+2");
    expect(container.textContent).toContain("-1");

    fireEvent.click(container.querySelector(".file-item")!);
    expect(useRepoStore.getState().selectedDiffFile).toMatchObject({ path: "a.txt", commitHash: "abc1234" });
  });

  it("checks out a file version from the working-tree context menu", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    installApi({ checkoutFile: () => Promise.resolve({ success: true }) });
    useRepoStore.setState({ selectedCommit: "abc1234", status: makeStatus() });
    const { container } = render(<FilePanel />);
    const row = [...container.querySelectorAll(".file-item")].find((el) => el.querySelector(".file-name")?.textContent === "src/modified.ts")!;
    fireEvent.contextMenu(row, { clientX: 10, clientY: 20 });
    const item = [...container.querySelectorAll(".context-menu-item")].find((i) => i.textContent?.includes(t("files.checkoutThisVersion")));
    expect(item, "checkout version menu item").toBeTruthy();
    fireEvent.click(item!);
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    confirm.mockRestore();
  });

  it("toggles between tree and flat views", () => {
    installApi();
    useRepoStore.setState({ status: makeStatus() });
    const { container } = render(<FilePanel />);
    expect(container.querySelector(".tree-dir")).toBeTruthy();
    fireEvent.click([...container.querySelectorAll(".file-action-btn")].find((b) => b.getAttribute("title") === t("files.flatView"))!);
    expect(container.querySelector(".tree-dir")).toBeNull();
    fireEvent.click([...container.querySelectorAll(".file-action-btn")].find((b) => b.getAttribute("title") === t("files.treeView"))!);
    expect(container.querySelector(".tree-dir")).toBeTruthy();
  });

  it("multi-selects files with ctrl+click", () => {
    installApi();
    useRepoStore.setState({ status: makeStatus() });
    const { container } = render(<FilePanel />);
    const row = [...container.querySelectorAll(".file-item")].find((el) => el.querySelector(".file-name")?.textContent === "untracked.txt")!;
    fireEvent.click(row, { ctrlKey: true });
    expect(useRepoStore.getState().selectedFiles).toContain("untracked.txt");
  });

  it("stages all unstaged files", async () => {
    installApi({ stageAll: () => Promise.resolve({ success: true }) });
    useRepoStore.setState({ status: makeStatus() });
    const { container } = render(<FilePanel />);
    fireEvent.click([...container.querySelectorAll(".file-action-btn")].find((b) => b.getAttribute("title") === t("files.stageAllTip"))!);
    await waitFor(() => expect(useRepoStore.getState().loading).toBe(false));
  });
});
