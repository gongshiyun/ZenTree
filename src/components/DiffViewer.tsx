import { useState, useEffect, useCallback, useMemo } from "react";
import { useRepoStore } from "../application/repoStore";
import { useT } from "../i18n";
import { highlightLine } from "../domain/diff/highlight";
import { parseDiff, buildHunkPatch } from "../domain/diff/parser";
import { gitApi } from "../infrastructure/gitBridge";
import type { DiffHunk } from "../types";

interface Props { filePath: string; isStaged: boolean; onClose: () => void; commitHash?: string; readOnly?: boolean; }

export default function DiffViewer({ filePath, isStaged, onClose, commitHash, readOnly }: Props) {
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const t = useT();
  const [diffText, setDiffText] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const hunks = useMemo(() => parseDiff(diffText), [diffText]);

  useEffect(() => {
    if (!currentRepo) return;
    setFetching(true); setFetchError("");
    (async () => {
      const r = commitHash ? await gitApi().commitFileDiff(currentRepo, commitHash, filePath) : await gitApi().diffFile(currentRepo, filePath, isStaged);
      if (r.success && r.data !== undefined) setDiffText(r.data);
      else setFetchError(r.error || t("diff.fetchFailed"));
      setFetching(false);
    })();
  }, [currentRepo, filePath, isStaged, refreshKey, commitHash]);

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

  const fileName = filePath.replace(/\\/g, "/");

  return (
    <div className="diff-viewer">
      <div className="diff-header">
        <button className="diff-back-btn" onClick={onClose}>{t("diff.back")}</button>
        <span className="diff-file-name">{fileName}</span>
        <span className="diff-badge">{commitHash ? t("diff.commit") : (isStaged ? t("diff.staged") : t("diff.unstaged"))}</span>
      </div>
      <div className="diff-content">
        {fetching && <div className="diff-empty"><span className="spinner" /> {t("diff.loading")}</div>}
        {fetchError && <div className="diff-empty" style={{color:"var(--danger)"}}>{fetchError}</div>}
        {!fetching && !fetchError && hunks.length===0 && diffText==="" && <div className="diff-empty">{t("diff.noChanges")}</div>}
        {!fetching && !fetchError && hunks.map((h, hi) => (
          <div key={hi} className="diff-hunk">
            <div className="diff-hunk-header">
              <span className="diff-hunk-label">{h.header}</span>
              <div className="diff-hunk-actions">
                {!readOnly && !isStaged && (<button className="diff-hunk-btn stage" onClick={()=>handleHunkAction(h,"stage")} title={t("diff.stageHunk")}>{t("diff.stageBtn")}</button>)}
                {!readOnly && isStaged && (<button className="diff-hunk-btn unstage" onClick={()=>handleHunkAction(h,"unstage")} title={t("diff.unstageHunk")}>{t("diff.unstageBtn")}</button>)}
                {!readOnly && !isStaged && (<button className="diff-hunk-btn revert" onClick={()=>handleHunkAction(h,"revert")} title={t("diff.revertHunk")}>{t("diff.revertBtn")}</button>)}
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
      </div>
    </div>
  );
}
