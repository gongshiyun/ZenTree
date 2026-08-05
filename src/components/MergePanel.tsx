import { useState, useEffect, useCallback } from "react";
import { useRepoStore } from "../application/repoStore";
import { useT } from "../i18n";
import { gitApi } from "../infrastructure/gitBridge";
import { parseConflictMarkers, type ConflictBlock } from "../domain/diff/conflictMarker";

interface Props {
  filePath: string;
  onClose: () => void;
}

type Side = "ours" | "theirs" | "both";

/**
 * Built-in lightweight three-way merge panel: shows ours / base / theirs and
 * lets the user resolve each conflict block with "take ours / take theirs /
 * keep both", then writes and stages the result. Binary or oversized files
 * fall back to the external mergetool entry.
 */
export default function MergePanel({ filePath, onClose }: Props) {
  const t = useT();
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const refreshAll = useRepoStore((s) => s.refreshAll);

  const [ours, setOurs] = useState("");
  const [theirs, setTheirs] = useState("");
  const [base, setBase] = useState<string | undefined>();
  const [conflicts, setConflicts] = useState<ConflictBlock[]>([]);
  const [workingText, setWorkingText] = useState("");
  const [showBase, setShowBase] = useState(false);
  const [choices, setChoices] = useState<Record<number, Side>>({});
  const [loadError, setLoadError] = useState("");
  const [hasConflicts, setHasConflicts] = useState(false);
  const [loading, setLocalLoading] = useState(true);

  useEffect(() => {
    if (!currentRepo) return;
    let cancelled = false;
    (async () => {
      try {
        const [working, oursRes, theirsRes, baseRes] = await Promise.all([
          gitApi().readWorkingFile(currentRepo, filePath),
          gitApi().showStage(currentRepo, 2, filePath),
          gitApi().showStage(currentRepo, 3, filePath),
          gitApi().showStage(currentRepo, 1, filePath),
        ]);
        if (cancelled) return;
        if (!oursRes.success || oursRes.data === undefined || !theirsRes.success || theirsRes.data === undefined) {
          setLoadError(oursRes.error || theirsRes.error || t("merge.loadFailed"));
          return;
        }
        const parsed = parseConflictMarkers(working.success && working.data !== undefined ? working.data : "");
        if (working.success && working.data !== undefined) setWorkingText(working.data);
        setOurs(oursRes.data);
        setTheirs(theirsRes.data);
        setBase(baseRes.success && baseRes.data !== undefined ? baseRes.data : undefined);
        setConflicts(parsed.blocks);
        setHasConflicts(parsed.hasConflicts);
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message || String(err));
      } finally {
        if (!cancelled) setLocalLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentRepo, filePath, t]);

  const choose = useCallback((index: number, side: Side) => {
    setChoices((prev) => ({ ...prev, [index]: side }));
  }, []);

  const resolutionFor = useCallback((block: ConflictBlock, index: number): string[] => {
    const side = choices[index] ?? "ours";
    if (side === "ours") return block.ours;
    if (side === "theirs") return block.theirs;
    return [...block.ours, ...block.theirs];
  }, [choices]);

  const handleSave = useCallback(async () => {
    if (!currentRepo) return;
    // Rebuild the resolved file by walking the working text and replacing
    // each conflict region with the chosen side (trailing lines preserved).
    const lines = workingText.split(/\r?\n/);
    const out: string[] = [];
    let blockIdx = 0;
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^<{7}(?!<)/.test(l)) {
        const block = conflicts[blockIdx];
        if (block) out.push(...resolutionFor(block, blockIdx));
        blockIdx++;
        // Skip the whole marker region (<<<<<<< ... >>>>>>>) in the working text.
        while (i < lines.length && !/^>{7}(?!>)/.test(lines[i])) i++;
        i++; // skip the >>>>>>> line itself
      } else {
        out.push(l);
        i++;
      }
    }

    setLoading(true, t("merge.saving"));
    try {
      const write = await gitApi().writeWorkingFile(currentRepo, filePath, out.join("\n") + "\n");
      if (!write.success) { setError(write.error || t("error.opFailed")); return; }
      const stage = await gitApi().stage(currentRepo, [filePath]);
      if (stage.success) { await refreshAll(); onClose(); }
      else setError(stage.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, filePath, workingText, conflicts, resolutionFor, setLoading, setError, refreshAll, onClose, t]);

  const fallbackToMergetool = useCallback(async () => {
    if (!currentRepo) return;
    setLoading(true, t("files.resolving").replace("{0}", filePath));
    try {
      const r = await gitApi().mergetool(currentRepo, filePath);
      if (r.success) onClose();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, filePath, setLoading, setError, onClose, t]);

  if (!currentRepo) return null;

  const renderLines = (text: string) => text.split("\n");

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog merge-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{t("merge.title")}</h2>
          <span className="merge-file-name" title={filePath}>{filePath}</span>
          <button className="settings-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5"/><line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>
        </div>
        <div className="settings-body">
          {loading && <div className="diff-empty"><span className="spinner" /> {t("diff.loading")}</div>}
          {loadError && !loading && (
            <div className="diff-empty merge-error">
              <div style={{ color: "var(--danger)" }}>{loadError}</div>
              <button className="settings-btn" onClick={fallbackToMergetool}>{t("merge.openExternal")}</button>
            </div>
          )}
          {!loading && !loadError && !hasConflicts && (
            <div className="diff-empty">{t("merge.noConflicts")}</div>
          )}
          {!loading && !loadError && hasConflicts && (
            <>
              <div className="merge-toolbar">
                <label className="merge-base-toggle">
                  <input type="checkbox" checked={showBase} onChange={(e) => setShowBase(e.target.checked)} />
                  {t("merge.showBase")}
                </label>
              </div>
              <div className="merge-columns">
                <div className="merge-column merge-col-ours"><div className="merge-col-head">{t("merge.ours")}</div>
                  {renderLines(ours).map((l, i) => <div key={i} className="merge-line">{l || "\u00A0"}</div>)}
                </div>
                {showBase && base !== undefined && (
                  <div className="merge-column merge-col-base"><div className="merge-col-head">{t("merge.base")}</div>
                    {renderLines(base).map((l, i) => <div key={i} className="merge-line">{l || "\u00A0"}</div>)}
                  </div>
                )}
                <div className="merge-column merge-col-theirs"><div className="merge-col-head">{t("merge.theirs")}</div>
                  {renderLines(theirs).map((l, i) => <div key={i} className="merge-line">{l || "\u00A0"}</div>)}
                </div>
              </div>
              <div className="merge-blocks">
                {conflicts.map((block, i) => (
                  <div key={i} className="merge-block">
                    <div className="merge-block-head">
                      <span>{t("merge.conflictBlock").replace("{0}", String(i + 1))}</span>
                      <div className="merge-block-actions">
                        <button className={`file-action-btn${choices[i] === "ours" ? " active" : ""}`} onClick={() => choose(i, "ours")}>{t("merge.takeOurs")}</button>
                        <button className={`file-action-btn${choices[i] === "theirs" ? " active" : ""}`} onClick={() => choose(i, "theirs")}>{t("merge.takeTheirs")}</button>
                        <button className={`file-action-btn${choices[i] === "both" ? " active" : ""}`} onClick={() => choose(i, "both")}>{t("merge.keepBoth")}</button>
                      </div>
                    </div>
                    <div className="merge-block-preview">
                      {resolutionFor(block, i).map((l, li) => <div key={li} className="merge-line">{l || "\u00A0"}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="settings-footer">
          <button className="settings-btn secondary" onClick={onClose}>{t("refName.cancel")}</button>
          <button className="settings-btn primary" disabled={!hasConflicts || loading} onClick={handleSave}>{t("merge.saveAndStage")}</button>
        </div>
      </div>
    </div>
  );
}
