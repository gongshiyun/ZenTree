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
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const newBranchRef = useRef<HTMLInputElement>(null);
  const [showStash, setShowStash] = useState(false);
  const [stashList, setStashList] = useState<{ ref: string; subject: string }[]>([]);

  useEffect(() => { const h = () => setContextMenu(null); window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, []);
  useEffect(() => { if (showNewBranch && newBranchRef.current) newBranchRef.current.focus(); }, [showNewBranch]);

  const loadStashList = useCallback(async () => {
    if (!currentRepo) return;
    try {
      const r = await window.gitAPI.stashList(currentRepo);
      if (r.success && r.data) setStashList(r.data);
      else setStashList([]);
    } catch { setStashList([]); }
  }, [currentRepo]);

  useEffect(() => { if (showStash) loadStashList(); }, [showStash, loadStashList]);

  const handleStashSave = useCallback(async () => {
    if (!currentRepo) return;
    setLoading(true, t("stash.saving"));
    try {
      const r = await window.gitAPI.stashSave(currentRepo);
      if (r.success) { await refreshAll(); await loadStashList(); }
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll, loadStashList]);

  const handleStashPop = useCallback(async (ref: string) => {
    if (!currentRepo) return;
    setLoading(true, t("stash.popping"));
    try {
      const r = await window.gitAPI.stashPop(currentRepo, ref);
      if (r.success) { await refreshAll(); await loadStashList(); }
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll, loadStashList]);

  const handleStashDrop = useCallback(async (ref: string, subject: string) => {
    if (!currentRepo) return;
    if (!window.confirm(t("stash.confirmDrop").replace("{0}", subject))) return;
    setLoading(true, t("stash.dropping"));
    try {
      const r = await window.gitAPI.stashDrop(currentRepo, ref);
      if (r.success) await loadStashList();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, loadStashList]);

  const handleCheckout = useCallback(async (branch: string) => {
    if (!currentRepo || branch === currentBranch) return;
    setLoading(true, t("status.checkingOut").replace("{0}", branch));
    try { const r = await window.gitAPI.checkout(currentRepo, branch); if (r.success) await refreshAll(); else setError(r.error || t("error.checkoutFailed")); }
    catch (err: any) { setError(err.message || t("error.checkoutFailed")); } finally { setLoading(false, ""); }
  }, [currentRepo, currentBranch, setLoading, setError, refreshAll]);

  const handleCreateBranch = useCallback(async () => {
    if (!currentRepo || !newBranchName.trim()) return;
    setLoading(true, t("sidebar.creatingBranch").replace("{0}", newBranchName.trim()));
    try {
      const r = await window.gitAPI.createBranch(currentRepo, newBranchName.trim(), true);
      if (r.success) { setShowNewBranch(false); setNewBranchName(""); await refreshAll(); }
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, newBranchName, setLoading, setError, refreshAll]);

  const handleDeleteBranch = useCallback(async (branch: string) => {
    if (!currentRepo) return;
    if (branch === currentBranch) { setError(t("error.cannotDeleteCurrent")); return; }
    if (!window.confirm(t("sidebar.confirmDelete").replace("{0}", branch))) return;
    setLoading(true, t("sidebar.deletingBranch").replace("{0}", branch));
    try {
      const r = await window.gitAPI.deleteBranch(currentRepo, branch, false);
      if (r.success) await refreshAll();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, currentBranch, setLoading, setError, refreshAll]);

  const handleMergeBranch = useCallback(async (branch: string) => {
    if (!currentRepo) return;
    if (!window.confirm(t("sidebar.confirmMerge").replace("{0}", branch).replace("{1}", currentBranch))) return;
    setLoading(true, t("sidebar.merging").replace("{0}", branch));
    try {
      const r = await window.gitAPI.merge(currentRepo, branch);
      if (r.success) await refreshAll();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
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
      <div className="sidebar-header">
        <span>{t("sidebar.branches")}</span>
        <button className="sidebar-add-btn" onClick={() => setShowNewBranch(true)} title={t("sidebar.newBranch")}>+</button>
      </div>
      {showNewBranch && (
        <div className="new-branch-input">
          <input ref={newBranchRef} type="text" value={newBranchName} placeholder={t("sidebar.branchNamePlaceholder")}
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateBranch(); if (e.key === "Escape") { setShowNewBranch(false); setNewBranchName(""); } }}
          />
          <button onClick={handleCreateBranch} disabled={!newBranchName.trim()}>{t("sidebar.create")}</button>
        </div>
      )}
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
      <div className="sidebar-subheader" onClick={() => setShowStash(!showStash)} style={{ marginTop: 4 }}>
        <span className="subheader-arrow">{showStash ? "\u25BC" : "\u25B6"}</span> {t("stash.title")}
        <button className="sidebar-add-btn" style={{ marginLeft: "auto" }} onClick={(e) => { e.stopPropagation(); handleStashSave(); }} title={t("stash.saveTip")}>+</button>
      </div>
      {showStash && (
        <div className="sidebar-list" style={{ flex: "none", maxHeight: 140 }}>
          {stashList.map((s) => (
            <div key={s.ref} className="branch-item stash-item">
              <span className="branch-icon">{"\u25A3"}</span>
              <span className="stash-subject" title={s.subject}>{s.subject}</span>
              <span className="file-actions">
                <button className="file-action-btn" onClick={() => handleStashPop(s.ref)}>{t("stash.pop")}</button>
                <button className="file-action-btn danger" onClick={() => handleStashDrop(s.ref, s.subject)}>{t("stash.drop")}</button>
              </span>
            </div>
          ))}
          {stashList.length === 0 && <div className="empty-state" style={{ padding: 10 }}>{t("stash.empty")}</div>}
        </div>
      )}
    </div>
    <div className="resize-handle" onMouseDown={handleResizeStart} />
    {contextMenu && (<div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
      {contextMenu.isRemote
        ? <div className="context-menu-item" onClick={() => { checkoutRemote(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.checkoutRemote").replace("{0}", contextMenu.branch.replace(/^remotes\//, ""))}</div>
        : <div className="context-menu-item" onClick={() => { handleCheckout(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.checkout")} {contextMenu.branch}</div>}
      {!contextMenu.isRemote && contextMenu.branch !== currentBranch && (
        <div className="context-menu-item" onClick={() => { handleMergeBranch(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.mergeInto").replace("{0}", contextMenu.branch)}</div>
      )}
      {!contextMenu.isRemote && contextMenu.branch !== currentBranch && (
        <div className="context-menu-item danger" onClick={() => { handleDeleteBranch(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.deleteBranch")} {contextMenu.branch}</div>
      )}
      <div className="context-menu-divider" />
      <div className="context-menu-item" onClick={async () => { await navigator.clipboard.writeText(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.copyName")}</div>
    </div>)}
  </>);
}
