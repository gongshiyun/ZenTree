/**
 * Minimal conflict-marker parser for the built-in three-way merge panel.
 * Supports both `merge` style (<<<<<<< / ======= / >>>>>>>) and `diff3`
 * style (additional ||||||| base section). Pure logic, no I/O.
 */

export interface ConflictBlock {
  /** Lines preceding this conflict block (rendered as context). */
  before: string[];
  ours: string[];
  theirs: string[];
  /** Present when the file was resolved with diff3 style. */
  base?: string[];
}

export interface ConflictParseResult {
  blocks: ConflictBlock[];
  hasConflicts: boolean;
}

const START_MARKER = /^<{7}(?!<)/;
const SEP_MARKER = /^={7}(?!=)/;
const END_MARKER = /^>{7}(?!>)/;
const BASE_MARKER = /^\|{7}(?!\|)/;

export function parseConflictMarkers(content: string): ConflictParseResult {
  const lines = content.split(/\r?\n/);
  const blocks: ConflictBlock[] = [];
  let before: string[] = [];
  let hasConflicts = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!START_MARKER.test(line)) {
      before.push(line);
      i++;
      continue;
    }

    hasConflicts = true;
    const ours: string[] = [];
    const theirs: string[] = [];
    let base: string[] | undefined;
    let section: "ours" | "base" | "theirs" = "ours";
    i++;
    let closed = false;

    while (i < lines.length) {
      const l = lines[i];
      if (SEP_MARKER.test(l)) {
        section = "theirs";
        i++;
        continue;
      }
      if (BASE_MARKER.test(l)) {
        section = "base";
        base = [];
        i++;
        continue;
      }
      if (END_MARKER.test(l)) {
        closed = true;
        i++;
        break;
      }
      if (section === "ours") ours.push(l);
      else if (section === "base") base!.push(l);
      else theirs.push(l);
      i++;
    }

    blocks.push({ before, ours, theirs, base });
    before = [];
    // Malformed tail (no closing marker): stop scanning to avoid mis-parsing
    // the remainder of the file as more conflicts.
    if (!closed) break;
  }

  return { blocks, hasConflicts };
}
