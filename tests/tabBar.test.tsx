// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, waitFor, screen } from "@testing-library/react";
import TabBar from "../src/components/TabBar";
import { useRepoStore } from "../src/application/repoStore";
import { setGlobalLocale, t } from "../src/i18n";

/**
 * Component tests for the repository tab strip (src/components/TabBar.tsx).
 * The Electron bridge is replaced by a recording proxy, following the harness
 * used by the other component suites.
 */

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
    currentRepo: null,
    repos: [],
    repoGroups: [],
    customTabs: [],
    groupView: null,
    showTabPicker: false,
    repoCache: {},
    refreshSeqByRepo: {},
    error: null,
    loading: false,
    ...patch,
  });
}

const s = () => useRepoStore.getState();
const tabEls = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>(".repo-tab")];
const tabLabels = (container: HTMLElement) => tabEls(container).map((el) => el.querySelector(".repo-tab-name")?.textContent);

beforeEach(() => {
  setGlobalLocale("en");
  resetStore();
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { gitAPI?: unknown }).gitAPI;
  setGlobalLocale("en");
});

describe("TabBar rendering", () => {
  it("renders one tab per path, deriving labels for unknown repositories", () => {
    installApi();
    resetStore({ repos: [{ path: "/r/alpha", name: "Alpha" }], customTabs: ["/r/alpha", "/r/beta"], currentRepo: "/r/beta" });
    const { container } = render(<TabBar />);
    // "/r/beta" was never added to the known list, so its label comes from the path.
    expect(tabLabels(container)).toEqual(["Alpha", "beta"]);
    expect(tabEls(container)[1].classList.contains("active")).toBe(true);
    expect(tabEls(container)[0].classList.contains("active")).toBe(false);
  });

  it("shows the empty hint when there is nothing to display", () => {
    installApi();
    const { container } = render(<TabBar />);
    expect(tabEls(container)).toHaveLength(0);
    expect(container.querySelector(".tab-empty")?.textContent).toBe(t("tabs.empty"));
  });
});

describe("TabBar activation and closing", () => {
  it("activates the clicked tab", () => {
    installApi();
    resetStore({ customTabs: ["/r/a", "/r/b"], currentRepo: "/r/a" });
    const { container } = render(<TabBar />);
    fireEvent.click(tabEls(container)[1]);
    expect(s().currentRepo).toBe("/r/b");
  });

  it("keeps the current repository when its own tab is clicked again", () => {
    installApi();
    resetStore({ customTabs: ["/r/a", "/r/b"], currentRepo: "/r/a", selectedCommit: "h1" });
    const { container } = render(<TabBar />);
    fireEvent.click(tabEls(container)[0]);
    expect(s().currentRepo).toBe("/r/a");
    expect(s().selectedCommit).toBe("h1");
  });

  it("closes a tab and activates the neighbour sliding into its slot", () => {
    installApi();
    resetStore({ customTabs: ["/r/a", "/r/b", "/r/c"], currentRepo: "/r/b" });
    const { container } = render(<TabBar />);
    fireEvent.click(tabEls(container)[1].querySelector(".repo-tab-close")!);
    expect(s().customTabs).toEqual(["/r/a", "/r/c"]);
    expect(s().currentRepo).toBe("/r/c");
  });

  it("activates the previous tab when the last one is closed", () => {
    installApi();
    resetStore({ customTabs: ["/r/a", "/r/b"], currentRepo: "/r/b" });
    const { container } = render(<TabBar />);
    fireEvent.click(tabEls(container)[1].querySelector(".repo-tab-close")!);
    expect(s().customTabs).toEqual(["/r/a"]);
    expect(s().currentRepo).toBe("/r/a");
  });

  it("falls back to no repository when the only tab is closed", () => {
    installApi();
    resetStore({ customTabs: ["/r/a"], currentRepo: "/r/a" });
    const { container } = render(<TabBar />);
    fireEvent.click(tabEls(container)[0].querySelector(".repo-tab-close")!);
    expect(s().customTabs).toEqual([]);
    expect(s().currentRepo).toBeNull();
  });

  it("closes a tab on a middle click", () => {
    installApi();
    resetStore({ customTabs: ["/r/a", "/r/b"], currentRepo: "/r/a" });
    const { container } = render(<TabBar />);
    fireEvent.mouseDown(tabEls(container)[1], { button: 1 });
    expect(s().customTabs).toEqual(["/r/a"]);
    expect(s().currentRepo).toBe("/r/a");
  });

  it("ignores a primary mouse down on a tab", () => {
    installApi();
    resetStore({ customTabs: ["/r/a", "/r/b"], currentRepo: "/r/a" });
    const { container } = render(<TabBar />);
    fireEvent.mouseDown(tabEls(container)[1], { button: 0 });
    expect(s().customTabs).toEqual(["/r/a", "/r/b"]);
  });

  it("persists the tab set on every change", () => {
    const calls = installApi();
    resetStore({ customTabs: ["/r/a", "/r/b"], currentRepo: "/r/a" });
    const { container } = render(<TabBar />);
    fireEvent.click(tabEls(container)[1].querySelector(".repo-tab-close")!);
    expect(calls.some(([name, args]) => name === "setSetting" && args[0] === "tabs" && args[1][0] === "/r/a")).toBe(true);
  });
});

describe("TabBar drag reordering", () => {
  it("moves a tab onto the drop target and persists the order", () => {
    const calls = installApi();
    resetStore({ customTabs: ["/r/a", "/r/b", "/r/c"], currentRepo: "/r/a" });
    const { container } = render(<TabBar />);
    const tabs = tabEls(container);
    fireEvent.dragStart(tabs[0], { dataTransfer: {} });
    fireEvent.dragOver(tabs[2], { dataTransfer: {} });
    fireEvent.drop(tabs[2], { dataTransfer: {} });
    expect(s().customTabs).toEqual(["/r/b", "/r/c", "/r/a"]);
    expect(calls.some(([name, args]) => name === "setSetting" && args[0] === "tabs")).toBe(true);
  });
});

describe("TabBar group view", () => {
  it("replaces the tab set with a snapshot of the chosen group", () => {
    installApi();
    resetStore({
      repos: [{ path: "/r/a", name: "Alpha" }],
      customTabs: ["/r/z"],
      currentRepo: "/r/z",
      repoGroups: [{ name: "team", repos: ["/r/a", "/r/b"] }],
    });
    const { container } = render(<TabBar />);
    fireEvent.click(screen.getByTitle(t("tabs.groupTip")));
    const items = [...container.querySelectorAll(".tab-group-item")];
    expect(items.map((i) => i.querySelector(".tab-group-item-name")?.textContent)).toEqual([t("tabs.custom"), "team"]);
    fireEvent.click(items[1]);
    expect(s().groupView).toEqual({ name: "team", tabs: ["/r/a", "/r/b"] });
    expect(s().currentRepo).toBe("/r/a");
    // The custom set is untouched: it is what "back" restores.
    expect(s().customTabs).toEqual(["/r/z"]);
    expect(tabLabels(container)).toEqual(["Alpha", "b"]);
  });

  it("closes tab edits made in group view with the snapshot", () => {
    installApi();
    resetStore({ groupView: { name: "team", tabs: ["/r/a", "/r/b"] }, customTabs: ["/r/z"], currentRepo: "/r/a" });
    const { container } = render(<TabBar />);
    fireEvent.click(tabEls(container)[0].querySelector(".repo-tab-close")!);
    expect(s().groupView).toEqual({ name: "team", tabs: ["/r/b"] });
    expect(s().customTabs).toEqual(["/r/z"]);
  });

  it("returns to the custom tab set from the back button", () => {
    installApi();
    resetStore({ groupView: { name: "team", tabs: ["/r/a", "/r/b"] }, customTabs: ["/r/z"], currentRepo: "/r/a" });
    const { container } = render(<TabBar />);
    fireEvent.click(screen.getByTitle(t("tabs.exitGroupTip")));
    expect(s().groupView).toBeNull();
    expect(s().currentRepo).toBe("/r/z");
    expect(tabLabels(container)).toEqual(["z"]);
  });

  it("keeps the current repository when it is part of the custom set", () => {
    installApi();
    resetStore({ groupView: { name: "team", tabs: ["/r/a"] }, customTabs: ["/r/a", "/r/z"], currentRepo: "/r/a" });
    const { container } = render(<TabBar />);
    fireEvent.click(screen.getByTitle(t("tabs.exitGroupTip")));
    expect(s().currentRepo).toBe("/r/a");
  });

  it("reports an empty group menu when no group exists", () => {
    installApi();
    const { container } = render(<TabBar />);
    fireEvent.click(screen.getByTitle(t("tabs.groupTip")));
    expect(container.querySelector(".tab-group-empty")?.textContent).toBe(t("tabs.noGroups"));
  });
});

describe("TabBar actions", () => {
  it("opens the tab picker from the search button", () => {
    installApi();
    render(<TabBar />);
    fireEvent.click(screen.getByTitle(t("tabs.searchTip")));
    expect(s().showTabPicker).toBe(true);
  });

  it("adds a repository chosen from the native picker as a tab", async () => {
    installApi({
      openDirectory: () => Promise.resolve("/r/new"),
      isRepo: () => Promise.resolve({ success: true, data: true }),
    });
    render(<TabBar />);
    fireEvent.click(screen.getByTitle(t("tabs.addTip")));
    await waitFor(() => expect(s().currentRepo).toBe("/r/new"));
    expect(s().customTabs).toEqual(["/r/new"]);
    expect(s().repos).toEqual([{ path: "/r/new", name: "new" }]);
  });

  it("surfaces an invalid repository path without adding a tab", async () => {
    installApi({
      openDirectory: () => Promise.resolve("/not/repo"),
      isRepo: () => Promise.resolve({ success: true, data: false }),
    });
    render(<TabBar />);
    fireEvent.click(screen.getByTitle(t("tabs.addTip")));
    await waitFor(() => expect(s().error).toContain(t("app.invalidRepo")));
    expect(s().customTabs).toEqual([]);
  });

  it("maps a vertical wheel delta onto horizontal scrolling", () => {
    installApi();
    resetStore({ customTabs: ["/r/a", "/r/b"] });
    const { container } = render(<TabBar />);
    const list = container.querySelector(".tab-list") as HTMLElement;
    // jsdom has no layout, so scrollLeft is stubbed to observe the mapping.
    let scrollLeft = 0;
    Object.defineProperty(list, "scrollLeft", {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => { scrollLeft = value; },
    });
    fireEvent.wheel(list, { deltaY: 120 });
    expect(scrollLeft).toBe(120);
    fireEvent.wheel(list, { deltaY: -20 });
    expect(scrollLeft).toBe(100);
  });
});
