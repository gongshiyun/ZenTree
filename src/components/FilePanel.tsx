import { useMemo, useCallback, useState } from "react";
import { useRepoStore } from "../application/repoStore";
import { gitApi } from "../infrastructure/gitBridge";
import { useT } from "../i18n";
import { buildFileTree } from "../domain/files/tree";
import MergePanel from "./MergePanel";
import type { FileTreeNode } from "../domain/files/tree";

type FileTab = "unstaged" | "staged";

type FileStatus = "untracked" | "modified" | "deleted" | "renamed" | "added" | "conflict";

interface FileEntry {
  /** Real filesystem path used for git operations. */
  path: string;
  /** Optional display label (e.g. rename "from -> to"). */
  label?: string;
  status: FileStatus;
  /** Extra paths to pass for discard (e.g. both sides of a rename). */
  discardPaths?: string[];
  /** Original path for renames, so the diff can be shown against it. */
  fromPath?: string;
}

function statLabel(s: FileStatus): string { switch (s) { case "untracked": return "U"; case "added": return "A"; case "deleted": return "D"; case "renamed": return "R"; case "conflict": return "C"; default: return "M"; } }
function statIcon(s: FileStatus): string { switch (s) { case "untracked": return "U"; case "added": return "A"; case "deleted": return "D"; case "renamed": return "R"; case "conflict": return "C"; default: return "M"; } }

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

/** Folder glyph for the file tree (inline SVG, follows currentColor). */
function FolderIcon() {
  return (
    <svg className="tree-dir-icon" width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1.5 3.25c0-.55.45-1 1-1h2.6l1.2 1.4h5.2c.55 0 1 .45 1 1v5.1c0 .55-.45 1-1 1H2.5c-.55 0-1-.45-1-1v-6.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Paths a selection operation must touch. A rename is split across two paths
 * (old + new); discarding only one side leaves the other behind, so the whole
 * set travels with the selection.
 */
function selectionPaths(file: FileEntry): string[] {
  return file.discardPaths && file.discardPaths.length > 0 ? file.discardPaths : [file.path];
}

export default function FilePanel() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<FileTab>("unstaged");
  const [showTree, setShowTree] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const status = useRepoStore((s) => s.status);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const commitDetail = useRepoStore((s) => s.commitDetail);
  const selectedCommit = useRepoStore((s) => s.selectedCommit);
  const selectedDiffFile = useRepoStore((s) => s.selectedDiffFile);
  const setSelectedDiffFile = useRepoStore((s) => s.setSelectedDiffFile);
  const selectedFiles = useRepoStore((s) => s.selectedFiles);
  const setSelectedFiles = useRepoStore((s) => s.setSelectedFiles);

  const [fileMenu, setFileMenu] = useState<{ x: number; y: number; file: FileEntry } | null>(null);
  const [mergeFile, setMergeFile] = useState<string | null>(null);

  const statusFiles = useMemo(() => (status?.files || []).map((f) => {
    let path = f.path;
    let fromPath = (f as { from?: string }).from;
    const arrow = path.indexOf(" -> ");
    if (arrow >= 0) {
      fromPath = path.substring(0, arrow);
      path = path.substring(arrow + 4);
    }
    return { path, fromPath, index: f.index, workingDir: f.working_dir };
  }), [status]);

  const unstagedFiles = useMemo((): FileEntry[] => {
    if (!status) return [];
    const e: FileEntry[] = [];
    for (const f of statusFiles) {
      if (status.conflicted.includes(f.path)) {
        e.push({ path: f.path, status: "conflict" });
      } else if (f.index === "?" || f.workingDir === "?") {
        e.push({ path: f.path, status: "untracked" });
      } else if (f.workingDir === "D") {
        e.push({ path: f.path, status: "deleted" });
      } else if (f.workingDir === "R" || f.workingDir === "C") {
        const from = f.fromPath || f.path;
        e.push({ path: f.path, label: `${from} \u2192 ${f.path}`, status: "renamed", discardPaths: [from, f.path], fromPath: f.fromPath });
      } else if (f.workingDir !== " ") {
        e.push({ path: f.path, status: "modified" });
      }
    }
    return e;
  }, [status, statusFiles]);

  const stagedFiles = useMemo((): FileEntry[] => {
    if (!status) return [];
    return statusFiles.filter((f) => f.index !== " " && f.index !== "?" && f.index !== "U").map((f) => {
      let st: FileStatus = "modified";
      if (f.index === "A") st = "added";
      else if (f.index === "D") st = "deleted";
      else if (f.index === "R" || f.index === "C") {
        st = "renamed";
      }
      const label = st === "renamed" && f.fromPath ? `${f.fromPath} \u2192 ${f.path}` : undefined;
      return {
        path: f.path,
        label,
        status: st,
        fromPath: f.fromPath,
        discardPaths: st === "renamed" && f.fromPath ? [f.fromPath, f.path] : undefined,
      };
    });
  }, [status, statusFiles]);

  const runOp = useCallback(async (op: () => Promise<{ success: boolean; error?: string }>, label: string, okMsg: string) => {
    if (!currentRepo) return;
    setLoading(true, label);
    try {
      const r = await op();
      if (r.success) await refreshAll();
      else setError(r.error || okMsg);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll]);

  const handleStage = useCallback((file: FileEntry) => {
    // A rename is two index entries: pass both sides so the change is not split
    // into a deletion on the other tab.
    const paths = file.discardPaths || [file.path];
    runOp(() => gitApi().stage(currentRepo!, paths), t("status.staging").replace("{0}", file.path), t("error.stageFailed"));
  }, [runOp, currentRepo, t]);

  const handleUnstage = useCallback((file: FileEntry) => {
    // Symmetric to handleStage: unstage both sides of a rename together.
    const paths = file.discardPaths || [file.path];
    runOp(() => gitApi().unstage(currentRepo!, paths), t("status.unstaging").replace("{0}", file.path), t("error.unstageFailed"));
  }, [runOp, currentRepo, t]);

  const handleDiscard = useCallback((file: FileEntry) => {
    if (!currentRepo) return;
    const label = file.label || file.path;
    if (!window.confirm(t("diff.confirmDiscard").replace("{0}", label))) return;
    const paths = file.discardPaths || [file.path];
    runOp(() => gitApi().discard(currentRepo, paths), t("status.discarding").replace("{0}", label), t("error.discardFailed"));
  }, [currentRepo, runOp, t]);

  const handleStashFile = useCallback((file: FileEntry) => {
    if (!currentRepo) return;
    runOp(() => gitApi().stashSave(currentRepo, undefined, [file.path]), t("status.stashing").replace("{0}", file.path), t("error.opFailed"));
  }, [currentRepo, runOp, t]);

  const handleStageAll = useCallback(() => {
    if (!currentRepo) return;
    runOp(() => gitApi().stageAll(currentRepo), t("status.staging").replace("{0}", t("files.all")), t("error.stageFailed"));
  }, [currentRepo, runOp, t]);

  const handleUnstageAll = useCallback(() => {
    if (!currentRepo) return;
    runOp(() => gitApi().unstageAll(currentRepo), t("status.unstaging").replace("{0}", t("files.all")), t("error.unstageFailed"));
  }, [currentRepo, runOp, t]);

  const handleResolveConflict = useCallback((file: FileEntry) => {
    // Built-in three-way panel first; binary/oversized files fall back to mergetool inside it.
    setMergeFile(file.path);
  }, []);

  const handleRevertCommit = useCallback(async () => {
    if (!currentRepo || !selectedCommit) return;
    if (!window.confirm(t("commit.confirmRevert").replace("{0}", selectedCommit.substring(0, 7)))) return;
    setLoading(true, t("commit.reverting"));
    try {
      const r = await gitApi().revertCommit(currentRepo, selectedCommit);
      if (r.success) await refreshAll();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, selectedCommit, setLoading, setError, refreshAll, t]);

  const handleCherryPick = useCallback(async () => {
    if (!currentRepo || !selectedCommit) return;
    if (!window.confirm(t("commit.confirmCherryPick").replace("{0}", selectedCommit.substring(0, 7)))) return;
    setLoading(true, t("commit.cherryPicking"));
    try {
      const r = await gitApi().cherryPick(currentRepo, selectedCommit);
      if (r.success) await refreshAll();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, selectedCommit, setLoading, setError, refreshAll, t]);

  const handleCheckoutFileVersion = useCallback((file: FileEntry, ref: string) => {
    if (!currentRepo) return;
    if (!window.confirm(t("files.confirmCheckoutFile").replace("{0}", file.path).replace("{1}", ref.substring(0, 7)))) return;
    runOp(() => gitApi().checkoutFile(currentRepo, ref, file.path), t("files.checkingOut").replace("{0}", file.path), t("error.opFailed"));
  }, [currentRepo, runOp, t]);

  const handleFileMenu = useCallback((e: React.MouseEvent, file: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setFileMenu({ x: e.clientX, y: e.clientY, file });
  }, []);

  const toggleSelectFile = useCallback((e: React.MouseEvent, file: FileEntry) => {
    // Ctrl/Cmd+click toggles multi-selection (Delete discards the selection).
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const paths = selectionPaths(file);
      const isSelected = paths.some((p) => selectedFiles.includes(p));
      if (isSelected) {
        setSelectedFiles(selectedFiles.filter((p) => !paths.includes(p)));
      } else {
        // Keep both sides of a rename so Delete cannot leave a half-discarded pair.
        const additions = paths.filter((p) => !selectedFiles.includes(p));
        setSelectedFiles([...selectedFiles, ...additions]);
      }
    }
  }, [selectedFiles, setSelectedFiles]);

  const handleDiscardSelected = useCallback(() => {
    if (!currentRepo || selectedFiles.length === 0) return;
    if (!window.confirm(t("files.confirmDiscardSelected").replace("{0}", String(selectedFiles.length)))) return;
    runOp(() => gitApi().discard(currentRepo, selectedFiles), t("status.discarding").replace("{0}", t("files.selected")), t("error.discardFailed"));
    setSelectedFiles([]);
  }, [currentRepo, selectedFiles, runOp, setSelectedFiles, t]);

  const handleCopyHash = useCallback(() => {
    if (selectedCommit) navigator.clipboard.writeText(selectedCommit);
  }, [selectedCommit]);

  const handleOpenOnHosting = useCallback(async () => {
    if (!currentRepo || !selectedCommit) return;
    const r = await gitApi().hostingUrl(currentRepo, selectedCommit);
    if (r.success && r.data) await gitApi().openExternal(r.data);
    else setError(r.error || t("files.noRemote"));
  }, [currentRepo, selectedCommit, setError]);

  const currentFiles = activeTab === "unstaged" ? unstagedFiles : stagedFiles;
  const tree = useMemo(() => buildFileTree(currentFiles.map((f) => f.path)), [currentFiles]);
  const fileByPath = useMemo(() => new Map(currentFiles.map((f) => [f.path, f])), [currentFiles]);

  const toggleDir = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  if (selectedCommit && commitDetail) {
    const totals = (commitDetail.stats || []).reduce(
      (acc, s) => (s.binary ? acc : { add: acc.add + s.additions, del: acc.del + s.deletions }),
      { add: 0, del: 0 },
    );
    return (
      <div className="file-panel">
        <div className="file-panel-header commit-detail-header">
          <div className="file-tab active commit-detail-tab">
            <span className="commit-detail-label">{t("files.filesIn")}</span>{" "}
            <span className="commit-hash-pill">{selectedCommit.substring(0, 7)}</span>
          </div>
          <span className="file-panel-spacer" />
          <div className="commit-actions">
            <button className="file-action-btn" onClick={handleCopyHash} title={t("commit.copyHash")}>{t("commit.copy")}</button>
            <button className="file-action-btn" onClick={handleRevertCommit} title={t("commit.revertTip")}>{t("commit.revert")}</button>
            <button className="file-action-btn" onClick={handleCherryPick} title={t("commit.cherryPickTip")}>{t("commit.cherryPick")}</button>
            <button className="file-action-btn" onClick={handleOpenOnHosting} title={t("commit.openOnHostingTip")}>{t("commit.openOnHosting")}</button>
          </div>
        </div>
        <div className="commit-detail-body">
          <div className="commit-detail-subject" title={commitDetail.subject}>{commitDetail.subject}</div>
          <div className="commit-detail-meta">
            <span className="commit-detail-author">{commitDetail.author}</span>
            <span className="commit-detail-sep" aria-hidden="true">&middot;</span>
            <span className="commit-detail-time">{formatTimestamp(commitDetail.timestamp)}</span>
            {(totals.add > 0 || totals.del > 0) && (
              <span className="commit-detail-stats">
                <span className="stat-add">+{totals.add}</span>
                <span className="stat-del">-{totals.del}</span>
              </span>
            )}
          </div>
        </div>
        <div className="file-list">
          {commitDetail.files.map((f) => {
            const isSel = selectedDiffFile?.path === f && selectedDiffFile?.commitHash === selectedCommit;
            const st = commitDetail.stats?.find((s) => s.path === f);
            return (
              <div key={f} className={`file-item${isSel ? " selected" : ""}`} onClick={() => setSelectedDiffFile({ path: f, isStaged: false, status: "modified", commitHash: selectedCommit })} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setFileMenu({ x: e.clientX, y: e.clientY, file: { path: f, status: "modified" } }); }}>
                <span className="file-name" title={f}>{f}</span>
                {st && !st.binary && (<span className="file-stat"><span className="stat-add">+{st.additions}</span><span className="stat-del">-{st.deletions}</span></span>)}
              </div>
            );
          })}
          {commitDetail.files.length === 0 && (
            <div className="empty-state file-list-empty">
              <span className="empty-icon" aria-hidden="true">&#10003;</span>
              <span className="empty-title">{t("files.noChanged")}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const renderFileRow = (file: FileEntry) => {
    const sl = statLabel(file.status);
    const isSel = selectedDiffFile?.path === file.path && selectedDiffFile?.isStaged === (activeTab === "staged");
    const isSelMulti = selectionPaths(file).some((p) => selectedFiles.includes(p));
    const display = file.label || file.path;
    return (
      <div className={`file-item${isSel ? " selected" : ""}${isSelMulti ? " multi-selected" : ""}${file.status === "conflict" ? " conflict" : ""}`} onClick={(e) => { toggleSelectFile(e, file); if (!e.defaultPrevented) setSelectedDiffFile({ path: file.path, isStaged: activeTab === "staged", status: file.status, fromPath: file.fromPath }); }} onContextMenu={(e) => handleFileMenu(e, file)} title={t("files.multiSelectHint")}>
        <span className={`file-status ${file.status}`}>{sl}</span><span className="file-name" title={display}>{display}</span>
        <span className="file-actions" onClick={(e) => e.stopPropagation()}>
          {file.status === "conflict"
            ? <button className="file-action-btn" onClick={() => handleResolveConflict(file)}>{t("files.resolve")}</button>
            : <button className="file-action-btn" onClick={() => handleStashFile(file)} title={t("files.stashTip")}>{t("files.stash")}</button>}
          {file.status === "conflict"
            ? null
            : (activeTab === "unstaged" ? <button className="file-action-btn" onClick={() => handleStage(file)}>{t("files.stage")}</button> : <button className="file-action-btn" onClick={() => handleUnstage(file)}>{t("files.unstage")}</button>)}
          {file.status !== "conflict" && <button className="file-action-btn danger" onClick={() => handleDiscard(file)}>{t("files.discard")}</button>}
        </span>
      </div>
    );
  };

  const renderTree = (nodes: FileTreeNode[], depth: number): React.ReactNode => (
    nodes.map((node) => {
      if (node.type === "dir") {
        const isCollapsed = collapsed.has(node.path);
        return (
          <div key={node.path}>
            <div className="tree-dir" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => toggleDir(node.path)}>
              <span className="tree-arrow">{isCollapsed ? "\u25B6" : "\u25BC"}</span>
              <FolderIcon />
              <span className="tree-dir-name">{node.name}</span>
            </div>
            {!isCollapsed && node.children && renderTree(node.children, depth + 1)}
          </div>
        );
      }
      const file = fileByPath.get(node.path);
      if (!file) return null;
      return <div key={node.path} style={{ paddingLeft: depth * 14 }}>{renderFileRow(file)}</div>;
    })
  );

  return (
    <div className="file-panel">
      <div className="file-panel-header">
        <div className="file-tabs" role="tablist">
          <div className={`file-tab${activeTab === "unstaged" ? " active" : ""}`} role="tab" aria-selected={activeTab === "unstaged"} onClick={() => setActiveTab("unstaged")}>{t("files.unstaged")} <span className="count">{unstagedFiles.length}</span></div>
          <div className={`file-tab${activeTab === "staged" ? " active" : ""}`} role="tab" aria-selected={activeTab === "staged"} onClick={() => setActiveTab("staged")}>{t("files.staged")} <span className="count">{stagedFiles.length}</span></div>
        </div>
        <span className="file-panel-spacer" />
        <div className="file-panel-actions">
          <button className="file-action-btn" onClick={() => setShowTree(!showTree)} title={showTree ? t("files.flatView") : t("files.treeView")}>{showTree ? "\u2630" : "\u25C4"}</button>
          {activeTab === "unstaged" && unstagedFiles.length > 0 && (
            <button className="file-action-btn" onClick={handleStageAll} title={t("files.stageAllTip")}>{t("files.stageAll")}</button>
          )}
          {activeTab === "staged" && stagedFiles.length > 0 && (
            <button className="file-action-btn" onClick={handleUnstageAll} title={t("files.unstageAllTip")}>{t("files.unstageAll")}</button>
          )}
        </div>
      </div>
      <div className="file-list">
        {showTree ? renderTree(tree, 0) : currentFiles.map((file) => <div key={activeTab + ":" + file.path}>{renderFileRow(file)}</div>)}
        {currentFiles.length === 0 && (
          <div className="empty-state file-list-empty">
            <span className="empty-icon" aria-hidden="true">{activeTab === "unstaged" ? "\u2713" : "\u2191"}</span>
            <span className="empty-title">{activeTab === "unstaged" ? t("files.noUnstaged") : t("files.noStaged")}</span>
          </div>
        )}
      </div>
  {fileMenu && (
    <div className="context-menu" style={{ left: fileMenu.x, top: fileMenu.y }}>
      {!selectedCommit && (
        <div className="context-menu-item" onClick={() => { handleDiscard(fileMenu.file); setFileMenu(null); }}>{t("files.restoreHead")}</div>
      )}
      {selectedCommit && (
        <div className="context-menu-item" onClick={() => { handleCheckoutFileVersion(fileMenu.file, selectedCommit); setFileMenu(null); }}>{t("files.checkoutThisVersion")}</div>
      )}
      <div className="context-menu-item" onClick={async () => { await navigator.clipboard.writeText(fileMenu.file.path); setFileMenu(null); }}>{t("files.copyPath")}</div>
    </div>
  )}
  {mergeFile && <MergePanel filePath={mergeFile} onClose={() => setMergeFile(null)} />}
  </div>);
}
