// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";
import DiffViewer from "../src/components/DiffViewer";
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

const SAMPLE_DIFF = "@@ -1,2 +1,2 @@\n a\n-b\n+c\n";

beforeEach(() => {
  setGlobalLocale("en");
  useRepoStore.setState({ currentRepo: "/r", loading: false, error: null });
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { gitAPI?: unknown }).gitAPI;
  setGlobalLocale("en");
});

describe("DiffViewer", () => {
  it("loads file history on the history tab", async () => {
    installApi({
      diffFile: () => Promise.resolve({ success: true, data: "" }),
      fileHistory: () => Promise.resolve({ success: true, data: [{ hash: "abc1234", shortHash: "abc1234", author: "A", email: "e", timestamp: 1, subject: "first commit" }] }),
    });
    const { container } = render(<DiffViewer filePath="f.txt" isStaged={false} onClose={() => {}} />);
    await waitFor(() => expect(container.querySelector(".diff-view-tab")).toBeTruthy());
    fireEvent.click([...container.querySelectorAll(".diff-view-tab")].find((b) => b.textContent === "History")!);
    await waitFor(() => expect(container.textContent).toContain("first commit"));
  });

  it("loads blame on the blame tab", async () => {
    installApi({
      diffFile: () => Promise.resolve({ success: true, data: "" }),
      blame: () => Promise.resolve({ success: true, data: [{ hash: "abc1234", shortHash: "abc1234", author: "A", email: "e", timestamp: 1, lineNumber: 1, content: "hello" }] }),
    });
    const { container } = render(<DiffViewer filePath="f.txt" isStaged={false} onClose={() => {}} />);
    await waitFor(() => expect(container.querySelector(".diff-view-tab")).toBeTruthy());
    fireEvent.click([...container.querySelectorAll(".diff-view-tab")].find((b) => b.textContent === "Blame")!);
    await waitFor(() => expect(container.textContent).toContain("hello"));
  });

  it("stages a hunk from an unstaged diff", async () => {
    const calls = installApi({
      diffFile: () => Promise.resolve({ success: true, data: SAMPLE_DIFF }),
      stageHunk: () => Promise.resolve({ success: true }),
    });
    const { container } = render(<DiffViewer filePath="f.txt" isStaged={false} onClose={() => {}} />);
    await waitFor(() => expect(container.querySelector(".diff-hunk")).toBeTruthy());
    fireEvent.click([...container.querySelectorAll(".diff-hunk-btn")].find((b) => b.textContent === t("diff.stageBtn"))!);
    await waitFor(() => expect(calls.some(([name]) => name === "stageHunk")).toBe(true));
  });

  it("unstages a hunk from a staged diff", async () => {
    const calls = installApi({
      diffFile: () => Promise.resolve({ success: true, data: SAMPLE_DIFF }),
      unstageHunk: () => Promise.resolve({ success: true }),
    });
    const { container } = render(<DiffViewer filePath="f.txt" isStaged={true} onClose={() => {}} />);
    await waitFor(() => expect(container.querySelector(".diff-hunk")).toBeTruthy());
    fireEvent.click([...container.querySelectorAll(".diff-hunk-btn")].find((b) => b.textContent === t("diff.unstageBtn"))!);
    await waitFor(() => expect(calls.some(([name]) => name === "unstageHunk")).toBe(true));
  });

  it("launches the external diff tool", async () => {
    const calls = installApi({
      diffFile: () => Promise.resolve({ success: true, data: SAMPLE_DIFF }),
      launchDiffTool: () => Promise.resolve({ success: true }),
    });
    const { container } = render(<DiffViewer filePath="f.txt" isStaged={false} onClose={() => {}} />);
    fireEvent.click([...container.querySelectorAll("button")].find((b) => b.textContent === t("diff.externalDiff"))!);
    await waitFor(() => expect(calls.some(([name]) => name === "launchDiffTool")).toBe(true));
  });

  it("renders a compare view without hunk actions", async () => {
    installApi({ compareFileDiff: () => Promise.resolve({ success: true, data: SAMPLE_DIFF }) });
    const { container } = render(
      <DiffViewer filePath="f.txt" isStaged={false} onClose={() => {}} compareFrom="main" compareTo="feat" />,
    );
    await waitFor(() => expect(container.querySelector(".diff-hunk")).toBeTruthy());
    expect(container.querySelector(".diff-badge")?.textContent).toBe("main ... feat");
    expect(container.querySelector(".diff-hunk-actions")?.querySelectorAll(".diff-hunk-btn").length).toBe(0);
  });
});
