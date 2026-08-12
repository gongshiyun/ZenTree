// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor, screen } from "@testing-library/react";
import { useRepoStore } from "../src/application/repoStore";
import { setGlobalLocale, t } from "../src/i18n";
import RefNameDialog from "../src/components/RefNameDialog";
import CommitBar from "../src/components/CommitBar";
import CloneDialog from "../src/components/CloneDialog";
import CompareDialog from "../src/components/CompareDialog";
import RebaseDialog from "../src/components/RebaseDialog";
import DiffPanel from "../src/components/DiffPanel";
import DiffViewer from "../src/components/DiffViewer";
import TopBar from "../src/components/TopBar";
import SettingsDialog from "../src/components/SettingsDialog";
import RepoGroupDialog from "../src/components/RepoGroupDialog";
import Sidebar from "../src/components/Sidebar";

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
    branches: [],
    remoteBranches: [],
    repos: [],
    repoGroups: [],
    tags: [],
    remotes: [],
    branchTracking: [],
    status: null,
    selectedDiffFile: null,
    showSettings: false,
    showClone: false,
    showCompare: false,
    showRebase: null,
    showRepoGroups: false,
    themePreset: "catppuccin-mocha",
    isDark: true,
    language: "en",
    loading: false,
    loadingMessage: "",
    error: null,
    logFilters: {},
    ongoing: null,
    viewRef: null,
    compareBase: null,
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

describe("RefNameDialog", () => {
  it("submits a trimmed name on Enter and ignores blank input", () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <RefNameDialog title="Create" placeholder="Name" confirmLabel="OK" onSubmit={onSubmit} onClose={onClose} />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  feature  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("feature");

    onSubmit.mockClear();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("closes on Escape and via the cancel button", () => {
    const onClose = vi.fn();
    const { container } = render(
      <RefNameDialog title="Create" placeholder="Name" confirmLabel="OK" onSubmit={() => {}} onClose={onClose} />,
    );
    fireEvent.keyDown(container.querySelector("input") as HTMLInputElement, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === "Cancel")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("CommitBar", () => {
  it("disables commit when nothing is staged", () => {
    installApi();
    resetStore({ currentRepo: "/r", status: { staged: [], created: [], modified: [], deleted: [], renamed: [], not_added: [], conflicted: [], files: [], current: "main" } });
    const { container } = render(<CommitBar />);
    const btn = [...container.querySelectorAll("button")].find((b) => b.textContent === "Commit")!;
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("commits a message through gitApi().commit", async () => {
    installApi({ commit: () => Promise.resolve({ success: true }) });
    resetStore({
      currentRepo: "/r",
      status: { staged: ["a.txt"], created: [], modified: [], deleted: [], renamed: [], not_added: [], conflicted: [], files: [], current: "main" },
    });
    const { container } = render(<CommitBar />);
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "my commit" } });
    const btn = [...container.querySelectorAll("button")].find((b) => b.textContent === "Commit")!;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(useRepoStore.getState().loading).toBe(false);
    });
  });

  it("prefills the last commit message when amend is toggled", async () => {
    installApi({ lastMessage: () => Promise.resolve({ success: true, data: "previous commit\n" }) });
    resetStore({ currentRepo: "/r", status: null });
    const { container } = render(<CommitBar />);
    fireEvent.click(container.querySelector("input[type='checkbox']") as HTMLInputElement);
    await waitFor(() => {
      expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe("previous commit\n");
    });
  });
});

describe("CloneDialog", () => {
  it("shows a validation error when required fields are empty", () => {
    installApi();
    resetStore({ showClone: true });
    const { container } = render(<CloneDialog />);
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === "Clone")!);
    expect(container.textContent).toContain(t("clone.fillAll"));
  });

  it("surfaces a clone failure message", async () => {
    installApi({ clone: () => Promise.resolve({ success: false, error: "permission denied" }) });
    resetStore({ showClone: true });
    const { container } = render(<CloneDialog />);
    const inputs = container.querySelectorAll("input");
    fireEvent.change(inputs[0] as HTMLInputElement, { target: { value: "https://github.com/o/r.git" } });
    fireEvent.change(inputs[1] as HTMLInputElement, { target: { value: "C:\\src" } });
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === "Clone")!);
    await waitFor(() => expect(container.textContent).toContain("permission denied"));
  });
});

describe("CompareDialog", () => {
  it("runs a comparison and renders the file list", async () => {
    installApi({
      compare: () => Promise.resolve({
        success: true,
        data: { from: "HEAD", to: "main", ahead: 1, behind: 0, files: [{ path: "f.txt", status: "M", additions: 2, deletions: 1 }], totalAdditions: 2, totalDeletions: 1 },
      }),
    });
    resetStore({ showCompare: true, currentRepo: "/r", branches: ["main"], currentBranch: "main" });
    const { container } = render(<CompareDialog />);
    const selects = container.querySelectorAll("select");
    fireEvent.change(selects[1] as HTMLSelectElement, { target: { value: "main" } });
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === "Compare")!);
    await waitFor(() => expect(container.textContent).toContain("f.txt"));
  });
});

describe("RebaseDialog", () => {
  it("loads the todo rows and starts the rebase on confirm", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    installApi({
      logRange: () => Promise.resolve({ success: true, data: [{ hash: "abc1234", subject: "first" }, { hash: "def5678", subject: "second" }] }),
      rebaseInteractive: () => Promise.resolve({ success: true }),
    });
    resetStore({ showRebase: "HEAD~2", currentRepo: "/r" });
    const { container } = render(<RebaseDialog onClose={() => {}} />);
    await waitFor(() => expect(container.textContent).toContain("first"));
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === "Start Rebase")!);
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    confirm.mockRestore();
  });

  it("reorders rows with the move buttons", async () => {
    installApi({
      logRange: () => Promise.resolve({ success: true, data: [{ hash: "abc1234", subject: "first" }, { hash: "def5678", subject: "second" }] }),
    });
    resetStore({ showRebase: "HEAD~2", currentRepo: "/r" });
    const { container } = render(<RebaseDialog onClose={() => {}} />);
    await waitFor(() => expect(container.querySelectorAll(".rebase-row").length).toBe(2));
    const rows = [...container.querySelectorAll<HTMLElement>(".rebase-row")];
    const secondUp = [...rows[1].querySelectorAll("button")].find((b) => b.getAttribute("title") === t("rebase.moveUp"))!;
    fireEvent.click(secondUp);
    const subjects = [...container.querySelectorAll(".rebase-subject")].map((el) => el.textContent);
    expect(subjects).toEqual(["second", "first"]);
  });

  it("reveals a reword input when the action is changed to reword", async () => {
    installApi({
      logRange: () => Promise.resolve({ success: true, data: [{ hash: "abc1234", subject: "first" }] }),
    });
    resetStore({ showRebase: "HEAD~2", currentRepo: "/r" });
    const { container } = render(<RebaseDialog onClose={() => {}} />);
    await waitFor(() => expect(container.querySelector(".rebase-row")).toBeTruthy());
    const select = container.querySelector(".rebase-action") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "reword" } });
    expect(container.querySelector(".rebase-reword")).toBeTruthy();
  });
});

describe("DiffPanel / DiffViewer", () => {
  it("renders a pre-fetched raw diff without hitting the diff IPC", async () => {
    installApi();
    resetStore({ currentRepo: "/r", selectedDiffFile: { path: "a.txt", isStaged: false, rawDiff: "@@ -1,1 +1,1 @@\n a\n" } });
    const { container } = render(<DiffPanel />);
    await waitFor(() => expect(container.querySelector(".diff-hunk")).toBeTruthy());
    expect(container.textContent).toContain("a.txt");
  });

  it("renders an untracked file as an addition", async () => {
    installApi({ readWorkingFile: () => Promise.resolve({ success: true, data: "hello\n" }) });
    resetStore({ currentRepo: "/r" });
    const { container } = render(
      <DiffViewer filePath="new.txt" isStaged={false} status="untracked" onClose={() => {}} />,
    );
    await waitFor(() => expect(container.querySelector(".diff-line.addition")).toBeTruthy());
  });
});

describe("DiffPanel resize and empty state", () => {
  it("renders nothing when no file is selected", () => {
    installApi();
    resetStore({ currentRepo: "/r", selectedDiffFile: null });
    const { container } = render(<DiffPanel />);
    expect(container.querySelector(".diff-panel")).toBeNull();
  });

  it("resizes the panel when the handle is dragged", () => {
    installApi();
    resetStore({ currentRepo: "/r", selectedDiffFile: { path: "a.txt", isStaged: false, rawDiff: "@@ -1,1 +1,1 @@\n a\n" } });
    const { container } = render(<DiffPanel />);
    const handle = container.querySelector(".diff-panel-resize")!;
    fireEvent.mouseDown(handle, { clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 400 });
    fireEvent.mouseUp(document);
    const panel = container.querySelector(".diff-panel") as HTMLElement;
    expect(panel.style.width).toBe("612px");
  });
});

describe("TopBar", () => {
  it("toggles the theme when the theme button is clicked", () => {
    installApi();
    resetStore({ currentRepo: null, isDark: true, themePreset: "catppuccin-mocha" });
    render(<TopBar />);
    fireEvent.click(screen.getByTitle(t("topbar.toggleTheme")));
    expect(useRepoStore.getState().themePreset).toBe("catppuccin-latte");
  });

  it("opens the repo dropdown and switches repositories", () => {
    installApi();
    resetStore({ repos: [{ path: "/r/a", name: "Alpha" }], currentRepo: null });
    const { container } = render(<TopBar />);
    fireEvent.click(container.querySelector(".repo-selector-trigger")!);
    expect(container.querySelector(".repo-dropdown")).toBeTruthy();
    fireEvent.click(container.querySelector(".repo-dropdown-item")!);
    expect(useRepoStore.getState().currentRepo).toBe("/r/a");
  });
});

describe("SettingsDialog", () => {
  it("switches theme from the appearance tab and saves settings", async () => {
    installApi({
      getSettings: () => Promise.resolve({}),
      getConfig: () => Promise.resolve({ success: true, data: { userName: "", userEmail: "" } }),
      getCommitTemplate: () => Promise.resolve({ success: true, data: "" }),
      getDiffTool: () => Promise.resolve({ success: true, data: "" }),
      getSignCommits: () => Promise.resolve({ success: true, data: false }),
      submoduleList: () => Promise.resolve({ success: true, data: [] }),
      onUpdateEvent: () => () => {},
      getUpdateState: () => Promise.resolve({ success: true, data: { phase: "idle", currentVersion: "1.0.0" } }),
      setSetting: () => Promise.resolve({ success: true }),
      setConfig: () => Promise.resolve({ success: true }),
    });
    resetStore({ showSettings: true, currentRepo: "/r" });
    const { container } = render(<SettingsDialog />);

    fireEvent.click([...container.querySelectorAll(".settings-tab")].find((b) => b.textContent === t("settings.appearance"))!);
    fireEvent.click([...container.querySelectorAll(".theme-card")].find((el) => el.textContent?.includes("Dracula"))!);
    expect(useRepoStore.getState().themePreset).toBe("dracula");

    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === t("settings.save"))!);
    await waitFor(() => expect(useRepoStore.getState().showSettings).toBe(false));
  });
});

describe("RepoGroupDialog", () => {
  it("creates a group and runs a batch checkout", async () => {
    installApi({
      batchCheckout: () => Promise.resolve({ success: true, data: { repo: "/r/a", ok: true, skipped: false, error: undefined, branchBefore: "main", branchAfter: "feat", stashed: false, restored: false, actions: ["checkout"] } }),
    });
    resetStore({ showRepoGroups: true, repos: [{ path: "/r/a", name: "Alpha" }] });
    const { container } = render(<RepoGroupDialog onClose={() => {}} />);

    const nameInput = [...container.querySelectorAll("input")].find((i) => (i as HTMLInputElement).placeholder === t("repoGroups.groupNamePlaceholder")) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "team" } });
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === t("repoGroups.addGroup"))!);
    await waitFor(() => expect(container.textContent).toContain("team"));

    const branchInput = [...container.querySelectorAll("input")].find((i) => (i as HTMLInputElement).placeholder === t("repoGroups.branchPlaceholder")) as HTMLInputElement;
    fireEvent.change(branchInput, { target: { value: "feat" } });
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === t("repoGroups.run"))!);
    await waitFor(() => expect(container.textContent).toContain("Alpha"));
  });
});

describe("Sidebar", () => {
  it("renders local branches and checks out on double-click", async () => {
    installApi({ checkout: () => Promise.resolve({ success: true }) });
    resetStore({ currentRepo: "/r", branches: ["main", "feature"], currentBranch: "main" });
    const { container } = render(<Sidebar />);
    const branchItems = [...container.querySelectorAll(".branch-item")];
    const feature = branchItems.find((el) => el.textContent?.includes("feature"))!;
    fireEvent.doubleClick(feature);
    await waitFor(() => expect(useRepoStore.getState().loading).toBe(false));
  });
});
