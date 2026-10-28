import type { DiffHunk } from "../../types";

/**
 * Parse unified diff text into structured hunks.
 * Pure domain logic, no DOM or IPC dependencies.
 */
export function parseDiff(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  // A diff usually ends with a newline; splitting would otherwise append a
  // phantom empty context line (with bogus line numbers) to the last hunk.
  const rawLines = diffText.split("\n");
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") rawLines.pop();
  let cur: DiffHunk | null = null;
  let ol = 0, nl = 0;
  for (const line of rawLines) {
    const m = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)/);
    if (m) {
      if (cur) hunks.push(cur);
      cur = { header: m[0], oldStart: +m[1], oldCount: +(m[2] || 1), newStart: +m[3], newCount: +(m[4] || 1), lines: [] };
      ol = cur.oldStart; nl = cur.newStart;
    } else if (cur) {
      if (line.startsWith("-")) cur.lines.push({ type: "deletion", content: line.substring(1), oldLineNum: ol++ });
      else if (line.startsWith("+")) cur.lines.push({ type: "addition", content: line.substring(1), newLineNum: nl++ });
      else if (line === "\\ No newline at end of file" && cur.lines.length > 0) {
        cur.lines[cur.lines.length - 1].noNewline = true;
      }
      else if (line.startsWith(" ") || line === "") cur.lines.push({ type: "context", content: line.startsWith(" ") ? line.substring(1) : line, oldLineNum: ol++, newLineNum: nl++ });
    }
  }
  if (cur) hunks.push(cur);
  return hunks;
}

/** File-level context a hunk patch needs so `git apply` can target the right sides. */
export interface HunkPatchOptions {
  /** The hunk creates a file that is not in the index yet (untracked/new). */
  isNew?: boolean;
  /** The hunk removes a tracked file from the index/worktree. */
  isDeleted?: boolean;
  /** Original path of a rename, so both patch sides name the right file. */
  fromPath?: string;
}

/**
 * Rebuild a minimal unified patch for a single hunk (used for stage/unstage/revert).
 *
 * `git apply` needs the real file-level prelude — `/dev/null` on one side plus
 * the mode line for added/deleted files, and both paths for renames — otherwise
 * new-file staging and deleted-file reverting fail with
 * "does not exist in index" / "No such file or directory".
 */
export function buildHunkPatch(filePath: string, h: DiffHunk, options: HunkPatchOptions = {}): string {
  const { isNew = false, isDeleted = false, fromPath } = options;
  const oldPath = fromPath || filePath;
  const ls: string[] = [`diff --git a/${oldPath} b/${filePath}`];
  if (isNew) {
    ls.push("new file mode 100644", "--- /dev/null", `+++ b/${filePath}`);
  } else if (isDeleted) {
    ls.push("deleted file mode 100644", `--- a/${oldPath}`, "+++ /dev/null");
  } else if (fromPath && fromPath !== filePath) {
    ls.push(`rename from ${fromPath}`, `rename to ${filePath}`, `--- a/${oldPath}`, `+++ b/${filePath}`);
  } else {
    ls.push(`--- a/${filePath}`, `+++ b/${filePath}`);
  }
  ls.push(h.header);
  for (const l of h.lines) {
    ls.push(l.type === "addition" ? "+" + l.content : l.type === "deletion" ? "-" + l.content : " " + l.content);
    if (l.noNewline) ls.push("\\ No newline at end of file");
  }
  return ls.join("\n") + "\n";
}
