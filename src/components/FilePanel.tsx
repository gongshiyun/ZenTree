import { useMemo, useCallback, useState } from "react";
import { useRepoStore } from "../application/repoStore";
import { gitApi } from "../infrastructure/gitBridge";
import { useT } from "../i18n";

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

export default function FilePanel() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<FileTab>("unstaged");
  const status = useRepoStore((s) => s.status);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const commitDetail = useRepoStore((s) => s.commitDetail);
  const selectedCommit = useRepoStore((s) => s.selectedCommit);
  const selectedDiffFile = useRepoStore((s) => s.selectedDiffFile);
  const setSelectedDiffFile = useRepoStore((s) => s.setSelectedDiffFile);

  const unstagedFiles = useMemo((): FileEntry[] => {
    if (!status) return [];
    const indexOf = new Map(status.files.map((f) => [f.path, f.index]));
    const e: FileEntry[] = [];
    for (const f of status.not_added || []) e.push({ path: f, status: "untracked" });
    for (const f of status.modified || []) e.push({ path: f, status: "modified" });
    for (const f of status.deleted || []) {
      // A staged deletion is fully represented in the staged tab.
      if (indexOf.get(f) === "D") continue;
      e.push({ path: f, status: "deleted" });
    }
    for (const r of status.renamed || []) {
      e.push({ path: r.to, label: `${r.from} \u2192 ${r.to}`, status: "renamed", discardPaths: [r.from, r.to], fromPath: r.from });
    }
    for (const f of status.conflicted || []) e.push({ path: f, status: "conflict" });
    return e;
  }, [status]);

  const stagedFiles = useMemo((): FileEntry[] => {
    if (!status) return [];
    const indexOf = new Map<string, string>();
    for (const f of status.files) {
      indexOf.set(f.path, f.index);
      // simple-git reports renames in files[].path as "from -> to"
      if (f.index === "R" && f.path.includes(" -> ")) {
        indexOf.set(f.path.split(" -> ")[1], "R");
      }
    }
    return status.staged.map((f) => {
      const idx = indexOf.get(f) || "";
      let st: FileStatus = "modified";
      let fromPath: string | undefined;
      if (idx === "A") st = "added";
      else if (idx === "D") st = "deleted";
      else if (idx === "R") {
        st = "renamed";
        const m = status.files.find((x) => x.index === "R" && x.path.split(" -> ")[1] === f);
        if (m) fromPath = m.path.split(" -> ")[0];
      }
      else if (status.created.includes(f)) st = "added";
      return { path: f, status: st, fromPath };
    });
  }, [status]);

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
    runOp(() => gitApi().stage(currentRepo!, [file.path]), t("status.staging").replace("{0}", file.path), t("error.stageFailed"));
  }, [runOp, currentRepo, t]);

  const handleUnstage = useCallback((file: FileEntry) => {
    runOp(() => gitApi().unstage(currentRepo!, [file.path]), t("status.unstaging").replace("{0}", file.path), t("error.unstageFailed"));
  }, [runOp, currentRepo, t]);

  const handleDiscard = useCallback((file: FileEntry) => {
    if (!currentRepo) return;
    const label = file.label || file.path;
    if (!window.confirm(t("diff.confirmDiscard").replace("{0}", label))) return;
    const paths = file.discardPaths || [file.path];
    runOp(() => gitApi().discard(currentRepo, paths), t("status.discarding").replace("{0}", label), t("error.discardFailed"));
  }, [currentRepo, runOp, t]);

  const handleResolveConflict = useCallback((file: FileEntry) => {
    if (!currentRepo) return;
    runOp(() => gitApi().mergetool(currentRepo, file.path), t("files.resolving").replace("{0}", file.path), t("error.opFailed"));
  }, [currentRepo, runOp, t]);

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

  const handleCopyHash = useCallback(() => {
    if (selectedCommit) navigator.clipboard.writeText(selectedCommit);
  }, [selectedCommit]);

  const handleOpenOnHosting = useCallback(async () => {
    if (!currentRepo || !selectedCommit) return;
    const r = await gitApi().hostingUrl(currentRepo, selectedCommit);
    if (r.success && r.data) await gitApi().openExternal(r.data);
    else setError(r.error || t("files.noRemote"));
  }, [currentRepo, selectedCommit, setError]);

  if (selectedCommit && commitDetail) {
    return (<div className="file-panel"><div className="file-panel-header">
      <div className="file-tab active">{t("files.filesIn")} {selectedCommit.substring(0, 7)}</div>
      <div className="commit-actions">
        <button className="file-action-btn" onClick={handleCopyHash} title={t("commit.copyHash")}>{t("commit.copy")}</button>
        <button className="file-action-btn" onClick={handleRevertCommit} title={t("commit.revertTip")}>{t("commit.revert")}</button>
        <button className="file-action-btn" onClick={handleCherryPick} title={t("commit.cherryPickTip")}>{t("commit.cherryPick")}</button>
        <button className="file-action-btn" onClick={handleOpenOnHosting} title={t("commit.openOnHostingTip")}>{t("commit.openOnHosting")}</button>
      </div>
    </div><div className="file-list">{commitDetail.files.map((f) => { const isSel = selectedDiffFile?.path === f && selectedDiffFile?.commitHash === selectedCommit; return (<div key={f} className={`file-item${isSel ? " selected" : ""}`} onClick={() => setSelectedDiffFile({ path: f, isStaged: false, status: "modified", commitHash: selectedCommit })}><span className="file-name">{f}</span></div>); })}{commitDetail.files.length === 0 && <div className="empty-state">{t("files.noChanged")}</div>}</div></div>);
  }

  const currentFiles = activeTab === "unstaged" ? unstagedFiles : stagedFiles;

  return (<div className="file-panel"><div className="file-panel-header">
    <div className={`file-tab${activeTab === "unstaged" ? " active" : ""}`} onClick={() => setActiveTab("unstaged")}>{t("files.unstaged")} <span className="count">{unstagedFiles.length}</span></div>
    <div className={`file-tab${activeTab === "staged" ? " active" : ""}`} onClick={() => setActiveTab("staged")}>{t("files.staged")} <span className="count">{stagedFiles.length}</span></div>
  </div><div className="file-list">
    {currentFiles.map((file) => { const sl = statLabel(file.status); const isSel = selectedDiffFile?.path === file.path && selectedDiffFile?.isStaged === (activeTab === "staged"); const display = file.label || file.path; return (
      <div key={activeTab + ":" + file.path} className={`file-item${isSel ? " selected" : ""}${file.status === "conflict" ? " conflict" : ""}`} onClick={() => setSelectedDiffFile({ path: file.path, isStaged: activeTab === "staged", status: file.status, fromPath: file.fromPath })}>
        <span className={`file-status ${sl}`}>{statIcon(file.status)}</span><span className="file-name" title={display}>{display}</span>
        <span className="file-actions" onClick={(e) => e.stopPropagation()}>
          {file.status === "conflict"
            ? <button className="file-action-btn" onClick={() => handleResolveConflict(file)}>{t("files.resolve")}</button>
            : (activeTab === "unstaged" ? <button className="file-action-btn" onClick={() => handleStage(file)}>{t("files.stage")}</button> : <button className="file-action-btn" onClick={() => handleUnstage(file)}>{t("files.unstage")}</button>)}
          {file.status !== "conflict" && <button className="file-action-btn danger" onClick={() => handleDiscard(file)}>{t("files.discard")}</button>}
        </span>
      </div>
    ); })}
    {currentFiles.length === 0 && <div className="empty-state">{activeTab === "unstaged" ? t("files.noUnstaged") : t("files.noStaged")}</div>}
  </div></div>);
}
