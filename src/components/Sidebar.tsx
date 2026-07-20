import { useCallback, useState, useRef, useEffect } from "react";
import { useRepoStore } from "../stores/repoStore";

export default function Sidebar() {
  const branches = useRepoStore((s) => s.branches);
  const currentBranch = useRepoStore((s) => s.currentBranch);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const refreshAll = useRepoStore((s) => s.refreshAll);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    branch: string;
  } | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Close context menu on any click
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
      if (result.success) {
        await refreshAll();
      } else {
        setError(result.error || "Checkout failed");
      }
    } catch (err: any) {
      setError(err.message || "Checkout failed");
    } finally {
      setLoading(false, "");
    }
  }, [currentRepo, currentBranch, setLoading, setError, refreshAll]);

  const handleContextMenu = useCallback((e: React.MouseEvent, branch: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, branch });
  }, []);

  // Resize sidebar
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const isResizing = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.max(140, Math.min(400, startWidth + (ev.clientX - startX)));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
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
              onContextMenu={(e) => handleContextMenu(e, branch)}
              title={`${branch} — double-click to checkout`}
            >
              <span className="branch-icon">{branch === currentBranch ? "\u25CF" : "\u25CB"}</span>
              <span>{branch}</span>
            </div>
          ))}
          {branches.length === 0 && (
            <div className="empty-state" style={{ padding: 20 }}>
              No branches found
            </div>
          )}
        </div>
      </div>

      {/* Resize handle */}
      <div className="resize-handle" onMouseDown={handleResizeStart} />

      {/* Context menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div
            className="context-menu-item"
            onClick={() => {
              handleCheckout(contextMenu.branch);
              setContextMenu(null);
            }}
          >
            Checkout {contextMenu.branch}
          </div>
          <div className="context-menu-divider" />
          <div
            className="context-menu-item"
            onClick={async () => {
              await navigator.clipboard.writeText(contextMenu.branch);
              setContextMenu(null);
            }}
          >
            Copy branch name
          </div>
        </div>
      )}
    </>
  );
}
