// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";
import Sidebar from "../src/components/Sidebar";
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

function resetStore(patch: Record<string, unknown> = {}) {
  useRepoStore.setState({
    currentRepo: "/r",
    currentBranch: "main",
    branches: ["main", "feature"],
    remoteBranches: ["remotes/origin/main", "remotes/origin/feature"],
    branchTracking: [
      { name: "main", upstream: "origin/main", ahead: 1, behind: 2 },
      { name: "feature", upstream: null, ahead: 0, behind: 0 },
    ],
    tags: [],
    remotes: [{ name: "origin", url: "https://github.com/o/r.git" }],
    selectedDiffFile: null,
    viewRef: null,
    loading: false,
    error: null,
    ...patch,
  });
}

function branchItem(container: HTMLElement, name: string): HTMLElement {
  const el = [...container.querySelectorAll<HTMLElement>(".branch-item")].find((i) => i.textContent?.includes(name));
  expect(el, `branch item ${name}`).toBeTruthy();
  return el!;
}

function menuItems(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(".context-menu-item")];
}

function clickMenu(container: HTMLElement, text: string) {
  const item = menuItems(container).find((i) => i.textContent?.includes(text));
  expect(item, `menu item ${text}`).toBeTruthy();
  fireEvent.click(item!);
}

beforeEach(() => {
  setGlobalLocale("en");
  resetStore();
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { gitAPI?: unknown }).gitAPI;
  setGlobalLocale("en");
});

describe("Sidebar", () => {
  it("renders branches with upstream tracking counts", () => {
    installApi();
    const { container } = render(<Sidebar />);
    expect(container.textContent).toContain("feature");
    const main = branchItem(container, "main");
    expect(main.className).toContain("current");
    expect(main.querySelector(".track-count")?.textContent).toContain("2");
    expect(main.querySelector(".track-count")?.textContent).toContain("1");
  });

  it("checks out a branch on double-click", async () => {
    installApi({ checkout: () => Promise.resolve({ success: true }) });
    const { container } = render(<Sidebar />);
    fireEvent.doubleClick(branchItem(container, "feature"));
    await waitFor(() => expect(useRepoStore.getState().loading).toBe(false));
  });

  it("opens the local branch context menu and checks out", async () => {
    installApi({ checkout: () => Promise.resolve({ success: true }) });
    const { container } = render(<Sidebar />);
    fireEvent.contextMenu(branchItem(container, "feature"), { clientX: 10, clientY: 20 });
    expect(container.querySelector(".context-menu")).toBeTruthy();
    clickMenu(container, "Checkout feature");
    await waitFor(() => expect(useRepoStore.getState().loading).toBe(false));
  });

  it("renames a branch from the context menu", async () => {
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("renamed");
    installApi({ renameBranch: () => Promise.resolve({ success: true }) });
    const { container } = render(<Sidebar />);
    fireEvent.contextMenu(branchItem(container, "feature"), { clientX: 10, clientY: 20 });
    clickMenu(container, "Rename branch");
    await waitFor(() => expect(prompt).toHaveBeenCalled());
    prompt.mockRestore();
  });

  it("sets upstream from the context menu using the remote before the slash", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("origin/feature");
    installApi({ setUpstream: () => Promise.resolve({ success: true }) });
    const { container } = render(<Sidebar />);
    fireEvent.contextMenu(branchItem(container, "feature"), { clientX: 10, clientY: 20 });
    clickMenu(container, "Set upstream");
    await waitFor(() => expect(useRepoStore.getState().loading).toBe(false));
  });

  it("merges a non-current branch after confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    installApi({ merge: () => Promise.resolve({ success: true }) });
    const { container } = render(<Sidebar />);
    fireEvent.contextMenu(branchItem(container, "feature"), { clientX: 10, clientY: 20 });
    clickMenu(container, "Merge feature into current");
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    confirm.mockRestore();
  });

  it("deletes a non-current branch after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    installApi({ deleteBranch: () => Promise.resolve({ success: true }) });
    const { container } = render(<Sidebar />);
    fireEvent.contextMenu(branchItem(container, "feature"), { clientX: 10, clientY: 20 });
    clickMenu(container, "Delete feature");
    await waitFor(() => expect(useRepoStore.getState().loading).toBe(false));
  });

  it("triggers interactive rebase for a non-current branch", () => {
    installApi();
    const { container } = render(<Sidebar />);
    fireEvent.contextMenu(branchItem(container, "feature"), { clientX: 10, clientY: 20 });
    clickMenu(container, "Interactive rebase");
    expect(useRepoStore.getState().showRebase).toBe("feature");
  });

  it("checks out a remote branch from its context menu", async () => {
    installApi({ checkoutRemote: () => Promise.resolve({ success: true }) });
    const { container } = render(<Sidebar />);
    fireEvent.contextMenu(branchItem(container, "origin/feature"), { clientX: 10, clientY: 20 });
    clickMenu(container, "Checkout origin/feature");
    await waitFor(() => expect(useRepoStore.getState().loading).toBe(false));
  });

  it("creates a tag", async () => {
    installApi({ createTag: () => Promise.resolve({ success: true }) });
    const { container } = render(<Sidebar />);
    fireEvent.click([...container.querySelectorAll(".sidebar-subheader")].find((h) => h.textContent?.includes(t("tags.title")))!);
    fireEvent.click([...container.querySelectorAll(".sidebar-add-btn")].find((b) => b.getAttribute("title") === t("tags.addTip"))!);
    const tagName = [...container.querySelectorAll("input")].find((i) => (i as HTMLInputElement).placeholder === t("tags.namePlaceholder")) as HTMLInputElement;
    fireEvent.change(tagName, { target: { value: "v1.0.0" } });
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === t("tags.create"))!);
    await waitFor(() => expect(useRepoStore.getState().loading).toBe(false));
  });

  it("saves a stash with a message", async () => {
    installApi({ stashSave: () => Promise.resolve({ success: true }) });
    const { container } = render(<Sidebar />);
    fireEvent.click([...container.querySelectorAll(".sidebar-add-btn")].find((b) => b.getAttribute("title") === t("stash.saveTip"))!);
    const input = [...container.querySelectorAll("input")].find((i) => (i as HTMLInputElement).placeholder === t("stash.messagePlaceholder")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "wip" } });
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === t("stash.save"))!);
    await waitFor(() => expect(useRepoStore.getState().loading).toBe(false));
  });

  it("adds a remote", async () => {
    installApi({ addRemote: () => Promise.resolve({ success: true }) });
    const { container } = render(<Sidebar />);
    fireEvent.click([...container.querySelectorAll(".sidebar-add-btn")].find((b) => b.getAttribute("title") === t("remotes.addTip"))!);
    const name = [...container.querySelectorAll("input")].find((i) => (i as HTMLInputElement).placeholder === t("remotes.namePlaceholder")) as HTMLInputElement;
    const url = [...container.querySelectorAll("input")].find((i) => (i as HTMLInputElement).placeholder === t("remotes.urlPlaceholder")) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "upstream" } });
    fireEvent.change(url, { target: { value: "https://example.com/r.git" } });
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === t("remotes.add"))!);
    await waitFor(() => expect(useRepoStore.getState().loading).toBe(false));
  });

  it("previews a stash entry as a raw diff", async () => {
    installApi({
      stashList: () => Promise.resolve({ success: true, data: [{ ref: "stash@{0}", subject: "wip" }] }),
      stashDiff: () => Promise.resolve({ success: true, data: "diff" }),
    });
    const { container } = render(<Sidebar />);
    fireEvent.click([...container.querySelectorAll(".sidebar-subheader")].find((h) => h.textContent?.includes(t("stash.title")))!);
    await waitFor(() => expect(container.textContent).toContain("wip"));
    fireEvent.click(container.querySelector(".stash-item .stash-subject")!);
    await waitFor(() => expect(useRepoStore.getState().selectedDiffFile?.rawDiff).toBe("diff"));
  });

  it("creates a new branch from the sidebar", async () => {
    const calls = installApi({ createBranch: () => Promise.resolve({ success: true }) });
    const { container } = render(<Sidebar />);
    fireEvent.click([...container.querySelectorAll(".sidebar-add-btn")].find((b) => b.getAttribute("title") === t("sidebar.newBranch"))!);
    fireEvent.change(container.querySelector(".ref-name-input") as HTMLInputElement, { target: { value: "topic" } });
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === t("sidebar.create"))!);
    await waitFor(() => expect(calls.some(([name, args]) => name === "createBranch" && args[1] === "topic" && args[2] === true)).toBe(true));
  });

  it("unsets upstream, pushes current and rebases onto a branch", async () => {
    const calls = installApi({
      unsetUpstream: () => Promise.resolve({ success: true }),
      pushBranch: () => Promise.resolve({ success: true }),
      rebase: () => Promise.resolve({ success: true }),
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = render(<Sidebar />);

    fireEvent.contextMenu(branchItem(container, "main"), { clientX: 10, clientY: 20 });
    clickMenu(container, "Unset upstream");
    await waitFor(() => expect(calls.some(([name]) => name === "unsetUpstream")).toBe(true));

    fireEvent.contextMenu(branchItem(container, "main"), { clientX: 10, clientY: 20 });
    clickMenu(container, "Push current branch");
    await waitFor(() => expect(calls.some(([name]) => name === "pushBranch")).toBe(true));

    fireEvent.contextMenu(branchItem(container, "feature"), { clientX: 10, clientY: 20 });
    clickMenu(container, "Rebase current onto feature");
    await waitFor(() => expect(calls.some(([name]) => name === "rebase")).toBe(true));
    confirm.mockRestore();
  });

  it("pulls, deletes and prunes remote branches", async () => {
    const calls = installApi({
      pullBranch: () => Promise.resolve({ success: true }),
      deleteRemoteBranch: () => Promise.resolve({ success: true }),
      pruneRemote: () => Promise.resolve({ success: true }),
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = render(<Sidebar />);

    fireEvent.contextMenu(branchItem(container, "origin/feature"), { clientX: 10, clientY: 20 });
    clickMenu(container, "Pull this branch");
    await waitFor(() => expect(calls.some(([name, args]) => name === "pullBranch" && args[1] === "origin" && args[2] === "feature")).toBe(true));

    fireEvent.contextMenu(branchItem(container, "origin/feature"), { clientX: 10, clientY: 20 });
    clickMenu(container, "Delete remote branch");
    await waitFor(() => expect(calls.some(([name]) => name === "deleteRemoteBranch")).toBe(true));

    fireEvent.click([...container.querySelectorAll(".sidebar-add-btn")].find((b) => b.getAttribute("title") === t("sidebar.prune"))!);
    await waitFor(() => expect(calls.some(([name]) => name === "pruneRemote")).toBe(true));
    confirm.mockRestore();
  });

  it("pops and drops a stash entry", async () => {
    const calls = installApi({
      stashList: () => Promise.resolve({ success: true, data: [{ ref: "stash@{0}", subject: "wip" }] }),
      stashPop: () => Promise.resolve({ success: true }),
      stashDrop: () => Promise.resolve({ success: true }),
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = render(<Sidebar />);
    fireEvent.click([...container.querySelectorAll(".sidebar-subheader")].find((h) => h.textContent?.includes(t("stash.title")))!);
    await waitFor(() => expect(container.textContent).toContain("wip"));
    const stash = container.querySelector(".stash-item")!;
    fireEvent.click([...stash.querySelectorAll("button")].find((b) => b.textContent === t("stash.pop"))!);
    await waitFor(() => expect(calls.some(([name]) => name === "stashPop")).toBe(true));
    fireEvent.click([...stash.querySelectorAll("button")].find((b) => b.textContent === t("stash.drop"))!);
    await waitFor(() => expect(calls.some(([name]) => name === "stashDrop")).toBe(true));
    confirm.mockRestore();
  });

  it("checks out a remote branch on double-click", async () => {
    const calls = installApi({ checkoutRemote: () => Promise.resolve({ success: true }) });
    const { container } = render(<Sidebar />);
    fireEvent.doubleClick(branchItem(container, "origin/feature"));
    await waitFor(() => expect(calls.some(([name]) => name === "checkoutRemote")).toBe(true));
  });
});
