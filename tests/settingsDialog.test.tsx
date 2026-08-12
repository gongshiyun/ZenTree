// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";
import SettingsDialog from "../src/components/SettingsDialog";
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

function baseOverrides(): Record<string, unknown> {
  return {
    getSettings: () => Promise.resolve({}),
    getConfig: () => Promise.resolve({ success: true, data: { userName: "", userEmail: "" } }),
    getCommitTemplate: () => Promise.resolve({ success: true, data: "" }),
    getDiffTool: () => Promise.resolve({ success: true, data: "" }),
    getSignCommits: () => Promise.resolve({ success: true, data: false }),
    submoduleList: () => Promise.resolve({ success: true, data: [] }),
    onUpdateEvent: () => () => {},
    getUpdateState: () => Promise.resolve({ success: true, data: { phase: "idle", currentVersion: "1.3.6" } }),
    readGitignore: () => Promise.resolve({ success: true, data: "node_modules/\n" }),
    writeGitignore: () => Promise.resolve({ success: true }),
  };
}

function tabButton(container: HTMLElement, text: string): HTMLElement {
  const el = [...container.querySelectorAll<HTMLElement>(".settings-tab")].find((b) => b.textContent === text);
  expect(el, `tab ${text}`).toBeTruthy();
  return el!;
}

beforeEach(() => {
  setGlobalLocale("en");
  useRepoStore.setState({ showSettings: true, currentRepo: "/r", themePreset: "catppuccin-mocha", isDark: true, language: "en", loading: false, error: null });
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { gitAPI?: unknown }).gitAPI;
  setGlobalLocale("en");
});

describe("SettingsDialog", () => {
  it("loads the git tab and opens the gitignore editor", async () => {
    installApi(baseOverrides());
    const { container } = render(<SettingsDialog />);
    fireEvent.click(tabButton(container, t("settings.gitConfig")));
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === t("settings.gitignoreEdit"))!);
    await waitFor(() => expect(container.querySelector(".gitignore-editor")).toBeTruthy());
    expect((container.querySelector(".gitignore-editor") as HTMLTextAreaElement).value).toBe("node_modules/\n");
  });

  it("saves the commit template", async () => {
    const calls = installApi({ ...baseOverrides(), setCommitTemplate: () => Promise.resolve({ success: true }) });
    const { container } = render(<SettingsDialog />);
    fireEvent.click(tabButton(container, t("settings.gitConfig")));
    const editor = [...container.querySelectorAll("textarea")].find((el) => (el as HTMLTextAreaElement).placeholder === t("settings.commitTemplatePlaceholder")) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "# Title\n" } });
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === t("settings.commitTemplateSave"))!);
    await waitFor(() => expect(calls.some(([name, args]) => name === "setCommitTemplate" && args[1] === "# Title\n")).toBe(true));
  });

  it("toggles GPG signing and saves the diff tool", async () => {
    const calls = installApi({
      ...baseOverrides(),
      setSignCommits: () => Promise.resolve({ success: true }),
      setDiffTool: () => Promise.resolve({ success: true }),
    });
    const { container } = render(<SettingsDialog />);
    fireEvent.click(tabButton(container, t("settings.gitConfig")));
    fireEvent.click([...container.querySelectorAll("input[type='checkbox']")].find((c) => (c.nextSibling?.textContent || "").includes(t("settings.gpgSign")))!);
    await waitFor(() => expect(calls.some(([name, args]) => name === "setSignCommits" && args[1] === true)).toBe(true));

    const diffTool = [...container.querySelectorAll("input")].find((i) => (i as HTMLInputElement).placeholder === "vimdiff") as HTMLInputElement;
    fireEvent.change(diffTool, { target: { value: "meld" } });
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === t("settings.diffToolSave"))!);
    await waitFor(() => expect(calls.some(([name, args]) => name === "setDiffTool" && args[1] === "meld")).toBe(true));
  });

  it("shows the version and checks for updates on the about tab", async () => {
    const calls = installApi({
      ...baseOverrides(),
      checkForUpdates: () => Promise.resolve({ success: true, data: { phase: "available", currentVersion: "1.3.6", version: "2.0.0" } }),
    });
    const { container } = render(<SettingsDialog />);
    fireEvent.click(tabButton(container, t("settings.about")));
    await waitFor(() => expect(container.textContent).toContain("ZenTree v1.3.6"));
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === t("settings.checkUpdates"))!);
    await waitFor(() => expect(calls.some(([name]) => name === "checkForUpdates")).toBe(true));
  });

  it("renders the shortcuts list", () => {
    installApi(baseOverrides());
    const { container } = render(<SettingsDialog />);
    fireEvent.click(tabButton(container, t("settings.shortcuts")));
    expect(container.querySelector(".shortcut-list")).toBeTruthy();
  });
});
