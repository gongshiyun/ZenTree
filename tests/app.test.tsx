// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import App from "../src/App";
import { useRepoStore } from "../src/application/repoStore";
import { setGlobalLocale } from "../src/i18n";

function installApi(overrides: Record<string, unknown> = {}) {
  const api = new Proxy({}, {
    get(_target, prop: string | symbol) {
      if (prop === Symbol.toStringTag) return "GitAPI";
      const key = String(prop);
      return (...args: unknown[]) => {
        if (key in overrides) {
          const value = overrides[key];
          return typeof value === "function" ? value(...args) : value;
        }
        return Promise.resolve({ success: true });
      };
    },
  });
  (window as unknown as { gitAPI: unknown }).gitAPI = api;
}

beforeEach(() => {
  setGlobalLocale("en");
  useRepoStore.setState({ currentRepo: null, repos: [], repoGroups: [], showSettings: false, showClone: false, showCompare: false, showRepoGroups: false, showRebase: null, showCommandPalette: false, error: null, loading: false });
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { gitAPI?: unknown }).gitAPI;
  setGlobalLocale("en");
});

describe("App", () => {
  it("renders the welcome screen when no repository is open", () => {
    installApi({
      getSettings: () => Promise.resolve({}),
      onRepoChanged: () => () => {},
    });
    const { container } = render(<App />);
    expect(container.textContent).toContain("ZenTree");
  });
});
