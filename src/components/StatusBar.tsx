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

  const ongoingLabel = ongoing === "rebase"
    ? t("status.rebasingOp")
    : ongoing === "merge"
      ? t("status.mergingOp")
      : t("status.cherryPickingOp");

  return (
    <div className="status-bar">
      <div className="status-left">
        {currentRepo && (
          <span className="status-repo">
            <span className="status-repo-path" title={currentRepo}>{currentRepo}</span>
            <span className="status-sep" aria-hidden="true">&middot;</span>
            <strong className="status-branch" title={currentBranch}>{currentBranch}</strong>
          </span>
        )}
        {ongoing && (
          <span className="ongoing-op">
            <span className="ongoing-dot" aria-hidden="true" />
            <span className="ongoing-label">{ongoingLabel}</span>
            <button className="status-op-btn" type="button" onClick={() => runOp(
              ongoing === "rebase" ? () => gitApi().rebaseAbort(currentRepo!)
                : ongoing === "merge" ? () => gitApi().mergeAbort(currentRepo!)
                  : () => gitApi().cherryPickAbort(currentRepo!), t("status.aborting"))}>{t("status.abort")}</button>
            <button className="status-op-btn primary" type="button" onClick={() => runOp(
              ongoing === "rebase" ? () => gitApi().rebaseContinue(currentRepo!)
                : ongoing === "merge" ? () => gitApi().mergeContinue(currentRepo!)
                  : () => gitApi().cherryPickContinue(currentRepo!), t("status.continuing"))}>{t("status.continue")}</button>
          </span>
        )}
        {status && status.conflicted && status.conflicted.length > 0 && (
          <span className="conflict-badge" title={t("status.conflicts")}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 2.6 14.4 13H1.6L8 2.6Z" />
              <path d="M8 6.6v2.8" />
              <path d="M8 11.8h.01" />
            </svg>
            {status.conflicted.length} {t("status.conflictLabel")}
          </span>
        )}
      </div>
      <div className="status-right">
        {loading && (
          <span className="status-loading">
            <span className="spinner" />
            <span className="status-loading-msg">{loadingMessage}</span>
          </span>
        )}
        {error && (
          <button className="error status-error" type="button" onClick={() => setError(null)} title={error}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="8" cy="8" r="5.6" />
              <path d="M8 5.2v3.6" />
              <path d="M8 11.2h.01" />
            </svg>
            <span className="status-error-text">{error}</span>
          </button>
        )}
      </div>
    </div>
  );
}
