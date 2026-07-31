import { useT } from "../i18n";
import { useRepoStore } from "../application/repoStore";

export default function StatusBar() {
  const t = useT();
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const currentBranch = useRepoStore((s) => s.currentBranch);
  const loading = useRepoStore((s) => s.loading);
  const loadingMessage = useRepoStore((s) => s.loadingMessage);
  const error = useRepoStore((s) => s.error);
  const setError = useRepoStore((s) => s.setError);
  const status = useRepoStore((s) => s.status);

  return (
    <div className="status-bar">
      {currentRepo && (<span>{currentRepo} &middot; <strong>{currentBranch}</strong></span>)}
      {status && status.conflicted && status.conflicted.length > 0 && (
        <span className="conflict-badge" title={t("status.conflicts")}>{status.conflicted.length} {t("status.conflictLabel")}</span>
      )}
      <span style={{ flex: 1 }} />
      {loading && (<><span className="spinner" /><span>{loadingMessage}</span></>)}
      {error && (<span className="error" onClick={() => setError(null)} style={{ cursor: "pointer" }}>{"\u2715"} {error}</span>)}
    </div>
  );
}
