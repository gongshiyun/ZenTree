import { useCallback, useState, useRef, useEffect } from "react";
import { useRepoStore } from "../stores/repoStore";
import { useT } from "../i18n";

export default function Sidebar() {
  const t = useT();
  const branches = useRepoStore((s) => s.branches);
  const remoteBranches = useRepoStore((s) => s.remoteBranches);
  const currentBranch = useRepoStore((s) => s.currentBranch);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const checkoutRemote = useRepoStore((s) => s.checkoutRemote);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; branch: string; isRemote: boolean } | null>(null);
  const [showRemotes, setShowRemotes] = useState(true);

  useEffect(() => { const h = () => setContextMenu(null); window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, []);

  const handleCheckout = useCallback(async (branch: string) => {
    if (!currentRepo || branch === currentBranch) return;
    setLoading(true, t("status.checkingOut").replace("{0}", branch));
    try { const r = await window.gitAPI.checkout(currentRepo, branch); if (r.success) await refreshAll(); else setError(r.error || t("error.checkoutFailed")); }
    catch (err: any) { setError(err.message || t("error.checkoutFailed")); } finally { setLoading(false, ""); }
  }, [currentRepo, currentBranch, setLoading, setError, refreshAll]);

  const handleContextMenu = useCallback((e: React.MouseEvent, branch: string, isRemote: boolean) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, branch, isRemote }); }, []);

  const [sidebarWidth, setSidebarWidth] = useState(200);
  const isResizing = useRef(false);
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); isResizing.current = true; const sx = e.clientX; const sw = sidebarWidth;
    const mm = (ev: MouseEvent) => { if (!isResizing.current) return; setSidebarWidth(Math.max(140, Math.min(400, sw + (ev.clientX - sx)))); };
    const mu = () => { isResizing.current = false; document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu); };
    document.addEventListener("mousemove", mm); document.addEventListener("mouseup", mu);
  }, [sidebarWidth]);

  return (<>
    <div className="sidebar" style={{ width: sidebarWidth }}>
      <div className="sidebar-header">{t("sidebar.branches")}</div>
      <div className="sidebar-list">
        {branches.map((b) => (
          <div key={b} className={`branch-item${b === currentBranch ? " current" : ""}`} onDoubleClick={() => handleCheckout(b)} onContextMenu={(e) => handleContextMenu(e, b, false)} title={b + t("sidebar.dblClick")}>
            <span className="branch-icon">{b === currentBranch ? "\u25CF" : "\u25CB"}</span><span>{b}</span>
          </div>
        ))}
        {branches.length === 0 && <div className="empty-state" style={{ padding: 20 }}>{t("sidebar.noBranches")}</div>}
        {remoteBranches.length > 0 && (<>
          <div className="sidebar-subheader" onClick={() => setShowRemotes(!showRemotes)}>
            <span className="subheader-arrow">{showRemotes ? "\u25BC" : "\u25B6"}</span> {t("sidebar.remotes")} ({remoteBranches.length})
          </div>
          {showRemotes && remoteBranches.map((b) => (
            <div key={b} className="branch-item remote" onDoubleClick={() => checkoutRemote(b)} onContextMenu={(e) => handleContextMenu(e, b, true)} title={b + t("sidebar.dblClick")}>
              <span className="branch-icon remote-icon">{"\u21C4"}</span><span>{b.replace(/^remotes\//, "")}</span>
            </div>
          ))}
        </>)}
      </div>
    </div>
    <div className="resize-handle" onMouseDown={handleResizeStart} />
    {contextMenu && (<div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
      {contextMenu.isRemote
        ? <div className="context-menu-item" onClick={() => { checkoutRemote(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.checkoutRemote").replace("{0}", contextMenu.branch.replace(/^remotes\//, ""))}</div>
        : <div className="context-menu-item" onClick={() => { handleCheckout(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.checkout")} {contextMenu.branch}</div>}
      <div className="context-menu-divider" />
      <div className="context-menu-item" onClick={async () => { await navigator.clipboard.writeText(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.copyName")}</div>
    </div>)}
  </>);
}
