import { useState, useEffect, useCallback, useMemo } from "react";
import { useRepoStore } from "../application/repoStore";
import { useT } from "../i18n";
import { highlightLine } from "../domain/diff/highlight";
import { parseDiff, buildHunkPatch } from "../domain/diff/parser";
import { gitApi } from "../infrastructure/gitBridge";
import type { DiffHunk, FileHistoryEntry, BlameLine } from "../types";

interface Props {
  filePath: string;
  isStaged: boolean;
  onClose: () => void;
  commitHash?: string;
  readOnly?: boolean;
  compareFrom?: string;
  compareTo?: string;
}

type ViewMode = "diff" | "history" | "blame";

export default function DiffViewer({ filePath, isStaged, onClose, commitHash, readOnly, compareFrom, compareTo }: Props) {
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
  const isCompare = !!(compareFrom && compareTo);

  useEffect(() => {
    setView("diff");
    setDiffCommit(commitHash);
    setHistory([]);
    setBlame([]);
  }, [filePath, commitHash]);

  // Fetch the active diff
  useEffect(() => {
    if (!currentRepo) return;
    setFetching(true); setFetchError("");
    (async () => {
      let r;
      if (isCompare) r = await gitApi().compareFileDiff(currentRepo, compareFrom!, compareTo!, filePath);
      else if (diffCommit) r = await gitApi().commitFileDiff(currentRepo, diffCommit, filePath);
      else r = await gitApi().diffFile(currentRepo, filePath, isStaged);
      if (r.success && r.data !== undefined) setDiffText(r.data);
      else setFetchError(r.error || t("diff.fetchFailed"));
      setFetching(false);
    })();
  }, [currentRepo, filePath, isStaged, refreshKey, diffCommit, isCompare, compareFrom, compareTo]);

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
    const patch = buildHunkPatch(filePath, h);
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

  const handleHistoryClick = useCallback((entry: FileHistoryEntry) => {
    setDiffCommit(entry.hash);
    setView("diff");
  }, []);

  const handleBlameClick = useCallback((line: BlameLine) => {
    setDiffCommit(line.hash);
    setView("diff");
  }, []);

  const fileName = filePath.replace(/\\/g, "/");

  const showTabs = !isCompare;

  return (
    <div className="diff-viewer">
      <div className="diff-header">
        <button className="diff-back-btn" onClick={onClose}>{t("diff.back")}</button>
        <span className="diff-file-name">{fileName}</span>
        {showTabs && (
          <div className="diff-view-tabs">
            <button className={`diff-view-tab${view === "diff" ? " active" : ""}`} onClick={() => setView("diff")}>{t("diff.viewDiff")}</button>
            <button className={`diff-view-tab${view === "history" ? " active" : ""}`} onClick={() => setView("history")}>{t("diff.viewHistory")}</button>
            <button className={`diff-view-tab${view === "blame" ? " active" : ""}`} onClick={() => setView("blame")}>{t("diff.viewBlame")}</button>
          </div>
        )}
        <span className="diff-badge">
          {isCompare ? `${compareFrom} ... ${compareTo}` : diffCommit ? t("diff.commit") : (isStaged ? t("diff.staged") : t("diff.unstaged"))}
        </span>
      </div>
      <div className="diff-content">
        {view === "history" && (
          <div className="file-history-list">
            {history.map((h) => (
              <div key={h.hash} className="file-history-item" onClick={() => handleHistoryClick(h)}>
                <div className="file-history-subject">{h.subject}</div>
                <div className="file-history-meta">{h.shortHash} &middot; {h.author} &middot; {new Date(h.timestamp * 1000).toLocaleString()}</div>
              </div>
            ))}
            {history.length === 0 && <div className="diff-empty">{t("diff.noHistory")}</div>}
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
            {blame.length === 0 && <div className="diff-empty">{t("diff.noBlame")}</div>}
          </div>
        )}
        {view === "diff" && (
          <>
            {fetching && <div className="diff-empty"><span className="spinner" /> {t("diff.loading")}</div>}
            {fetchError && <div className="diff-empty" style={{color:"var(--danger)"}}>{fetchError}</div>}
            {!fetching && !fetchError && hunks.length===0 && diffText==="" && <div className="diff-empty">{t("diff.noChanges")}</div>}
            {!fetching && !fetchError && hunks.map((h, hi) => (
              <div key={hi} className="diff-hunk">
                <div className="diff-hunk-header">
                  <span className="diff-hunk-label">{h.header}</span>
                  <div className="diff-hunk-actions">
                    {!readOnly && !isCompare && !isStaged && (<button className="diff-hunk-btn stage" onClick={()=>handleHunkAction(h,"stage")} title={t("diff.stageHunk")}>{t("diff.stageBtn")}</button>)}
                    {!readOnly && !isCompare && isStaged && (<button className="diff-hunk-btn unstage" onClick={()=>handleHunkAction(h,"unstage")} title={t("diff.unstageHunk")}>{t("diff.unstageBtn")}</button>)}
                    {!readOnly && !isCompare && !isStaged && (<button className="diff-hunk-btn revert" onClick={()=>handleHunkAction(h,"revert")} title={t("diff.revertHunk")}>{t("diff.revertBtn")}</button>)}
                  </div>
                </div>
                <div className="diff-hunk-lines">
                  {h.lines.map((l, li) => (
                    <div key={li} className={`diff-line ${l.type}`}>
                      <span className="diff-line-num old">{l.type!=="addition"?l.oldLineNum:""}</span>
                      <span className="diff-line-num new">{l.type!=="deletion"?l.newLineNum:""}</span>
                      <span className="diff-line-prefix">{l.type==="addition"?"+":l.type==="deletion"?"-":" "}</span>
                      <span className="diff-line-content">{highlightLine(l.content, filePath).map((tok, ti) => tok.cls ? <span key={ti} className={`syn-${tok.cls}`}>{tok.text}</span> : <span key={ti}>{tok.text}</span>)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
