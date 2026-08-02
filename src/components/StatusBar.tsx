import { useT } from "../i18n";
import { useRepoStore } from "../application/repoStore";
import { gitApi } from "../infrastructure/gitBridge";

export default function StatusBar() {
  const t = useT();
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const currentBranch = useRepoStore((s) => s.currentBranch);
  const ongoing = useRepoStore((s) => s.ongoing);
  const loading = useRepoStore((s) => s.loading);
  const loadingMessage = useRepoStore((s) => s.loadingMessage);
  const error = useRepoStore((s) => s.error);
  const setError = useRepoStore((s) => s.setError);
  const status = useRepoStore((s) => s.status);
  const setLoading = useRepoStore((s) => s.setLoading);
  const refreshAll = useRepoStore((s) => s.refreshAll);

  const runOp = async (op: () => Promise<{ success: boolean; error?: string }>, label: string) => {
    if (!currentRepo) return;
    setLoading(true, label);
    try {
      const r = await op();
      if (r.success) await refreshAll();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  };

  return (
    <div className="status-bar">
      {currentRepo && (<span>{currentRepo} &middot; <strong>{currentBranch}</strong></span>)}
      {ongoing && (
        <span className="ongoing-op">
          <span className="ongoing-label">
            {ongoing === "rebase" ? t("status.rebasingOp") : ongoing === "merge" ? t("status.mergingOp") : t("status.cherryPickingOp")}
          </span>
          <button className="file-action-btn" onClick={() => runOp(
            ongoing === "rebase" ? () => gitApi().rebaseAbort(currentRepo!)
              : ongoing === "merge" ? () => gitApi().mergeAbort(currentRepo!)
                : () => gitApi().cherryPickAbort(currentRepo!), t("status.aborting"))}>{t("status.abort")}</button>
          <button className="file-action-btn primary" onClick={() => runOp(
            ongoing === "rebase" ? () => gitApi().rebaseContinue(currentRepo!)
              : ongoing === "merge" ? () => gitApi().mergeContinue(currentRepo!)
                : () => gitApi().cherryPickContinue(currentRepo!), t("status.continuing"))}>{t("status.continue")}</button>
        </span>
      )}
      {status && status.conflicted && status.conflicted.length > 0 && (
        <span className="conflict-badge" title={t("status.conflicts")}>{status.conflicted.length} {t("status.conflictLabel")}</span>
      )}
      <span style={{ flex: 1 }} />
      {loading && (<><span className="spinner" /><span>{loadingMessage}</span></>)}
      {error && (<span className="error" onClick={() => setError(null)} style={{ cursor: "pointer" }}>{"\u2715"} {error}</span>)}
    </div>
  );
}
