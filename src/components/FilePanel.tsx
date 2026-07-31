import { useMemo, useCallback, useState } from "react";
import { useRepoStore } from "../application/repoStore";
import { gitApi } from "../infrastructure/gitBridge";
import { useT } from "../i18n";

type FileTab = "unstaged" | "staged";

type FileStatus = "untracked" | "modified" | "deleted" | "renamed" | "added";

interface FileEntry {
  /** Real filesystem path used for git operations. */
  path: string;
  /** Optional display label (e.g. rename "from -> to"). */
  label?: string;
  status: FileStatus;
  /** Extra paths to pass for discard (e.g. both sides of a rename). */
  discardPaths?: string[];
}

function statLabel(s: FileStatus): string { switch (s) { case "untracked": return "U"; case "added": return "A"; case "deleted": return "D"; case "renamed": return "R"; default: return "M"; } }
function statIcon(s: FileStatus): string { switch (s) { case "untracked": return "U"; case "added": return "A"; case "deleted": return "D"; case "renamed": return "R"; default: return "M"; } }

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
      e.push({ path: r.to, label: `${r.from} \u2192 ${r.to}`, status: "renamed", discardPaths: [r.from, r.to] });
    }
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
      if (idx === "A") st = "added";
      else if (idx === "D") st = "deleted";
      else if (idx === "R") st = "renamed";
      else if (status.created.includes(f)) st = "added";
      return { path: f, status: st };
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

  if (selectedCommit && commitDetail) {
    return (<div className="file-panel"><div className="file-panel-header"><div className="file-tab active">{t("files.filesIn")} {selectedCommit.substring(0, 7)}</div></div><div className="file-list">{commitDetail.files.map((f) => { const isSel = selectedDiffFile?.path === f && selectedDiffFile?.commitHash === selectedCommit; return (<div key={f} className={`file-item${isSel ? " selected" : ""}`} onClick={() => setSelectedDiffFile({ path: f, isStaged: false, commitHash: selectedCommit })}><span className="file-name">{f}</span></div>); })}{commitDetail.files.length === 0 && <div className="empty-state">{t("files.noChanged")}</div>}</div></div>);
  }

  const currentFiles = activeTab === "unstaged" ? unstagedFiles : stagedFiles;

  return (<div className="file-panel"><div className="file-panel-header">
    <div className={`file-tab${activeTab === "unstaged" ? " active" : ""}`} onClick={() => setActiveTab("unstaged")}>{t("files.unstaged")} <span className="count">{unstagedFiles.length}</span></div>
    <div className={`file-tab${activeTab === "staged" ? " active" : ""}`} onClick={() => setActiveTab("staged")}>{t("files.staged")} <span className="count">{stagedFiles.length}</span></div>
  </div><div className="file-list">
    {currentFiles.map((file) => { const sl = statLabel(file.status); const isSel = selectedDiffFile?.path === file.path && selectedDiffFile?.isStaged === (activeTab === "staged"); const display = file.label || file.path; return (
      <div key={activeTab + ":" + file.path} className={`file-item${isSel ? " selected" : ""}`} onClick={() => setSelectedDiffFile({ path: file.path, isStaged: activeTab === "staged" })}>
        <span className={`file-status ${sl}`}>{statIcon(file.status)}</span><span className="file-name" title={display}>{display}</span>
        <span className="file-actions" onClick={(e) => e.stopPropagation()}>
          {activeTab === "unstaged" ? <button className="file-action-btn" onClick={() => handleStage(file)}>{t("files.stage")}</button> : <button className="file-action-btn" onClick={() => handleUnstage(file)}>{t("files.unstage")}</button>}
          <button className="file-action-btn danger" onClick={() => handleDiscard(file)}>{t("files.discard")}</button>
        </span>
      </div>
    ); })}
    {currentFiles.length === 0 && <div className="empty-state">{activeTab === "unstaged" ? t("files.noUnstaged") : t("files.noStaged")}</div>}
  </div></div>);
}
