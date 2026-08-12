import { describe, it, expect } from "vitest";
import { parseDiff, buildHunkPatch } from "../src/domain/diff/parser";
import { buildUntrackedDiff } from "../src/domain/diff/untracked";
import { buildFileTree } from "../src/domain/files/tree";
import { diffWords } from "../src/domain/diff/worddiff";

describe("parseDiff edge cases", () => {
  it("parses multiple hunks into separate blocks", () => {
    const diff = [
      "@@ -1,1 +1,1 @@",
      " a",
      "@@ -10,1 +10,1 @@",
      " b",
    ].join("\n");
    const hunks = parseDiff(diff);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].oldStart).toBe(1);
    expect(hunks[1].oldStart).toBe(10);
  });

  it("defaults omitted hunk counts to one", () => {
    const hunks = parseDiff("@@ -0,0 +1 @@\n+hello\n");
    expect(hunks).toHaveLength(1);
    expect(hunks[0].newCount).toBe(1);
    expect(hunks[0].lines[0].type).toBe("addition");
  });

  it("ignores the no-newline marker line", () => {
    const diff = [
      "@@ -1,1 +1,2 @@",
      " a",
      "+b",
      "\\ No newline at end of file",
    ].join("\n");
    const hunks = parseDiff(diff);
    expect(hunks[0].lines).toHaveLength(2);
  });
});

describe("buildHunkPatch reconstruction", () => {
  it("prefixes deletion, addition and context lines correctly", () => {
    const hunks = parseDiff("@@ -1,2 +1,2 @@\n a\n-b\n+c\n");
    const patch = buildHunkPatch("f.txt", hunks[0]);
    const lines = patch.split("\n");
    expect(lines).toContain("-b");
    expect(lines).toContain("+c");
    expect(lines).toContain(" a");
  });
});

describe("buildUntrackedDiff edge cases", () => {
  it("does not add a phantom empty line when content has no trailing newline", () => {
    const diff = buildUntrackedDiff("new.txt", "a\nb");
    expect(diff).toContain("@@ -0,0 +1,2 @@");
    expect(diff).toContain("+a");
    expect(diff).toContain("+b");
  });
});

describe("buildFileTree edge cases", () => {
  it("deduplicates the same path and ignores empty segments", () => {
    const tree = buildFileTree(["a//b.txt", "a/b.txt", ""]);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("a");
    expect(tree[0].children).toHaveLength(1);
  });
});

describe("diffWords edge cases", () => {
  it("handles punctuation-only differences", () => {
    const { del, add } = diffWords("a b!", "a b?");
    expect(del.some((t) => t.type === "del" && t.text.trim() === "b!")).toBe(true);
    expect(add.some((t) => t.type === "add" && t.text.trim() === "b?")).toBe(true);
  });

  it("keeps leading/trailing whitespace attached to tokens", () => {
    const { del } = diffWords("one two", "one two");
    expect(del.every((t) => t.type === "same")).toBe(true);
    expect(del.map((t) => t.text).join("")).toBe("one two");
  });
});
