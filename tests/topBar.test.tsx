// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor, screen } from "@testing-library/react";
import TopBar from "../src/components/TopBar";
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
    currentRepo: null,
    currentBranch: "",
    repos: [],
    remotes: [],
    isDark: true,
    themePreset: "catppuccin-mocha",
    language: "en",
    loading: false,
    error: null,
    ...patch,
  });
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

describe("TopBar", () => {
  it("filters the repo dropdown and switches repositories", () => {
    installApi();
    resetStore({ repos: [{ path: "/r/alpha", name: "Alpha" }, { path: "/r/beta", name: "Beta" }] });
    const { container } = render(<TopBar />);
    fireEvent.click(container.querySelector(".repo-selector-trigger")!);
    const search = container.querySelector(".repo-search-box input") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "beta" } });
    expect([...container.querySelectorAll(".repo-dropdown-item")].map((i) => i.textContent?.includes("Beta"))).toEqual([true]);
    fireEvent.click(container.querySelector(".repo-dropdown-item")!);
    expect(useRepoStore.getState().currentRepo).toBe("/r/beta");
  });

  it("adds a valid repository chosen from the native picker", async () => {
    installApi({
      openDirectory: () => Promise.resolve("/r/new"),
      isRepo: () => Promise.resolve({ success: true, data: true }),
    });
    resetStore();
    render(<TopBar />);
    fireEvent.click(screen.getByTitle(t("topbar.addRepo")));
    await waitFor(() => expect(useRepoStore.getState().currentRepo).toBe("/r/new"));
  });

  it("rejects an invalid repository path", async () => {
    installApi({
      openDirectory: () => Promise.resolve("/not/repo"),
      isRepo: () => Promise.resolve({ success: true, data: false }),
    });
    resetStore();
    render(<TopBar />);
    fireEvent.click(screen.getByTitle(t("topbar.addRepo")));
    await waitFor(() => expect(useRepoStore.getState().error).toContain(t("app.invalidRepo")));
  });

  it("fetches the current repository", async () => {
    const calls = installApi({ fetch: () => Promise.resolve({ success: true }) });
    resetStore({ currentRepo: "/r", currentBranch: "main" });
    render(<TopBar />);
    fireEvent.click(screen.getByTitle(t("topbar.fetchTip")));
    await waitFor(() => expect(calls.some(([name]) => name === "fetch")).toBe(true));
  });

  it("pulls with the rebase strategy from the pull menu", async () => {
    const calls = installApi({ pull: () => Promise.resolve({ success: true }) });
    resetStore({ currentRepo: "/r", currentBranch: "main" });
    const { container } = render(<TopBar />);
    fireEvent.click(screen.getByTitle(t("topbar.pullOptions")));
    fireEvent.click([...container.querySelectorAll(".pull-menu-item")].find((i) => i.textContent === t("topbar.pullRebase"))!);
    await waitFor(() => expect(calls.some(([name, args]) => name === "pull" && args[1] === "rebase")).toBe(true));
  });

  it("opens the repository on its hosting platform", async () => {
    const calls = installApi({
      hostingUrl: () => Promise.resolve({ success: true, data: "https://github.com/o/r" }),
      openExternal: () => Promise.resolve({ success: true }),
    });
    resetStore({ currentRepo: "/r", currentBranch: "main", remotes: [{ name: "origin", url: "git@github.com:o/r.git" }] });
    render(<TopBar />);
    fireEvent.click(screen.getByTitle(t("topbar.hostingTip")));
    await waitFor(() => expect(calls.some(([name, args]) => name === "openExternal" && args[0] === "https://github.com/o/r")).toBe(true));
  });

  it("opens Git Bash for the current repository", async () => {
    const calls = installApi({ openGitBash: () => Promise.resolve({ success: true }) });
    resetStore({ currentRepo: "/r", currentBranch: "main" });
    render(<TopBar />);
    fireEvent.click(screen.getByTitle(t("topbar.bashTip")));
    await waitFor(() => expect(calls.some(([name]) => name === "openGitBash")).toBe(true));
  });

  it("toggles the language between English and Chinese", () => {
    installApi();
    resetStore({ language: "en" });
    render(<TopBar />);
    fireEvent.click(screen.getByText("EN"));
    expect(useRepoStore.getState().language).toBe("zh");
  });

  it("shows and clears the commit filters", () => {
    installApi();
    resetStore({ currentRepo: "/r", currentBranch: "main" });
    const { container } = render(<TopBar />);
    const query = container.querySelector(".filter-query") as HTMLInputElement;
    fireEvent.change(query, { target: { value: "fix" } });
    expect(container.querySelector(".filter-clear")).toBeTruthy();
    fireEvent.click(container.querySelector(".filter-clear")!);
    expect((container.querySelector(".filter-query") as HTMLInputElement).value).toBe("");
  });
});
