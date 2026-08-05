// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";
import StatusBar from "../src/components/StatusBar";
import DatePicker from "../src/components/DatePicker";
import CommitGraph from "../src/components/CommitGraph";
import CommandPalette from "../src/components/CommandPalette";
import MergePanel from "../src/components/MergePanel";
import { useRepoStore } from "../src/application/repoStore";
import { setGlobalLocale } from "../src/i18n";
import { buildGraphData } from "../src/domain/graph/layout";
import { installCanvasStub } from "./helpers/canvasStub";
import type { CommitLogEntry } from "../src/types";

/**
 * Component tests run in jsdom. The git bridge is replaced with a fake that
 * records calls; the zustand store is driven directly via setState.
 */

function fakeGitApi(overrides: Record<string, (...args: unknown[]) => unknown> = {}) {
  const calls: [string, unknown[]][] = [];
  const api = new Proxy(overrides, {
    get(target, prop: string) {
      return (...args: unknown[]) => {
        calls.push([prop, args]);
        if (prop in target) return (target as Record<string, unknown>)[prop](...args);
        return Promise.resolve({ success: false, error: "not implemented in test" });
      };
    },
  });
  (window as unknown as { gitAPI: unknown }).gitAPI = api;
  return { calls };
}

function resetStore(patch: Record<string, unknown>) {
  useRepoStore.setState({
    currentRepo: null, currentBranch: "", ongoing: null, loading: false,
    loadingMessage: "", error: null, status: null,
    ...patch,
  });
}

beforeEach(() => {
  setGlobalLocale("en");
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { gitAPI?: unknown }).gitAPI;
  setGlobalLocale("en");
});

describe("StatusBar", () => {
  it("shows the current repository and branch", () => {
    fakeGitApi();
    resetStore({ currentRepo: "/work/repo", currentBranch: "main" });
    const { container } = render(<StatusBar />);
    expect(container.textContent).toContain("/work/repo");
    expect(container.textContent).toContain("main");
  });

  it("renders an ongoing merge with abort and continue actions", () => {
    const { calls } = fakeGitApi({
      mergeAbort: () => Promise.resolve({ success: false, error: "abort failed" }),
    });
    resetStore({ currentRepo: "/r", currentBranch: "main", ongoing: "merge" });
    const { container } = render(<StatusBar />);

    expect(container.textContent).toContain("Merge in progress");
    const abort = [...container.querySelectorAll("button")].find((b) => b.textContent === "Abort")!;
    expect(abort).toBeTruthy();

    fireEvent.click(abort);
    expect(calls.some(([name]) => name === "mergeAbort")).toBe(true);
  });

  it("surfaces the error envelope when an operation fails", async () => {
    fakeGitApi({
      rebaseAbort: () => Promise.resolve({ success: false, error: "boom" }),
    });
    resetStore({ currentRepo: "/r", currentBranch: "main", ongoing: "rebase" });
    const { container } = render(<StatusBar />);

    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === "Abort")!);
    // runOp is async; wait for the error to be flushed into the store
    await vi.waitFor(() => {
      expect(useRepoStore.getState().error).toBe("boom");
    });
    expect(container.textContent).toContain("boom");
    expect(useRepoStore.getState().loading).toBe(false);
  });

  it("shows a conflict badge with the conflicted file count", () => {
    fakeGitApi();
    resetStore({ status: { conflicted: ["a.txt", "b.txt"] } });
    const { container } = render(<StatusBar />);
    const badge = container.querySelector(".conflict-badge");
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toContain("2");
  });

  it("shows the loading message and lets the user dismiss errors", () => {
    fakeGitApi();
    resetStore({ loading: true, loadingMessage: "Fetching...", error: "some error" });
    const { container } = render(<StatusBar />);
    expect(container.querySelector(".spinner")).toBeTruthy();
    expect(container.textContent).toContain("Fetching...");

    const errorEl = container.querySelector(".error")!;
    fireEvent.click(errorEl);
    expect(useRepoStore.getState().error).toBeNull();
  });
});

describe("CommitGraph context menu", () => {
  let restoreStub: () => void;

  beforeEach(() => {
    restoreStub = installCanvasStub();
  });

  afterEach(() => {
    restoreStub();
  });

  function commit(hash: string, parents: string[]): CommitLogEntry {
    return { hash, shortHash: hash.slice(0, 7), parents, author: "A", email: "a@b.c", timestamp: 1700000000, subject: `subject ${hash}` };
  }

  it("opens a menu with the full action set on right click", async () => {
    const api = fakeGitApi({ cherryPick: () => Promise.resolve({ success: true }) });
    useRepoStore.setState({
      currentRepo: "/r",
      graphData: buildGraphData([commit("c0", ["c1"]), commit("c1", [])]),
    });

    const { container } = render(<CommitGraph />);
    const overlay = container.querySelector(".graph-canvas-overlay")!;
    expect(overlay).toBeTruthy();

    // GraphRenderer reads offsetX/offsetY which jsdom does not populate.
    const ev = new MouseEvent("contextmenu", { bubbles: true, clientX: 500, clientY: 300 });
    Object.defineProperty(ev, "offsetX", { value: 58 });
    Object.defineProperty(ev, "offsetY", { value: 31 });
    // fireEvent dispatches inside act(), flushing the menu state synchronously.
    fireEvent(overlay, ev);

    const menu = container.querySelector(".context-menu");
    expect(menu).toBeTruthy();
    const items = [...menu!.querySelectorAll(".context-menu-item")].map((i) => i.textContent);
    expect(items).toContain("Cherry-pick this commit");
    expect(items).toContain("Revert this commit");
    expect(items).toContain("Create branch here...");
    expect(items).toContain("Create tag here...");
    expect(items).toContain("Checkout this commit");
    expect(items).toContain("Compare from here...");
    expect(items).toContain("Copy commit hash");
  });

  it("runs cherry-pick through the confirmed action flow", async () => {
    const api = fakeGitApi({ cherryPick: () => Promise.resolve({ success: true }) });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    useRepoStore.setState({
      currentRepo: "/r",
      graphData: buildGraphData([commit("c0", ["c1"]), commit("c1", [])]),
    });

    const { container } = render(<CommitGraph />);
    const overlay = container.querySelector(".graph-canvas-overlay")!;
    const ev = new MouseEvent("contextmenu", { bubbles: true, clientX: 500, clientY: 300 });
    Object.defineProperty(ev, "offsetX", { value: 58 });
    Object.defineProperty(ev, "offsetY", { value: 31 });
    fireEvent(overlay, ev);

    const menu = container.querySelector(".context-menu");
    expect(menu).toBeTruthy();
    const cherryPick = [...menu!.querySelectorAll(".context-menu-item")]
      .find((i) => i.textContent === "Cherry-pick this commit")!;
    fireEvent.click(cherryPick);

    await waitFor(() => {
      expect(confirm).toHaveBeenCalled();
      expect(api.calls.some(([name]) => name === "cherryPick")).toBe(true);
    });
    confirm.mockRestore();
  });
});

describe("CommandPalette", () => {
  beforeEach(() => {
    useRepoStore.setState({
      showCommandPalette: true,
      repos: [{ path: "/r/a", name: "Alpha" }],
      branches: ["main", "feat"],
      currentBranch: "main",
    });
  });

  it("filters commands by query and executes on Enter", async () => {
    const api = fakeGitApi();
    const { container } = render(<CommandPalette />);

    const input = container.querySelector(".palette-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "feat" } });

    const items = await waitFor(() => [...container.querySelectorAll(".palette-item")]);
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("feat");

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(api.calls.some(([name]) => name === "checkout")).toBe(true);
    });
  });

  it("shows an empty state for unmatched queries", () => {
    const { container } = render(<CommandPalette />);
    const input = container.querySelector(".palette-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzz-no-match" } });
    expect(container.textContent).toContain("No matching commands");
  });
});

describe("MergePanel", () => {
  it("loads conflict stages and saves a chosen resolution", async () => {
    const writes: string[] = [];
    const api = fakeGitApi({
      readWorkingFile: () => Promise.resolve({ success: true, data: "<<<<<<< HEAD\nours line\n=======\ntheirs line\n>>>>>>> branch\ntrailing\n" }),
      showStage: (_repo: string, stage: number) => Promise.resolve({
        success: true,
        data: stage === 1 ? "base line\n" : stage === 2 ? "ours line\n" : "theirs line\n",
      }),
      writeWorkingFile: (_repo: string, _file: string, content: string) => {
        writes.push(content);
        return Promise.resolve({ success: true });
      },
      stage: () => Promise.resolve({ success: true }),
    });
    useRepoStore.setState({ currentRepo: "/r" });
    const onClose = vi.fn();

    const { container } = render(<MergePanel filePath="f.txt" onClose={onClose} />);
    await waitFor(() => expect(container.querySelector(".merge-block")).toBeTruthy());

    const takeTheirs = [...container.querySelectorAll(".file-action-btn")]
      .find((b) => b.textContent === "Take theirs")!;
    fireEvent.click(takeTheirs);
    fireEvent.click([...container.querySelectorAll(".settings-btn.primary")].find((b) => b.textContent === "Save & mark resolved")!);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.calls.some(([name]) => name === "writeWorkingFile")).toBe(true);
    expect(writes[0]).toContain("theirs line");
    expect(writes[0]).not.toContain("ours line");
    expect(writes[0]).not.toContain("<<<<<<<");
    expect(writes[0]).toContain("trailing");
  });
});
describe("DatePicker", () => {
  function toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  it("shows a placeholder when empty and the value otherwise", () => {
    const { container, rerender } = render(<DatePicker value="" onChange={() => {}} />);
    expect(container.textContent).toContain("Pick a date");
    rerender(<DatePicker value="2026-06-10" onChange={() => {}} />);
    expect(container.textContent).toContain("2026-06-10");
  });

  it("opens the calendar on the value's month and selects a day", () => {
    const onChange = vi.fn();
    const { container } = render(<DatePicker value="2026-06-10" onChange={onChange} />);

    fireEvent.click(container.querySelector(".date-picker-trigger")!);
    expect(container.textContent).toContain("June 2026");

    const day15 = [...container.querySelectorAll(".date-picker-cell")]
      .find((c) => c.textContent === "15")!;
    fireEvent.click(day15);
    expect(onChange).toHaveBeenCalledWith("2026-06-15");
    // popup closes after selection
    expect(container.querySelector(".date-picker-pop")).toBeNull();
  });

  it("marks the selected day and navigates months", () => {
    const { container } = render(<DatePicker value="2026-06-10" onChange={() => {}} />);
    fireEvent.click(container.querySelector(".date-picker-trigger")!);

    const selected = container.querySelector(".date-picker-cell.selected");
    expect(selected?.textContent).toBe("10");

    const navButtons = container.querySelectorAll(".date-picker-nav");
    fireEvent.click(navButtons[1]); // next month
    expect(container.textContent).toContain("July 2026");
    fireEvent.click(navButtons[0]); // back
    expect(container.textContent).toContain("June 2026");
  });

  it("today and clear shortcuts emit the expected values", () => {
    const onChange = vi.fn();
    const { container } = render(<DatePicker value="2026-06-10" onChange={onChange} />);
    fireEvent.click(container.querySelector(".date-picker-trigger")!);

    const todayBtn = [...container.querySelectorAll("button")].find((b) => b.textContent === "Today")!;
    fireEvent.click(todayBtn);
    expect(onChange).toHaveBeenLastCalledWith(toDateStr(new Date()));

    fireEvent.click(container.querySelector(".date-picker-trigger")!);
    const clearBtn = [...container.querySelectorAll("button")].find((b) => b.textContent === "Clear")!;
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("renders a monday-first week with seven weekday headers", () => {
    const { container } = render(<DatePicker value="2026-06-10" onChange={() => {}} />);
    fireEvent.click(container.querySelector(".date-picker-trigger")!);
    const weekdays = [...container.querySelectorAll(".date-picker-weekday")].map((w) => w.textContent);
    expect(weekdays).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
    // June 2026-06-01 is a Monday: the grid starts with day 1, no leading blanks
    const cells = [...container.querySelectorAll(".date-picker-cell")];
    expect(cells[0].textContent).toBe("1");
    expect(cells.length % 7).toBe(0);
  });
});
