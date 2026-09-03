// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import TabPicker from "../src/components/TabPicker";
import { useRepoStore } from "../src/application/repoStore";
import { setGlobalLocale, t } from "../src/i18n";

/**
 * Component tests for the Ctrl+P tab picker (src/components/TabPicker.tsx):
 * ordering, filtering, and the two outcomes of picking a row (activate an open
 * tab, or open a closed repository as a new one).
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
    showTabPicker: true,
    repoCache: {},
    refreshSeqByRepo: {},
    error: null,
    loading: false,
    ...patch,
  });
}

const s = () => useRepoStore.getState();
const rows = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>(".picker-item")];
const labels = (container: HTMLElement) => rows(container).map((r) => r.querySelector(".palette-label")?.textContent);

function openPicker(patch: Record<string, unknown> = {}) {
  installApi();
  resetStore(patch);
  const result = render(<TabPicker />);
  return { ...result, input: result.container.querySelector(".palette-input") as HTMLInputElement };
}

beforeEach(() => {
  setGlobalLocale("en");
  resetStore({ showTabPicker: false });
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { gitAPI?: unknown }).gitAPI;
  setGlobalLocale("en");
});

describe("TabPicker visibility", () => {
  it("renders nothing while hidden", () => {
    installApi();
    resetStore({ showTabPicker: false });
    const { container } = render(<TabPicker />);
    expect(container.querySelector(".tab-picker")).toBeNull();
  });

  it("closes on Escape", () => {
    const { input } = openPicker();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(s().showTabPicker).toBe(false);
  });

  it("closes when the overlay is clicked", () => {
    const { container } = openPicker();
    fireEvent.click(container.querySelector(".settings-overlay")!);
    expect(s().showTabPicker).toBe(false);
  });
});

describe("TabPicker listing", () => {
  it("lists open tabs first and badges them", () => {
    const { container } = openPicker({
      repos: [{ path: "/r/a", name: "Alpha" }, { path: "/r/b", name: "Beta" }, { path: "/r/c", name: "Gamma" }],
      customTabs: ["/r/b"],
      currentRepo: "/r/b",
    });
    expect(labels(container)).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(container.querySelectorAll(".picker-badge")).toHaveLength(1);
    expect(container.querySelector(".picker-badge")?.textContent).toBe(t("tabs.opened"));
  });

  it("derives labels for group members that are not known repositories", () => {
    const { container } = openPicker({
      repos: [],
      groupView: { name: "team", tabs: ["/work/legacy-svc"] },
      currentRepo: "/work/legacy-svc",
    });
    expect(labels(container)).toEqual(["legacy-svc"]);
  });

  it("filters by name and by path", () => {
    const { container, input } = openPicker({
      repos: [{ path: "d:/work/app", name: "app" }, { path: "d:/home/app", name: "app" }],
      customTabs: [],
    });
    expect(labels(container)).toHaveLength(2);
    fireEvent.change(input, { target: { value: "HOME" } });
    expect(rows(container).map((r) => r.querySelector(".palette-hint")?.textContent)).toEqual(["d:/home/app"]);
  });

  it("shows the empty state when nothing matches", () => {
    const { container, input } = openPicker({ repos: [{ path: "/r/a", name: "Alpha" }] });
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(rows(container)).toHaveLength(0);
    expect(container.querySelector(".palette-empty")?.textContent).toBe(t("tabs.noResults"));
  });
});

describe("TabPicker navigation", () => {
  it("moves the highlight with the arrow keys and clamps at both ends", () => {
    const { container, input } = openPicker({
      repos: [{ path: "/r/a", name: "Alpha" }, { path: "/r/b", name: "Beta" }],
    });
    expect(rows(container)[0].classList.contains("active")).toBe(true);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(rows(container)[1].classList.contains("active")).toBe(true);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(rows(container)[1].classList.contains("active")).toBe(true);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(rows(container)[0].classList.contains("active")).toBe(true);
  });

  it("resets the highlight when the query changes", () => {
    const { container, input } = openPicker({
      repos: [{ path: "/r/a", name: "Alpha" }, { path: "/r/b", name: "Beta" }],
    });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.change(input, { target: { value: "a" } });
    expect(rows(container)[0].classList.contains("active")).toBe(true);
  });

  it("activates an open tab on Enter without adding it again", () => {
    const { input } = openPicker({
      repos: [{ path: "/r/a", name: "Alpha" }, { path: "/r/b", name: "Beta" }],
      customTabs: ["/r/b", "/r/a"],
      currentRepo: "/r/a",
    });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(s().currentRepo).toBe("/r/b");
    expect(s().customTabs).toEqual(["/r/b", "/r/a"]);
    expect(s().showTabPicker).toBe(false);
  });

  it("opens a closed repository as a new tab on click", () => {
    const { container } = openPicker({
      repos: [{ path: "/r/a", name: "Alpha" }, { path: "/r/b", name: "Beta" }],
      customTabs: ["/r/a"],
      currentRepo: "/r/a",
    });
    fireEvent.click(rows(container)[1]);
    expect(s().customTabs).toEqual(["/r/a", "/r/b"]);
    expect(s().currentRepo).toBe("/r/b");
    expect(s().showTabPicker).toBe(false);
  });

  it("does nothing on Enter when the list is empty", () => {
    const { input } = openPicker({ repos: [{ path: "/r/a", name: "Alpha" }] });
    fireEvent.change(input, { target: { value: "zzz" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(s().showTabPicker).toBe(true);
    expect(s().currentRepo).toBeNull();
  });
});
