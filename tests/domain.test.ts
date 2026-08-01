import { describe, it, expect } from "vitest";
import { parseDiff, buildHunkPatch } from "../src/domain/diff/parser";
import { highlightLine } from "../src/domain/diff/highlight";
import { buildUntrackedDiff } from "../src/domain/diff/untracked";
import { buildGraphData } from "../src/domain/graph/layout";
import type { CommitLogEntry } from "../src/types";

const sampleDiff = `diff --git a/hello.txt b/hello.txt
index 1234567..89abcde 100644
--- a/hello.txt
+++ b/hello.txt
@@ -1,3 +1,4 @@
 line one
-line two
+line two changed
+line three
 line four`;

describe("parseDiff", () => {
  it("parses a unified diff into hunks with line numbers", () => {
    const hunks = parseDiff(sampleDiff);
    expect(hunks).toHaveLength(1);
    const h = hunks[0];
    expect(h.oldStart).toBe(1);
    expect(h.oldCount).toBe(3);
    expect(h.newStart).toBe(1);
    expect(h.newCount).toBe(4);
    expect(h.lines).toHaveLength(5);
    expect(h.lines[0].type).toBe("context");
    expect(h.lines[0].oldLineNum).toBe(1);
    expect(h.lines[0].newLineNum).toBe(1);
    expect(h.lines[1].type).toBe("deletion");
    expect(h.lines[1].content).toBe("line two");
    expect(h.lines[2].type).toBe("addition");
    expect(h.lines[2].content).toBe("line two changed");
  });

  it("returns empty array for empty diff", () => {
    expect(parseDiff("")).toEqual([]);
  });

  it("handles binary / non-hunk diffs gracefully", () => {
    expect(parseDiff("Binary files differ\n")).toEqual([]);
  });
});

describe("buildHunkPatch", () => {
  it("reconstructs a patch that git can apply", () => {
    const hunks = parseDiff(sampleDiff);
    const patch = buildHunkPatch("hello.txt", hunks[0]);
    expect(patch).toContain("diff --git a/hello.txt b/hello.txt");
    expect(patch).toContain("--- a/hello.txt");
    expect(patch).toContain("+++ b/hello.txt");
    expect(patch).toContain("@@ -1,3 +1,4 @@");
    expect(patch).toContain("+line three");
  });
});

describe("buildUntrackedDiff", () => {
  it("builds a diff showing the whole file as additions", () => {
    const diff = buildUntrackedDiff("new.txt", "line one\nline two\n");
    expect(diff).toContain("new file mode 100644");
    expect(diff).toContain("--- /dev/null");
    expect(diff).toContain("+++ b/new.txt");
    expect(diff).toContain("@@ -0,0 +1,2 @@");
    expect(diff).toContain("+line one");
    expect(diff).toContain("+line two");
    const hunks = parseDiff(diff);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].lines.map((l) => l.type)).toEqual(["addition", "addition"]);
  });

  it("normalizes CRLF line endings", () => {
    const diff = buildUntrackedDiff("win.txt", "a\r\nb\r\n");
    expect(diff).not.toContain("\r");
    expect(diff).toContain("+a");
    expect(diff).toContain("+b");
  });

  it("produces a parseable diff for empty content", () => {
    const diff = buildUntrackedDiff("empty.txt", "");
    expect(parseDiff(diff)).toHaveLength(1);
  });
});

describe("highlightLine", () => {
  it("returns tokens for code content", () => {
    const tokens = highlightLine("const x: number = 42;", "test.ts");
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.some((tk) => tk.text.length > 0)).toBe(true);
  });

  it("handles plain text without crashing", () => {
    const tokens = highlightLine("just some plain words", "README.md");
    expect(Array.isArray(tokens)).toBe(true);
  });
});

describe("buildGraphData", () => {
  function entry(hash: string, parents: string[]): CommitLogEntry {
    return { hash, shortHash: hash.slice(0, 7), parents, author: "A", email: "a@b.c", timestamp: 0, subject: hash };
  }

  it("builds a linear graph with nodes and edges", () => {
    const entries = [entry("c3", ["c2"]), entry("c2", ["c1"]), entry("c1", [])];
    const graph = buildGraphData(entries);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges.length).toBeGreaterThanOrEqual(2);
    expect(graph.maxLane).toBeGreaterThanOrEqual(1);
  });

  it("handles a merge commit with two parents", () => {
    const entries = [entry("merge", ["a", "b"]), entry("a", []), entry("b", [])];
    const graph = buildGraphData(entries);
    expect(graph.nodes).toHaveLength(3);
  });

  it("handles empty input", () => {
    const graph = buildGraphData([]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});
