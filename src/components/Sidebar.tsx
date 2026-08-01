import { useCallback, useState, useRef, useEffect } from "react";
import { useRepoStore } from "../application/repoStore";
import { useT } from "../i18n";
import { gitApi } from "../infrastructure/gitBridge";

export default function Sidebar() {
  const t = useT();
  const branches = useRepoStore((s) => s.branches);
  const remoteBranches = useRepoStore((s) => s.remoteBranches);
  const currentBranch = useRepoStore((s) => s.currentBranch);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const reloadMeta = useRepoStore((s) => s.reloadMeta);
  const tags = useRepoStore((s) => s.tags);
  const remotes = useRepoStore((s) => s.remotes);
  const checkoutRemote = useRepoStore((s) => s.checkoutRemote);
  const setShowRebase = useRepoStore((s) => s.setShowRebase);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; branch: string; isRemote: boolean } | null>(null);
  const [showRemotes, setShowRemotes] = useState(true);
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const newBranchRef = useRef<HTMLInputElement>(null);
  const [showStash, setShowStash] = useState(false);
  const [stashList, setStashList] = useState<{ ref: string; subject: string }[]>([]);
  const [showTags, setShowTags] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagName, setTagName] = useState("");
  const [tagRef, setTagRef] = useState("");
  const [showRemoteInput, setShowRemoteInput] = useState(false);
  const [remoteName, setRemoteName] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");

  useEffect(() => { const h = () => setContextMenu(null); window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, []);
  useEffect(() => { if (showNewBranch && newBranchRef.current) newBranchRef.current.focus(); }, [showNewBranch]);

  const loadStashList = useCallback(async () => {
    if (!currentRepo) return;
    try {
      const r = await gitApi().stashList(currentRepo);
      if (r.success && r.data) setStashList(r.data);
      else setStashList([]);
    } catch { setStashList([]); }
  }, [currentRepo]);

  useEffect(() => { if (showStash) loadStashList(); }, [showStash, loadStashList]);

  const handleStashSave = useCallback(async () => {
    if (!currentRepo) return;
    setLoading(true, t("stash.saving"));
    try {
      const r = await gitApi().stashSave(currentRepo);
      if (r.success) { await refreshAll(); await loadStashList(); }
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll, loadStashList]);

  const handleStashPop = useCallback(async (ref: string) => {
    if (!currentRepo) return;
    setLoading(true, t("stash.popping"));
    try {
      const r = await gitApi().stashPop(currentRepo, ref);
      if (r.success) { await refreshAll(); await loadStashList(); }
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll, loadStashList]);

  const handleStashDrop = useCallback(async (ref: string, subject: string) => {
    if (!currentRepo) return;
    if (!window.confirm(t("stash.confirmDrop").replace("{0}", subject))) return;
    setLoading(true, t("stash.dropping"));
    try {
      const r = await gitApi().stashDrop(currentRepo, ref);
      if (r.success) await loadStashList();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, loadStashList]);

  const handleCheckout = useCallback(async (branch: string) => {
    if (!currentRepo || branch === currentBranch) return;
    setLoading(true, t("status.checkingOut").replace("{0}", branch));
    try { const r = await gitApi().checkout(currentRepo, branch); if (r.success) await refreshAll(); else setError(r.error || t("error.checkoutFailed")); }
    catch (err: any) { setError(err.message || t("error.checkoutFailed")); } finally { setLoading(false, ""); }
  }, [currentRepo, currentBranch, setLoading, setError, refreshAll]);

  const handleCreateBranch = useCallback(async () => {
    if (!currentRepo || !newBranchName.trim()) return;
    setLoading(true, t("sidebar.creatingBranch").replace("{0}", newBranchName.trim()));
    try {
      const r = await gitApi().createBranch(currentRepo, newBranchName.trim(), true);
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
      const r = await gitApi().deleteBranch(currentRepo, branch, false);
      if (r.success) await refreshAll();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, currentBranch, setLoading, setError, refreshAll]);

  const handleMergeBranch = useCallback(async (branch: string) => {
    if (!currentRepo) return;
    if (!window.confirm(t("sidebar.confirmMerge").replace("{0}", branch).replace("{1}", currentBranch))) return;
    setLoading(true, t("sidebar.merging").replace("{0}", branch));
    try {
      const r = await gitApi().merge(currentRepo, branch);
      if (r.success) await refreshAll();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, currentBranch, setLoading, setError, refreshAll]);

  const handleContextMenu = useCallback((e: React.MouseEvent, branch: string, isRemote: boolean) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, branch, isRemote }); }, []);

  const handleRebaseOnto = useCallback(async (branch: string) => {
    if (!currentRepo) return;
    if (!window.confirm(t("sidebar.confirmRebase").replace("{0}", branch).replace("{1}", currentBranch))) return;
    setLoading(true, t("sidebar.rebasing").replace("{0}", branch));
    try {
      const r = await gitApi().rebase(currentRepo, branch);
      if (r.success) await refreshAll();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, currentBranch, setLoading, setError, refreshAll, t]);

  const handleCreateTag = useCallback(async () => {
    if (!currentRepo || !tagName.trim()) return;
    setLoading(true, t("tags.creating").replace("{0}", tagName.trim()));
    try {
      const r = await gitApi().createTag(currentRepo, tagName.trim(), tagRef.trim() || "HEAD");
      if (r.success) { setShowTagInput(false); setTagName(""); setTagRef(""); await reloadMeta(); }
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, tagName, tagRef, setLoading, setError, reloadMeta, t]);

  const handleDeleteTag = useCallback(async (name: string) => {
    if (!currentRepo) return;
    if (!window.confirm(t("tags.confirmDelete").replace("{0}", name))) return;
    setLoading(true, t("tags.deleting").replace("{0}", name));
    try {
      const r = await gitApi().deleteTag(currentRepo, name);
      if (r.success) await reloadMeta();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, reloadMeta, t]);

  const handleAddRemote = useCallback(async () => {
    if (!currentRepo || !remoteName.trim() || !remoteUrl.trim()) return;
    setLoading(true, t("remotes.adding").replace("{0}", remoteName.trim()));
    try {
      const r = await gitApi().addRemote(currentRepo, remoteName.trim(), remoteUrl.trim());
      if (r.success) { setShowRemoteInput(false); setRemoteName(""); setRemoteUrl(""); await reloadMeta(); }
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, remoteName, remoteUrl, setLoading, setError, reloadMeta, t]);

  const handleRemoveRemote = useCallback(async (name: string) => {
    if (!currentRepo) return;
    if (!window.confirm(t("remotes.confirmDelete").replace("{0}", name))) return;
    setLoading(true, t("remotes.deleting").replace("{0}", name));
    try {
      const r = await gitApi().removeRemote(currentRepo, name);
      if (r.success) await reloadMeta();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, reloadMeta, t]);

  const defaultRemote = remotes[0]?.name || "origin";

  const handlePushCurrent = useCallback(async () => {
    if (!currentRepo) return;
    setLoading(true, t("topbar.pushing"));
    try {
      const r = await gitApi().pushBranch(currentRepo, defaultRemote, currentBranch);
      if (!r.success) setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, defaultRemote, currentBranch, setLoading, setError, t]);

  const parseRemoteBranch = useCallback((b: string): { remote: string; branch: string } => {
    const parts = b.replace(/^remotes\//, "").split("/");
    return { remote: parts[0], branch: parts.slice(1).join("/") };
  }, []);

  const handlePullBranch = useCallback(async (remoteBranch: string) => {
    if (!currentRepo) return;
    const { remote, branch } = parseRemoteBranch(remoteBranch);
    setLoading(true, t("topbar.pulling"));
    try {
      const r = await gitApi().pullBranch(currentRepo, remote, branch);
      if (r.success) await refreshAll();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, parseRemoteBranch, setLoading, setError, refreshAll, t]);

  const handleDeleteRemoteBranch = useCallback(async (remoteBranch: string) => {
    if (!currentRepo) return;
    const { remote, branch } = parseRemoteBranch(remoteBranch);
    if (!window.confirm(t("sidebar.confirmDeleteRemote").replace("{0}", branch).replace("{1}", remote))) return;
    setLoading(true, t("remotes.deleting").replace("{0}", branch));
    try {
      const r = await gitApi().deleteRemoteBranch(currentRepo, remote, branch);
      if (r.success) await refreshAll();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, parseRemoteBranch, setLoading, setError, refreshAll, t]);

  const handlePruneRemote = useCallback(async (remote: string) => {
    if (!currentRepo) return;
    setLoading(true, t("remotes.pruning").replace("{0}", remote));
    try {
      const r = await gitApi().pruneRemote(currentRepo, remote);
      if (r.success) await refreshAll();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll, t]);

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
        <div className="sidebar-subheader" onClick={() => setShowRemotes(!showRemotes)}>
          <span className="subheader-arrow">{showRemotes ? "\u25BC" : "\u25B6"}</span> {t("sidebar.remotes")}
          {remotes.length > 0 && (
          <button className="sidebar-add-btn" style={{ marginLeft: "auto" }} onClick={(e) => { e.stopPropagation(); handlePruneRemote(defaultRemote); }} title={t("sidebar.prune")}>&#8635;</button>
          )}
          <button className="sidebar-add-btn" onClick={(e) => { e.stopPropagation(); setShowRemoteInput(!showRemoteInput); }} title={t("remotes.addTip")}>+</button>
        </div>
        {showRemotes && (<>
          {remotes.map((remote) => (
            <div key={remote.name} className="branch-item remote-item" title={remote.url}>
              <span className="branch-icon">{"\u21C4"}</span>
              <span className="stash-subject">{remote.name}</span>
              <span className="file-actions">
                <button className="file-action-btn danger" onClick={() => handleRemoveRemote(remote.name)}>{t("remotes.remove")}</button>
              </span>
            </div>
          ))}
          {remotes.length === 0 && !showRemoteInput && <div className="empty-state" style={{ padding: 10 }}>{t("remotes.empty")}</div>}
          {showRemoteInput && (
            <div className="new-branch-input" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <input type="text" value={remoteName} placeholder={t("remotes.namePlaceholder")} onChange={(e) => setRemoteName(e.target.value)} />
              <input type="text" value={remoteUrl} placeholder={t("remotes.urlPlaceholder")} onChange={(e) => setRemoteUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleAddRemote(); }} />
              <button onClick={handleAddRemote} disabled={!remoteName.trim() || !remoteUrl.trim()}>{t("remotes.add")}</button>
            </div>
          )}
          {remoteBranches.length > 0 && <div className="sidebar-group-label">{t("sidebar.remoteBranches")}</div>}
          {remoteBranches.map((b) => (
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
      <div className="sidebar-subheader" onClick={() => setShowTags(!showTags)} style={{ marginTop: 4 }}>
        <span className="subheader-arrow">{showTags ? "\u25BC" : "\u25B6"}</span> {t("tags.title")}
        <button className="sidebar-add-btn" style={{ marginLeft: "auto" }} onClick={(e) => { e.stopPropagation(); setShowTagInput(!showTagInput); }} title={t("tags.addTip")}>+</button>
      </div>
      {showTags && (
        <div className="sidebar-list" style={{ flex: "none", maxHeight: 160 }}>
          {showTagInput && (
            <div className="new-branch-input" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <input type="text" value={tagName} placeholder={t("tags.namePlaceholder")} onChange={(e) => setTagName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreateTag(); if (e.key === "Escape") { setShowTagInput(false); setTagName(""); } }} />
              <input type="text" value={tagRef} placeholder={t("tags.refPlaceholder")} onChange={(e) => setTagRef(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreateTag(); }} />
              <button onClick={handleCreateTag} disabled={!tagName.trim()}>{t("tags.create")}</button>
            </div>
          )}
          {tags.map((tag) => (
            <div key={tag.name} className="branch-item tag-item">
              <span className="branch-icon">{"\u25C8"}</span>
              <span className="stash-subject" title={`${tag.subject || tag.hash}`}>{tag.name}</span>
              <span className="file-actions">
                <button className="file-action-btn danger" onClick={() => handleDeleteTag(tag.name)}>{t("tags.delete")}</button>
              </span>
            </div>
          ))}
          {tags.length === 0 && !showTagInput && <div className="empty-state" style={{ padding: 10 }}>{t("tags.empty")}</div>}
        </div>
      )}
    </div>
    <div className="resize-handle" onMouseDown={handleResizeStart} />
    {contextMenu && (<div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
      {contextMenu.isRemote
        ? <><div className="context-menu-item" onClick={() => { checkoutRemote(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.checkoutRemote").replace("{0}", contextMenu.branch.replace(/^remotes\//, ""))}</div>
          <div className="context-menu-item" onClick={() => { handlePullBranch(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.pullBranch")}</div>
          <div className="context-menu-item danger" onClick={() => { handleDeleteRemoteBranch(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.deleteRemoteBranch")}</div>
          <div className="context-menu-divider" />
        </>
        : <><div className="context-menu-item" onClick={() => { handleCheckout(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.checkout")} {contextMenu.branch}</div>
          {contextMenu.branch !== currentBranch && (
            <div className="context-menu-item" onClick={() => { setShowRebase(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.interactiveRebase")}</div>
          )}
          <div className="context-menu-item" onClick={() => { handlePushCurrent(); setContextMenu(null); }}>{t("sidebar.pushCurrent")}</div>
          <div className="context-menu-divider" />
        </>}
      {!contextMenu.isRemote && contextMenu.branch !== currentBranch && (
        <div className="context-menu-item" onClick={() => { handleMergeBranch(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.mergeInto").replace("{0}", contextMenu.branch)}</div>
      )}
      {!contextMenu.isRemote && contextMenu.branch !== currentBranch && (
        <div className="context-menu-item danger" onClick={() => { handleDeleteBranch(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.deleteBranch")} {contextMenu.branch}</div>
      )}
      {!contextMenu.isRemote && contextMenu.branch !== currentBranch && (
        <div className="context-menu-item" onClick={() => { handleRebaseOnto(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.rebaseOnto").replace("{0}", contextMenu.branch)}</div>
      )}
      <div className="context-menu-item" onClick={async () => { await navigator.clipboard.writeText(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.copyName")}</div>
    </div>)}
  </>);
}
