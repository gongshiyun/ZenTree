import { useCallback, useState, useRef, useEffect } from "react";
import { useRepoStore } from "../application/repoStore";
import { useT } from "../i18n";
import { gitApi } from "../infrastructure/gitBridge";
import RefNameDialog from "./RefNameDialog";

/* 12px sidebar glyphs: inline SVG, colour inherits the row's text hierarchy. */
function BranchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="4.6" cy="3.5" r="1.4" />
      <circle cx="4.6" cy="12.5" r="1.4" />
      <circle cx="11.4" cy="6" r="1.4" />
      <path d="M4.6 4.9v6.2" />
      <path d="M10 6.6c-2.6.3-5.4 1-5.4 4.5" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11.5 12.4H4.4a2.5 2.5 0 0 1-.3-5 3.6 3.6 0 0 1 6.9.2 2.2 2.2 0 0 1 .5 4.8Z" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.4 2.4a1.3 1.3 0 0 0-.9-.4H3.2a1.2 1.2 0 0 0-1.2 1.2v4.3c0 .3.1.7.4.9l5.3 5.3a1.6 1.6 0 0 0 2.3 0l3.9-3.9a1.6 1.6 0 0 0 0-2.3Z" />
      <circle cx="5.1" cy="5.1" r=".9" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.8" y="2.6" width="12.4" height="3.4" rx=".8" />
      <path d="M3 6v6.6a1.2 1.2 0 0 0 1.2 1.2h7.6a1.2 1.2 0 0 0 1.2-1.2V6" />
      <path d="M6.6 8.8h2.8" />
    </svg>
  );
}

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
  const branchTracking = useRepoStore((s) => s.branchTracking);
  const checkoutRemote = useRepoStore((s) => s.checkoutRemote);
  const setShowRebase = useRepoStore((s) => s.setShowRebase);
  const setSelectedDiffFile = useRepoStore((s) => s.setSelectedDiffFile);

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
  const [stashMessage, setStashMessage] = useState("");
  const [showStashMessage, setShowStashMessage] = useState(false);
  const [previewError, setPreviewError] = useState("");

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

  const handleStashSave = useCallback(async (message?: string, paths?: string[]) => {
    if (!currentRepo) return;
    setLoading(true, t("stash.saving"));
    try {
      const r = await gitApi().stashSave(currentRepo, message, paths);
      if (r.success) { setStashMessage(""); setShowStashMessage(false); await refreshAll(); await loadStashList(); }
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll, loadStashList]);

  const handleRenameBranch = useCallback(async (branch: string) => {
    if (!currentRepo) return;
    const name = window.prompt(t("sidebar.renamePrompt"), branch);
    if (!name || !name.trim() || name.trim() === branch) return;
    setLoading(true, t("sidebar.renaming").replace("{0}", branch));
    try {
      const r = await gitApi().renameBranch(currentRepo, branch, name.trim());
      if (r.success) await refreshAll();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll, t]);

  const handleSetUpstream = useCallback(async (branch: string) => {
    if (!currentRepo) return;
    const current = branchTracking.find((x) => x.name === branch)?.upstream || "";
    const value = window.prompt(t("sidebar.upstreamPrompt"), current || `origin/${branch}`);
    if (!value || !value.trim()) return;
    // Split the typed ref only at the first slash: the branch part can itself
    // contain slashes (`upstream/feature/x`). A bare remote name is accepted as
    // shorthand for <remote>/<local branch>. The `remotes/` prefix shown in the
    // branch-tracking data is accepted too.
    const typed = value.trim().replace(/^remotes\//, "");
    const slash = typed.indexOf("/");
    const remote = slash === -1 ? typed : typed.slice(0, slash);
    const upstreamBranch = slash === -1 ? branch : typed.slice(slash + 1);
    if (!remote || !upstreamBranch) {
      setError(t("error.opFailed"));
      return;
    }
    setLoading(true, t("sidebar.settingUpstream").replace("{0}", branch));
    try {
      let ok: boolean;
      let failure: string | undefined;
      if (upstreamBranch === branch) {
        // The common case needs no remote-ref juggling: the bridge writes
        // <remote>/<local branch>, which is exactly what was typed.
        const r = await gitApi().setUpstream(currentRepo, branch, remote);
        ok = r.success;
        failure = r.error;
      } else {
        // An upstream branch with a different name cannot be expressed through
        // setUpstream(repo, branch, remote): the bridge always pins
        // <remote>/<local-branch>. Validate the typed ref against the fetched
        // remote branches, then write the same two branch.* keys git itself
        // writes for `git branch --set-upstream-to=<ref>`.
        const remoteExists = remotes.some((r) => r.name === remote);
        const refKnown = remoteBranches.length === 0
          || remoteBranches.some((rb) => rb.replace(/^remotes\//, "") === `${remote}/${upstreamBranch}`);
        if (!remoteExists || !refKnown) {
          setError(t("error.opFailed"));
          return;
        }
        const remoteWrite = await gitApi().setConfig(currentRepo, `branch.${branch}.remote`, remote);
        const mergeWrite = remoteWrite.success
          ? await gitApi().setConfig(currentRepo, `branch.${branch}.merge`, `refs/heads/${upstreamBranch}`)
          : remoteWrite;
        ok = remoteWrite.success && mergeWrite.success;
        failure = remoteWrite.error || mergeWrite.error;
      }
      if (ok) await refreshAll();
      else setError(failure || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, branchTracking, remoteBranches, remotes, setLoading, setError, refreshAll, t]);

  const handleUnsetUpstream = useCallback(async (branch: string) => {
    if (!currentRepo) return;
    setLoading(true, t("sidebar.unsettingUpstream").replace("{0}", branch));
    try {
      const r = await gitApi().unsetUpstream(currentRepo, branch);
      if (r.success) await refreshAll();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll, t]);

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

  const handleStashPreview = useCallback(async (ref: string, subject: string) => {
    if (!currentRepo) return;
    setPreviewError("");
    try {
      const r = await gitApi().stashDiff(currentRepo, ref);
      if (r.success && r.data !== undefined) {
        // Preview reuses the diff panel via rawDiff (tracked changes only).
        setSelectedDiffFile({ path: `${subject} (${ref})`, isStaged: false, status: "modified", rawDiff: r.data });
      } else {
        setPreviewError(r.error || t("stash.diffFailed"));
      }
    } catch (err: any) { setPreviewError(err.message || t("stash.diffFailed")); }
  }, [currentRepo, setSelectedDiffFile, t]);

  const handleCheckout = useCallback(async (branch: string) => {
    if (!currentRepo || branch === currentBranch) return;
    setLoading(true, t("status.checkingOut").replace("{0}", branch));
    try { const r = await gitApi().checkout(currentRepo, branch); if (r.success) await refreshAll(); else setError(r.error || t("error.checkoutFailed")); }
    catch (err: any) { setError(err.message || t("error.checkoutFailed")); } finally { setLoading(false, ""); }
  }, [currentRepo, currentBranch, setLoading, setError, refreshAll]);

  const handleCreateBranch = useCallback(async (name: string) => {
    if (!currentRepo || !name) return;
    setLoading(true, t("sidebar.creatingBranch").replace("{0}", name));
    try {
      const r = await gitApi().createBranch(currentRepo, name, true);
      if (r.success) { setShowNewBranch(false); setNewBranchName(""); await refreshAll(); }
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll, t]);

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

  const [sidebarWidth, setSidebarWidth] = useState(244);
  const isResizing = useRef(false);
  const clickTimerRef = useRef<number | null>(null);
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); isResizing.current = true; const sx = e.clientX; const sw = sidebarWidth;
    const mm = (ev: MouseEvent) => { if (!isResizing.current) return; setSidebarWidth(Math.max(140, Math.min(400, sw + (ev.clientX - sx)))); };
    const mu = () => { isResizing.current = false; document.removeEventListener("mousemove", mm); document.removeEventListener("mouseup", mu); };
    document.addEventListener("mousemove", mm); document.addEventListener("mouseup", mu);
  }, [sidebarWidth]);

  const viewRef = useRepoStore((s) => s.viewRef);

  const handleRemoteClick = useCallback((b: string) => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      useRepoStore.getState().setViewRef(b);
    }, 220);
  }, []);

  const handleRemoteDoubleClick = useCallback((b: string) => {
    if (clickTimerRef.current) { window.clearTimeout(clickTimerRef.current); clickTimerRef.current = null; }
    checkoutRemote(b);
  }, [checkoutRemote]);

  return (<>
    <div className="sidebar" style={{ width: sidebarWidth }}>
      <div className="sidebar-header">
        <span className="sidebar-header-title">{t("sidebar.branches")}</span>
        <button className="sidebar-add-btn" onClick={() => setShowNewBranch(true)} title={t("sidebar.newBranch")} type="button">+</button>
      </div>
      {showNewBranch && (
        <RefNameDialog
          title={t("sidebar.newBranch")}
          placeholder={t("sidebar.branchNamePlaceholder")}
          confirmLabel={t("sidebar.create")}
          onSubmit={handleCreateBranch}
          onClose={() => { setShowNewBranch(false); setNewBranchName(""); }}
        />
      )}
      <div className="sidebar-list">
        {branches.map((b) => {
          const tr = branchTracking.find((x) => x.name === b);
          const isCurrent = b === currentBranch;
          return (
            <div key={b} className={`branch-item${isCurrent ? " current" : ""}`} onDoubleClick={() => handleCheckout(b)} onContextMenu={(e) => handleContextMenu(e, b, false)} title={b + t("sidebar.dblClick")}>
              <span className="branch-icon"><BranchIcon /></span>
              <span className="branch-name">{b}</span>
              {isCurrent && <span className="branch-current-dot" aria-hidden="true" />}
              {tr?.upstream && (
                <span className="branch-tracking" title={tr.upstream}>
                  <span className="track-up">{tr.upstream.replace(/^[^/]+\//, "")}</span>
                  {(tr.behind > 0 || tr.ahead > 0) && (
                    <span className="track-count">
                      {tr.behind > 0 && <span className="track-behind">&#8595;{tr.behind}</span>}
                      {tr.ahead > 0 && <span className="track-ahead">&#8593;{tr.ahead}</span>}
                    </span>
                  )}
                </span>
              )}
            </div>
          );
        })}
        {branches.length === 0 && <div className="empty-state">{t("sidebar.noBranches")}</div>}
        <div className="sidebar-subheader" onClick={() => setShowRemotes(!showRemotes)}>
          <span className="subheader-arrow">{showRemotes ? "\u25BC" : "\u25B6"}</span>
          <span className="subheader-title">{t("sidebar.remotes")}</span>
          <span className="subheader-actions">
            {remotes.length > 0 && (
              <button className="sidebar-add-btn" onClick={(e) => { e.stopPropagation(); handlePruneRemote(defaultRemote); }} title={t("sidebar.prune")} type="button">&#8635;</button>
            )}
            <button className="sidebar-add-btn" onClick={(e) => { e.stopPropagation(); setShowRemoteInput(!showRemoteInput); }} title={t("remotes.addTip")} type="button">+</button>
          </span>
        </div>
        {showRemotes && (<>
          {remotes.map((remote) => (
            <div key={remote.name} className="branch-item remote-item" title={remote.url}>
              <span className="branch-icon"><CloudIcon /></span>
              <span className="branch-name">{remote.name}</span>
              <span className="file-actions">
                <button className="file-action-btn danger" onClick={() => handleRemoveRemote(remote.name)} type="button">{t("remotes.remove")}</button>
              </span>
            </div>
          ))}
          {remotes.length === 0 && !showRemoteInput && <div className="empty-state">{t("remotes.empty")}</div>}
          {showRemoteInput && (
            <div className="new-branch-input">
              <input type="text" value={remoteName} placeholder={t("remotes.namePlaceholder")} onChange={(e) => setRemoteName(e.target.value)} />
              <input type="text" value={remoteUrl} placeholder={t("remotes.urlPlaceholder")} onChange={(e) => setRemoteUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleAddRemote(); }} />
              <button onClick={handleAddRemote} disabled={!remoteName.trim() || !remoteUrl.trim()} type="button">{t("remotes.add")}</button>
            </div>
          )}
          {remoteBranches.length > 0 && <div className="sidebar-group-label">{t("sidebar.remoteBranches")}</div>}
          {remoteBranches.map((b) => (
            <div key={b} className={`branch-item remote${viewRef === b ? " viewing" : ""}`} onClick={() => handleRemoteClick(b)} onDoubleClick={() => handleRemoteDoubleClick(b)} onContextMenu={(e) => handleContextMenu(e, b, true)} title={b + t("sidebar.dblClick")}>
              <span className="branch-icon remote-icon"><CloudIcon /></span>
              <span className="branch-name">{b.replace(/^remotes\//, "")}</span>
            </div>
          ))}
        </>)}
      </div>
      <div className="sidebar-subheader" onClick={() => setShowStash(!showStash)}>
        <span className="subheader-arrow">{showStash ? "\u25BC" : "\u25B6"}</span>
        <span className="subheader-title">{t("stash.title")}</span>
        <span className="subheader-actions">
          <button className="sidebar-add-btn" onClick={(e) => { e.stopPropagation(); setShowStashMessage(!showStashMessage); }} title={t("stash.saveTip")} type="button">+</button>
        </span>
      </div>
      {showStashMessage && (
        <div className="new-branch-input">
          <input type="text" value={stashMessage} placeholder={t("stash.messagePlaceholder")}
            onChange={(e) => setStashMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleStashSave(stashMessage); if (e.key === "Escape") { setShowStashMessage(false); setStashMessage(""); } }} />
          <button onClick={() => handleStashSave(stashMessage)} type="button">{t("stash.save")}</button>
        </div>
      )}
      {showStash && (
        <div className="sidebar-list fixed stash-list">
          {stashList.map((s) => (
            <div key={s.ref} className="branch-item stash-item">
              <span className="branch-icon"><ArchiveIcon /></span>
              <span className="stash-subject" title={t("stash.previewTip")} onClick={() => handleStashPreview(s.ref, s.subject)}>{s.subject}</span>
              <span className="file-actions">
                <button className="file-action-btn" onClick={() => handleStashPop(s.ref)} type="button">{t("stash.pop")}</button>
                <button className="file-action-btn danger" onClick={() => handleStashDrop(s.ref, s.subject)} type="button">{t("stash.drop")}</button>
              </span>
            </div>
          ))}
          {stashList.length === 0 && <div className="empty-state">{t("stash.empty")}</div>}
          {previewError && <div className="empty-state sidebar-error">{previewError}</div>}
        </div>
      )}
      <div className="sidebar-subheader" onClick={() => setShowTags(!showTags)}>
        <span className="subheader-arrow">{showTags ? "\u25BC" : "\u25B6"}</span>
        <span className="subheader-title">{t("tags.title")}</span>
        <span className="subheader-actions">
          <button className="sidebar-add-btn" onClick={(e) => { e.stopPropagation(); setShowTagInput(!showTagInput); }} title={t("tags.addTip")} type="button">+</button>
        </span>
      </div>
      {showTags && (
        <div className="sidebar-list fixed tag-list">
          {showTagInput && (
            <div className="new-branch-input">
              <input type="text" value={tagName} placeholder={t("tags.namePlaceholder")} onChange={(e) => setTagName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreateTag(); if (e.key === "Escape") { setShowTagInput(false); setTagName(""); } }} />
              <input type="text" value={tagRef} placeholder={t("tags.refPlaceholder")} onChange={(e) => setTagRef(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreateTag(); }} />
              <button onClick={handleCreateTag} disabled={!tagName.trim()} type="button">{t("tags.create")}</button>
            </div>
          )}
          {tags.map((tag) => (
            <div key={tag.name} className="branch-item tag-item">
              <span className="branch-icon"><TagIcon /></span>
              <span className="stash-subject" title={`${tag.subject || tag.hash}`}>{tag.name}</span>
              <span className="file-actions">
                <button className="file-action-btn danger" onClick={() => handleDeleteTag(tag.name)} type="button">{t("tags.delete")}</button>
              </span>
            </div>
          ))}
          {tags.length === 0 && !showTagInput && <div className="empty-state">{t("tags.empty")}</div>}
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
          <div className="context-menu-item" onClick={() => { handleRenameBranch(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.renameBranch")}</div>
          {contextMenu.branch !== currentBranch && (
            <div className="context-menu-item" onClick={() => { setShowRebase(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.interactiveRebase")}</div>
          )}
          <div className="context-menu-item" onClick={() => { handleSetUpstream(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.setUpstream")}</div>
          {branchTracking.find((x) => x.name === contextMenu.branch)?.upstream && (
            <div className="context-menu-item" onClick={() => { handleUnsetUpstream(contextMenu.branch); setContextMenu(null); }}>{t("sidebar.unsetUpstream")}</div>
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
