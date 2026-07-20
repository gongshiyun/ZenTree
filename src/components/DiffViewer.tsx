import { useState, useEffect, useCallback, useMemo } from "react";
import { useRepoStore } from "../stores/repoStore";
import type { DiffHunk, DiffLine } from "../types";

function parseDiff(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diffText.split("\n");
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)/);
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk);
      const oldStart = parseInt(hunkMatch[1], 10);
      const oldCount = parseInt(hunkMatch[2] || "1", 10);
      const newStart = parseInt(hunkMatch[3], 10);
      const newCount = parseInt(hunkMatch[4] || "1", 10);
      currentHunk = { header: hunkMatch[0], oldStart, oldCount, newStart, newCount, lines: [] };
      oldLine = oldStart;
      newLine = newStart;
    } else if (currentHunk) {
      if (line.startsWith("-")) {
        currentHunk.lines.push({ type: "deletion", content: line.substring(1), oldLineNum: oldLine++ });
      } else if (line.startsWith("+")) {
        currentHunk.lines.push({ type: "addition", content: line.substring(1), newLineNum: newLine++ });
      } else if (line.startsWith(" ") || line === "") {
        currentHunk.lines.push({ type: "context", content: line.startsWith(" ") ? line.substring(1) : line, oldLineNum: oldLine++, newLineNum: newLine++ });
      }
    }
  }
  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

function buildHunkPatch(filePath: string, hunk: DiffHunk): string {
  const lines = [`diff --git a/${filePath} b/${filePath}`, `--- a/${filePath}`, `+++ b/${filePath}`, hunk.header];
  for (const line of hunk.lines) {
    if (line.type === "addition") lines.push(`+${line.content}`);
    else if (line.type === "deletion") lines.push(`-${line.content}`);
    else lines.push(` ${line.content}`);
  }
  return lines.join("\n") + "\n";
}

interface Props { filePath: string; isStaged: boolean; onClose: () => void; }

export default function DiffViewer({ filePath, isStaged, onClose }: Props) {
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const refreshAll = useRepoStore((s) => s.refreshAll);

  const [diffText, setDiffText] = useState("");
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const hunks = useMemo(() => parseDiff(diffText), [diffText]);

  useEffect(() => {
    if (!currentRepo) return;
    setFetching(true);
    setFetchError("");
    (async () => {
      const result = await window.gitAPI.diffFile(currentRepo, filePath, isStaged);
      if (result.success && result.data !== undefined) {
        setDiffText(result.data);
      } else {
        setFetchError(result.error || "Failed to fetch diff");
      }
      setFetching(false);
    })();
  }, [currentRepo, filePath, isStaged]);

  const handleHunkAction = useCallback(async (hunk: DiffHunk, action: "stage" | "unstage" | "revert") => {
    if (!currentRepo) return;
    const patch = buildHunkPatch(filePath, hunk);
    setLoading(true, `${action === "stage" ? "Staging" : action === "unstage" ? "Unstaging" : "Reverting"} hunk...`);
    try {
      let result;
      if (action === "stage") result = await window.gitAPI.stageHunk(currentRepo, patch);
      else if (action === "unstage") result = await window.gitAPI.unstageHunk(currentRepo, patch);
      else result = await window.gitAPI.revertHunk(currentRepo, patch);
      if (result.success) await refreshAll();
      else setError(result.error || "Operation failed");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, filePath, setLoading, setError, refreshAll]);

  const fileName = filePath.replace(/\\/g, "/");

  return (
    <div className="diff-viewer">
      <div className="diff-header">
        <button className="diff-back-btn" onClick={onClose}>&larr; Back</button>
        <span className="diff-file-name">{fileName}</span>
        <span className="diff-badge">{isStaged ? "Staged" : "Unstaged"}</span>
      </div>
      <div className="diff-content">
        {fetching && <div className="diff-empty"><span className="spinner" /> Loading diff...</div>}
        {fetchError && <div className="diff-empty" style={{ color: "var(--danger)" }}>{fetchError}</div>}
        {!fetching && !fetchError && hunks.length === 0 && diffText === "" && (
          <div className="diff-empty">No changes (binary file or identical)</div>
        )}
        {!fetching && !fetchError && hunks.map((hunk, hi) => (
          <div key={hi} className="diff-hunk">
            <div className="diff-hunk-header">
              <span className="diff-hunk-label">{hunk.header}</span>
              <div className="diff-hunk-actions">
                {!isStaged && (
                  <button className="diff-hunk-btn stage" onClick={() => handleHunkAction(hunk, "stage")} title="Stage this hunk">Stage</button>
                )}
                {isStaged && (
                  <button className="diff-hunk-btn unstage" onClick={() => handleHunkAction(hunk, "unstage")} title="Unstage this hunk">Unstage</button>
                )}
                {!isStaged && (
                  <button className="diff-hunk-btn revert" onClick={() => handleHunkAction(hunk, "revert")} title="Revert this hunk">Revert</button>
                )}
              </div>
            </div>
            <div className="diff-hunk-lines">
              {hunk.lines.map((line, li) => (
                <div key={li} className={`diff-line ${line.type}`}>
                  <span className="diff-line-num old">{line.type !== "addition" ? line.oldLineNum : ""}</span>
                  <span className="diff-line-num new">{line.type !== "deletion" ? line.newLineNum : ""}</span>
                  <span className="diff-line-prefix">{line.type === "addition" ? "+" : line.type === "deletion" ? "-" : " "}</span>
                  <span className="diff-line-content">{line.content}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
