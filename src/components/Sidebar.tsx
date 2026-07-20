import { useCallback, useState, useRef, useEffect } from "react";
import { useRepoStore } from "../stores/repoStore";

export default function Sidebar() {
  const branches = useRepoStore((s) => s.branches);
  const remoteBranches = useRepoStore((s) => s.remoteBranches);
  const currentBranch = useRepoStore((s) => s.currentBranch);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const checkoutRemote = useRepoStore((s) => s.checkoutRemote);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; branch: string; isRemote: boolean } | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [showRemotes, setShowRemotes] = useState(true);

  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  const handleCheckout = useCallback(async (branch: string) => {
    if (!currentRepo || branch === currentBranch) return;
    setLoading(true, `Checking out ${branch}...`);
    try {
      const result = await window.gitAPI.checkout(currentRepo, branch);
      if (result.success) await refreshAll();
      else setError(result.error || "Checkout failed");
    } catch (err: any) { setError(err.message || "Checkout failed"); }
    finally { setLoading(false, ""); }
  }, [currentRepo, currentBranch, setLoading, setError, refreshAll]);

  const handleContextMenu = useCallback((e: React.MouseEvent, branch: string, isRemote: boolean) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, branch, isRemote });
  }, []);

  // Resize
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const isResizing = useRef(false);
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const mm = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      setSidebarWidth(Math.max(140, Math.min(400, startWidth + (ev.clientX - startX))));
    };
    const mu = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
    };
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
  }, [sidebarWidth]);

  return (
    <>
      <div className="sidebar" ref={sidebarRef} style={{ width: sidebarWidth }}>
        <div className="sidebar-header">Branches</div>
        <div className="sidebar-list">
          {branches.map((branch) => (
            <div
              key={branch}
              className={`branch-item${branch === currentBranch ? " current" : ""}`}
              onDoubleClick={() => handleCheckout(branch)}
              onContextMenu={(e) => handleContextMenu(e, branch, false)}
              title={`${branch} — double-click to checkout`}
            >
              <span className="branch-icon">{branch === currentBranch ? "\u25CF" : "\u25CB"}</span>
              <span>{branch}</span>
            </div>
          ))}
          {branches.length === 0 && (
            <div className="empty-state" style={{ padding: 20 }}>No branches found</div>
          )}

          {remoteBranches.length > 0 && (
            <>
              <div className="sidebar-subheader" onClick={() => setShowRemotes(!showRemotes)}>
                <span className="subheader-arrow">{showRemotes ? "\u25BC" : "\u25B6"}</span>
                Remotes ({remoteBranches.length})
              </div>
              {showRemotes && remoteBranches.map((branch) => (
                <div
                  key={branch}
                  className="branch-item remote"
                  onDoubleClick={() => checkoutRemote(branch)}
                  onContextMenu={(e) => handleContextMenu(e, branch, true)}
                  title={`${branch} — double-click to checkout and track`}
                >
                  <span className="branch-icon remote-icon">{"\u21C4"}</span>
                  <span>{branch.replace(/^remotes\//, "")}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="resize-handle" onMouseDown={handleResizeStart} />

      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {contextMenu.isRemote ? (
            <div className="context-menu-item" onClick={() => { checkoutRemote(contextMenu.branch); setContextMenu(null); }}>
              Checkout {contextMenu.branch.replace(/^remotes\//, "")} (create tracking branch)
            </div>
          ) : (
            <div className="context-menu-item" onClick={() => { handleCheckout(contextMenu.branch); setContextMenu(null); }}>
              Checkout {contextMenu.branch}
            </div>
          )}
          <div className="context-menu-divider" />
          <div className="context-menu-item" onClick={async () => {
            await navigator.clipboard.writeText(contextMenu.branch);
            setContextMenu(null);
          }}>Copy branch name</div>
        </div>
      )}
    </>
  );
}
