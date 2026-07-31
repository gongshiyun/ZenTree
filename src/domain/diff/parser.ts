import type { DiffHunk } from "../../types";

/**
 * Parse unified diff text into structured hunks.
 * Pure domain logic, no DOM or IPC dependencies.
 */
export function parseDiff(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diffText.split("\n");
  let cur: DiffHunk | null = null;
  let ol = 0, nl = 0;
  for (const line of lines) {
    const m = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)/);
    if (m) {
      if (cur) hunks.push(cur);
      cur = { header: m[0], oldStart: +m[1], oldCount: +(m[2] || 1), newStart: +m[3], newCount: +(m[4] || 1), lines: [] };
      ol = cur.oldStart; nl = cur.newStart;
    } else if (cur) {
      if (line.startsWith("-")) cur.lines.push({ type: "deletion", content: line.substring(1), oldLineNum: ol++ });
      else if (line.startsWith("+")) cur.lines.push({ type: "addition", content: line.substring(1), newLineNum: nl++ });
      else if (line.startsWith(" ") || line === "") cur.lines.push({ type: "context", content: line.startsWith(" ") ? line.substring(1) : line, oldLineNum: ol++, newLineNum: nl++ });
    }
  }
  if (cur) hunks.push(cur);
  return hunks;
}

/** Rebuild a minimal unified patch for a single hunk (used for stage/unstage/revert). */
export function buildHunkPatch(filePath: string, h: DiffHunk): string {
  const ls = [`diff --git a/${filePath} b/${filePath}`, `--- a/${filePath}`, `+++ b/${filePath}`, h.header];
  for (const l of h.lines) ls.push(l.type === "addition" ? "+" + l.content : l.type === "deletion" ? "-" + l.content : " " + l.content);
  return ls.join("\n") + "\n";
}
