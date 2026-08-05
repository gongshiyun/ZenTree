import { useState, useCallback, useMemo, useEffect } from "react";
import { useRepoStore } from "../application/repoStore";
import { useT } from "../i18n";
import { gitApi } from "../infrastructure/gitBridge";
import type { CompareResult } from "../types";

export default function CompareDialog() {
  const t = useT();
  const showCompare = useRepoStore((s) => s.showCompare);
  const setShowCompare = useRepoStore((s) => s.setShowCompare);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const branches = useRepoStore((s) => s.branches);
  const remoteBranches = useRepoStore((s) => s.remoteBranches);
  const tags = useRepoStore((s) => s.tags);
  const currentBranch = useRepoStore((s) => s.currentBranch);
  const compareBase = useRepoStore((s) => s.compareBase);
  const setCompareBase = useRepoStore((s) => s.setCompareBase);
  const setSelectedDiffFile = useRepoStore((s) => s.setSelectedDiffFile);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);

  const refs = useMemo(() => {
    const list = ["HEAD", ...branches, ...remoteBranches, ...tags.map((tg) => tg.name)];
    // A compare-from-here commit hash stays selectable while the dialog is open.
    if (compareBase && !list.includes(compareBase)) list.push(compareBase);
    return list.filter((v, i) => list.indexOf(v) === i);
  }, [branches, remoteBranches, tags, compareBase]);

  const [fromRef, setFromRef] = useState("HEAD");
  const [toRef, setToRef] = useState("");
  const [result, setResult] = useState<CompareResult | null>(null);

  // Graph "compare from here": prefill the from end and clear the marker.
  useEffect(() => {
    if (showCompare && compareBase) {
      setFromRef(compareBase);
      setCompareBase(null);
    }
  }, [showCompare, compareBase, setCompareBase]);

  const handleClose = useCallback(() => {
    setShowCompare(false);
    setCompareBase(null);
  }, [setShowCompare, setCompareBase]);

  const handleCompare = useCallback(async () => {
    if (!currentRepo || !fromRef || !toRef) return;
    setLoading(true, t("compare.comparing"));
    try {
      const r = await gitApi().compare(currentRepo, fromRef, toRef);
      if (r.success && r.data) setResult(r.data);
      else setError(r.error || t("compare.failed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, fromRef, toRef, setLoading, setError, t]);

  const handleOpenFile = useCallback((path: string) => {
    if (!fromRef || !toRef) return;
    setSelectedDiffFile({ path, isStaged: false, fromRef, toRef });
    setShowCompare(false);
  }, [fromRef, toRef, setSelectedDiffFile, setShowCompare]);

  if (!showCompare) return null;

  return (
    <div className="settings-overlay" onClick={handleClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{t("compare.title")}</h2>
          <button className="settings-close" onClick={handleClose}>
            <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5"/><line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-section">
            <div className="setting-row"><label>{t("compare.from")}</label>
              <select className="compare-select" value={fromRef} onChange={(e) => setFromRef(e.target.value)}>
                {refs.map((r) => <option key={"f" + r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="setting-row"><label>{t("compare.to")}</label>
              <select className="compare-select" value={toRef} onChange={(e) => setToRef(e.target.value)}>
                <option value="">{t("compare.selectTarget")}</option>
                {refs.map((r) => <option key={"t" + r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="compare-actions">
              <button className="settings-btn primary" disabled={!fromRef || !toRef || fromRef === toRef} onClick={handleCompare}>{t("compare.compare")}</button>
              {result && (
                <span className="setting-hint">
                  {t("compare.summary", String(result.ahead), String(result.behind), String(result.totalAdditions), String(result.totalDeletions))}
                </span>
              )}
            </div>
            {result && (
              <div className="compare-file-list">
                {result.files.map((f) => (
                  <div key={f.path} className="compare-file-item" onClick={() => handleOpenFile(f.path)} title={f.path}>
                    <span className={`file-status ${f.status}`}>{f.status}</span>
                    <span className="file-name">{f.path}</span>
                    <span className="compare-stats">
                      <span className="add">+{f.additions}</span>
                      <span className="del">-{f.deletions}</span>
                    </span>
                  </div>
                ))}
                {result.files.length === 0 && <div className="empty-state" style={{ padding: 12 }}>{t("compare.noDiff")}</div>}
              </div>
            )}
          </div>
        </div>
        <div className="settings-footer">
          <button className="settings-btn secondary" onClick={handleClose}>{t("clone.cancel")}</button>
        </div>
      </div>
    </div>
  );
}
