import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useRepoStore } from "../application/repoStore";
import { useT } from "../i18n";
import { highlightLine } from "../domain/diff/highlight";
import { parseDiff, buildHunkPatch } from "../domain/diff/parser";
import { buildUntrackedDiff } from "../domain/diff/untracked";
import { diffWords, type WordToken } from "../domain/diff/worddiff";
import { gitApi } from "../infrastructure/gitBridge";
import type { DiffHunk, FileHistoryEntry, BlameLine } from "../types";

interface Props {
  filePath: string;
  isStaged: boolean;
  status?: string;
  fromPath?: string;
  onClose: () => void;
  commitHash?: string;
  readOnly?: boolean;
  compareFrom?: string;
  compareTo?: string;
  /** Pre-fetched diff text (e.g. stash preview); skips the IPC fetch. */
  rawDiff?: string;
}

type ViewMode = "diff" | "history" | "blame";

/** Quiet centered empty/loading state: glyph, title, optional description. */
function EmptyState({ icon, title, description, tone }: { icon?: ReactNode; title: string; description?: string; tone?: "danger" }) {
  return (
    <div className={`diff-empty-state${tone === "danger" ? " is-error" : ""}`}>
      <span className="empty-icon" aria-hidden="true">
        {icon ?? (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M5 2.5h7.5L17 6.9v12.6H5V2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M12.25 2.75v4.5h4.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="empty-title">{title}</span>
      {description && <span className="empty-desc">{description}</span>}
    </div>
  );
}

export default function DiffViewer({ filePath, isStaged, status, fromPath, onClose, commitHash, readOnly, compareFrom, compareTo, rawDiff }: Props) {
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const t = useT();
  const [diffText, setDiffText] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [view, setView] = useState<ViewMode>("diff");
  const [diffCommit, setDiffCommit] = useState<string | undefined>(commitHash);
  const [history, setHistory] = useState<FileHistoryEntry[]>([]);
  const [blame, setBlame] = useState<BlameLine[]>([]);
  const hunks = useMemo(() => parseDiff(diffText), [diffText]);
  const wordPairs = useMemo(() => {
    const map = new Map<number, { del: WordToken[]; add: WordToken[] }>();
    for (const h of hunks) {
      let pendingDel: number[] = [];
      h.lines.forEach((l, idx) => {
        if (l.type === "deletion") {
          pendingDel.push(idx);
        } else if (l.type === "addition" && pendingDel.length > 0) {
          const delIdx = pendingDel.pop()!;
          const pair = diffWords(h.lines[delIdx].content, l.content);
          map.set(delIdx, pair);
          map.set(idx, pair);
        } else if (l.type !== "addition") {
          pendingDel = [];
        }
      });
    }
    return map;
  }, [hunks]);
  const diffStats = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const h of hunks) {
      for (const l of h.lines) {
        if (l.type === "addition") add++;
        else if (l.type === "deletion") del++;
      }
    }
    return { add, del };
  }, [hunks]);
  const isCompare = !!(compareFrom && compareTo);
  const isUntracked = status === "untracked";

  useEffect(() => {
    setView("diff");
    setDiffCommit(commitHash);
    setHistory([]);
    setBlame([]);
  }, [filePath, commitHash]);

  // Fetch the active diff (rawDiff bypasses IPC entirely)
  useEffect(() => {
    if (!currentRepo) return;
    if (rawDiff !== undefined) {
      setDiffText(rawDiff);
      setFetching(false);
      setFetchError("");
      return;
    }
    let cancelled = false;
    setFetching(true); setFetchError("");
    (async () => {
      try {
        let r;
        if (isCompare) r = await gitApi().compareFileDiff(currentRepo, compareFrom!, compareTo!, filePath);
        else if (diffCommit) r = await gitApi().commitFileDiff(currentRepo, diffCommit, filePath);
        else if (isUntracked) r = await gitApi().readWorkingFile(currentRepo, filePath);
        else r = await gitApi().diffFile(currentRepo, filePath, isStaged, fromPath);
        if (cancelled) return;
        if (r.success && r.data !== undefined) setDiffText(isUntracked ? buildUntrackedDiff(filePath, r.data) : r.data);
        else setFetchError(r.error || t("diff.fetchFailed"));
      } catch (err: any) {
        if (!cancelled) setFetchError(err?.message || t("diff.fetchFailed"));
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentRepo, filePath, isStaged, status, fromPath, refreshKey, diffCommit, isCompare, compareFrom, compareTo, rawDiff]);

  // Load history / blame data when those tabs are opened
  useEffect(() => {
    if (!currentRepo || view !== "history") return;
    let cancelled = false;
    (async () => {
      const r = await gitApi().fileHistory(currentRepo, filePath, 200);
      if (!cancelled && r.success && r.data) setHistory(r.data);
    })();
    return () => { cancelled = true; };
  }, [currentRepo, filePath, view]);

  useEffect(() => {
    if (!currentRepo || view !== "blame") return;
    let cancelled = false;
    (async () => {
      const r = await gitApi().blame(currentRepo, filePath, diffCommit);
      if (!cancelled && r.success && r.data) setBlame(r.data);
    })();
    return () => { cancelled = true; };
  }, [currentRepo, filePath, view, diffCommit]);

  const handleHunkAction = useCallback(async (h: DiffHunk, action: "stage"|"unstage"|"revert") => {
    if (!currentRepo) return;
    // Hunk patches must know whether the file is new/deleted/renamed so the
    // patch prelude matches what `git apply` expects.
    const patch = buildHunkPatch(filePath, h, {
      isNew: status === "untracked" || status === "added",
      isDeleted: status === "deleted",
      fromPath,
    });
    setLoading(true, action==="stage"?t("diff.stagingHunk"):action==="unstage"?t("diff.unstagingHunk"):t("diff.revertingHunk"));
    try {
      let r;
      if (action==="stage") r = await gitApi().stageHunk(currentRepo, patch);
      else if (action==="unstage") r = await gitApi().unstageHunk(currentRepo, patch);
      else r = await gitApi().revertHunk(currentRepo, patch);
      if (r.success) { await refreshAll(); setRefreshKey(k=>k+1); }
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, filePath, setLoading, setError, refreshAll]);

  const handleExternalDiff = useCallback(async () => {
    if (!currentRepo) return;
    setLoading(true, t("diff.openingDiffTool"));
    try {
      const r = await gitApi().launchDiffTool(currentRepo, filePath);
      if (!r.success) setError(r.error || t("diff.fetchFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, filePath, setLoading, setError, t]);

  const handleHistoryClick = useCallback((entry: FileHistoryEntry) => {
    setDiffCommit(entry.hash);
    setView("diff");
  }, []);

  const handleBlameClick = useCallback((line: BlameLine) => {
    setDiffCommit(line.hash);
    setView("diff");
  }, []);

  const fileName = filePath.replace(/\\/g, "/");

  const showTabs = !isCompare && rawDiff === undefined;

  return (
    <div className="diff-viewer">
      <div className="diff-header">
        <div className="diff-header-main">
          <button className="diff-back-btn" onClick={onClose} title={t("diff.back")}>{t("diff.back")}</button>
          <span className="diff-file-name" title={fileName}>{fileName}</span>
          <span className="diff-badge">
            {isCompare ? `${compareFrom} ... ${compareTo}` : diffCommit ? t("diff.commit") : (isStaged ? t("diff.staged") : t("diff.unstaged"))}
          </span>
        </div>
        <div className="diff-header-sub">
          {showTabs ? (
            <div className="diff-view-tabs" role="tablist">
              <button className={`diff-view-tab${view === "diff" ? " active" : ""}`} role="tab" aria-selected={view === "diff"} onClick={() => setView("diff")}>{t("diff.viewDiff")}</button>
              <button className={`diff-view-tab${view === "history" ? " active" : ""}`} role="tab" aria-selected={view === "history"} onClick={() => setView("history")}>{t("diff.viewHistory")}</button>
              <button className={`diff-view-tab${view === "blame" ? " active" : ""}`} role="tab" aria-selected={view === "blame"} onClick={() => setView("blame")}>{t("diff.viewBlame")}</button>
            </div>
          ) : (
            <span className="diff-header-spacer" />
          )}
          <div className="diff-header-actions">
            {(diffStats.add > 0 || diffStats.del > 0) && (
              <span className="diff-file-stats" aria-hidden="true">
                <span className="stat-add">+{diffStats.add}</span>
                <span className="stat-del">-{diffStats.del}</span>
              </span>
            )}
            {!diffCommit && !isCompare && !readOnly && (
              <button className="diff-hunk-btn diff-external-btn" onClick={handleExternalDiff} title={t("diff.externalDiff")}>{t("diff.externalDiff")}</button>
            )}
          </div>
        </div>
      </div>
      <div className="diff-content">
        {view === "history" && (
          <div className="file-history-list">
            {history.map((h) => (
              <div key={h.hash} className="file-history-item" onClick={() => handleHistoryClick(h)}>
                <div className="file-history-line">
                  <span className="file-history-hash">{h.shortHash}</span>
                  <span className="file-history-subject">{h.subject}</span>
                </div>
                <div className="file-history-meta">
                  <span className="file-history-author">{h.author}</span>
                  <span className="file-history-sep" aria-hidden="true">&middot;</span>
                  <span className="file-history-time">{new Date(h.timestamp * 1000).toLocaleString()}</span>
                </div>
              </div>
            ))}
            {history.length === 0 && <EmptyState title={t("diff.noHistory")} description={filePath} />}
          </div>
        )}
        {view === "blame" && (
          <div className="blame-view">
            {blame.map((line, i) => (
              <div key={i} className="blame-line" onClick={() => handleBlameClick(line)} title={line.subject}>
                <span className="blame-hash">{line.shortHash}</span>
                <span className="blame-author">{line.author}</span>
                <span className="blame-line-num">{line.lineNumber}</span>
                <span className="blame-content">{line.content}</span>
              </div>
            ))}
            {blame.length === 0 && <EmptyState title={t("diff.noBlame")} description={filePath} />}
          </div>
        )}
        {view === "diff" && (
          <>
            {fetching && <EmptyState icon={<span className="spinner" />} title={t("diff.loading")} />}
            {fetchError && <EmptyState tone="danger" title={fetchError} description={fileName} />}
            {!fetching && !fetchError && hunks.length === 0 && <EmptyState title={t("diff.noChanges")} description={fileName} />}
            {!fetching && !fetchError && hunks.map((h, hi) => {
              const hunkAdd = h.lines.reduce((n, l) => n + (l.type === "addition" ? 1 : 0), 0);
              const hunkDel = h.lines.reduce((n, l) => n + (l.type === "deletion" ? 1 : 0), 0);
              return (
                <div key={hi} className="diff-hunk">
                  <div className="diff-hunk-header">
                    <span className="diff-hunk-label">{h.header}</span>
                    {(hunkAdd > 0 || hunkDel > 0) && (
                      <span className="diff-hunk-counts" aria-hidden="true">
                        {hunkAdd > 0 && <span className="stat-add">+{hunkAdd}</span>}
                        {hunkDel > 0 && <span className="stat-del">-{hunkDel}</span>}
                      </span>
                    )}
                    <div className="diff-hunk-actions">
                      {!readOnly && !isCompare && !isStaged && (<button className="diff-hunk-btn stage" onClick={()=>handleHunkAction(h,"stage")} title={t("diff.stageHunk")}>{t("diff.stageBtn")}</button>)}
                      {!readOnly && !isCompare && isStaged && (<button className="diff-hunk-btn unstage" onClick={()=>handleHunkAction(h,"unstage")} title={t("diff.unstageHunk")}>{t("diff.unstageBtn")}</button>)}
                      {/* Reverting a brand-new file has no previous content to restore;
                          discarding it is the file panel's job. */}
                      {!readOnly && !isCompare && !isStaged && !isUntracked && (<button className="diff-hunk-btn revert" onClick={()=>handleHunkAction(h,"revert")} title={t("diff.revertHunk")}>{t("diff.revertBtn")}</button>)}
                    </div>
                  </div>
                  <div className="diff-hunk-lines">
                    {h.lines.map((l, li) => (
                      <div key={li} className={`diff-line ${l.type}`}>
                        <span className="diff-line-num old">{l.type!=="addition"?l.oldLineNum:""}</span>
                        <span className="diff-line-num new">{l.type!=="deletion"?l.newLineNum:""}</span>
                        <span className="diff-line-prefix">{l.type==="addition"?"+":l.type==="deletion"?"-":" "}</span>
                        <span className="diff-line-content">
                          {wordPairs.has(li) && l.type !== "context"
                            ? (l.type === "deletion"
                              ? wordPairs.get(li)!.del.map((tok, ti) => <span key={ti} className={tok.type === "del" ? "word-del" : ""}>{tok.text}</span>)
                              : wordPairs.get(li)!.add.map((tok, ti) => <span key={ti} className={tok.type === "add" ? "word-add" : ""}>{tok.text}</span>))
                            : highlightLine(l.content, filePath).map((tok, ti) => tok.cls ? <span key={ti} className={`syn-${tok.cls}`}>{tok.text}</span> : <span key={ti}>{tok.text}</span>)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
