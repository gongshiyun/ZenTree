// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";
import RepoGroupDialog from "../src/components/RepoGroupDialog";
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
    repos: [{ path: "/r/a", name: "Alpha" }],
    repoGroups: [{ name: "team", repos: [] }],
    loading: false,
    error: null,
    ...patch,
  });
}

function inputByPlaceholder(container: HTMLElement, placeholder: string): HTMLInputElement {
  const el = [...container.querySelectorAll<HTMLInputElement>("input")].find((i) => i.placeholder === placeholder);
  expect(el, `input ${placeholder}`).toBeTruthy();
  return el!;
}

function buttonByText(container: HTMLElement, text: string): HTMLElement {
  const el = [...container.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === text);
  expect(el, `button ${text}`).toBeTruthy();
  return el!;
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

describe("RepoGroupDialog", () => {
  it("adds a manual repository to the selected group", () => {
    installApi();
    const { container } = render(<RepoGroupDialog onClose={() => {}} />);
    fireEvent.change(inputByPlaceholder(container, t("repoGroups.addRepoPlaceholder")), { target: { value: "/r/b" } });
    fireEvent.click(buttonByText(container, t("repoGroups.addRepo")));
    expect(useRepoStore.getState().repoGroups[0].repos).toEqual(["/r/b"]);
  });

  it("adds a known repository with one click", () => {
    installApi();
    const { container } = render(<RepoGroupDialog onClose={() => {}} />);
    fireEvent.click(buttonByText(container, "+ Alpha"));
    expect(useRepoStore.getState().repoGroups[0].repos).toEqual(["/r/a"]);
  });

  it("removes a repository and deletes a group", () => {
    installApi();
    resetStore({ repoGroups: [{ name: "team", repos: ["/r/a"] }] });
    const { container } = render(<RepoGroupDialog onClose={() => {}} />);
    fireEvent.click(buttonByText(container, t("repoGroups.removeRepo")));
    expect(useRepoStore.getState().repoGroups[0].repos).toEqual([]);

    fireEvent.click(container.querySelector(".repogroup-remove")!);
    expect(useRepoStore.getState().repoGroups).toEqual([]);
  });

  it("scans a folder and adds the selected repositories", async () => {
    installApi({
      scanRepos: () => Promise.resolve({ success: true, data: [{ path: "/r/s", name: "Sub" }] }),
    });
    const { container } = render(<RepoGroupDialog onClose={() => {}} />);
    fireEvent.change(inputByPlaceholder(container, t("repoGroups.scanDirPlaceholder")), { target: { value: "/projects" } });
    fireEvent.click(buttonByText(container, t("repoGroups.scan")));
    await waitFor(() => expect(container.textContent).toContain("Sub"));
    fireEvent.click(container.querySelector(".repogroup-scan-item input")!);
    fireEvent.click(buttonByText(container, t("repoGroups.addSelected")));
    expect(useRepoStore.getState().repoGroups[0].repos).toEqual(["/r/s"]);
  });

  it("turns off stash and passes the updated options to batchCheckout", async () => {
    const calls = installApi({
      batchCheckout: () => Promise.resolve({ success: true, data: { repo: "/r/a", ok: true, skipped: false, branchBefore: "main", branchAfter: "feat", stashed: false, restored: false, actions: [] } }),
    });
    resetStore({ repoGroups: [{ name: "team", repos: ["/r/a"] }] });
    const { container } = render(<RepoGroupDialog onClose={() => {}} />);
    const stashCheckbox = [...container.querySelectorAll<HTMLInputElement>("input[type='checkbox']")]
      .find((c) => (c.nextSibling?.textContent || "").includes(t("repoGroups.optStash")))!;
    fireEvent.click(stashCheckbox);
    fireEvent.change(inputByPlaceholder(container, t("repoGroups.branchPlaceholder")), { target: { value: "feat" } });
    fireEvent.click(buttonByText(container, t("repoGroups.run")));
    await waitFor(() => {
      expect(calls.some(([name, args]) => name === "batchCheckout" && args[2]?.stash === false)).toBe(true);
    });
  });
});
