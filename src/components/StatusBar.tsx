import { useT } from "../i18n";
import { useRepoStore } from "../stores/repoStore";

export default function StatusBar() {
  const t = useT();
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const currentBranch = useRepoStore((s) => s.currentBranch);
  const loading = useRepoStore((s) => s.loading);
  const loadingMessage = useRepoStore((s) => s.loadingMessage);
  const error = useRepoStore((s) => s.error);
  const setError = useRepoStore((s) => s.setError);

  return (
    <div className="status-bar">
      {currentRepo && (<span>{currentRepo} &middot; <strong>{currentBranch}</strong></span>)}
      <span style={{ flex: 1 }} />
      {loading && (<><span className="spinner" /><span>{loadingMessage}</span></>)}
      {error && (<span className="error" onClick={() => setError(null)} style={{ cursor: "pointer" }}>{"\u2715"} {error}</span>)}
    </div>
  );
}
