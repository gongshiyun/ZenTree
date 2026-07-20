import { useState, useCallback, useMemo } from "react";
import { useRepoStore } from "../stores/repoStore";
import { useT } from "../i18n";

type FileTab = "unstaged" | "staged";
interface FileEntry { path: string; status: string; }

function statLabel(s: string) { if (s==="not_added"||s==="??") return "untracked"; if (s==="modified"||s==="M") return "modified"; if (s==="created"||s==="A") return "added"; if (s==="deleted"||s==="D") return "deleted"; if (s==="renamed") return "renamed"; return "modified"; }
function statIcon(s: string) { switch(s){case"untracked":return"?";case"modified":return"M";case"added":return"A";case"deleted":return"D";case"renamed":return"R";default:return"M";} }

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
    const e: FileEntry[] = [];
    for (const f of status.not_added || []) e.push({ path: f, status: "untracked" });
    for (const f of status.modified || []) e.push({ path: f, status: "modified" });
    for (const f of status.deleted || []) e.push({ path: f, status: "deleted" });
    for (const r of status.renamed || []) e.push({ path: `${r.from} \u2192 ${r.to}`, status: "renamed" });
    return e;
  }, [status]);

  const stagedFiles = useMemo((): FileEntry[] => {
    if (!status) return [];
    const e: FileEntry[] = [];
    for (const f of status.staged || []) { if (!status.deleted.includes(f)) e.push({ path: f, status: "modified" }); }
    for (const f of status.created || []) e.push({ path: f, status: "added" });
    return e;
  }, [status]);

  const handleStage = useCallback(async (file: string) => {
    if (!currentRepo) return; setLoading(true, t("status.staging").replace("{0}", file));
    try { const r = await window.gitAPI.stage(currentRepo, [file]); if (r.success) await refreshAll(); else setError(r.error || t("error.stageFailed")); }
    catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll]);

  const handleUnstage = useCallback(async (file: string) => {
    if (!currentRepo) return; setLoading(true, t("status.unstaging").replace("{0}", file));
    try { const r = await window.gitAPI.unstage(currentRepo, [file]); if (r.success) await refreshAll(); else setError(r.error || t("error.unstageFailed")); }
    catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll]);

  const handleDiscard = useCallback(async (file: string) => {
    if (!currentRepo) return; if (!window.confirm(t("diff.confirmDiscard").replace("{0}", file))) return;
    setLoading(true, t("status.discarding").replace("{0}", file));
    try { const r = await window.gitAPI.discard(currentRepo, [file]); if (r.success) await refreshAll(); else setError(r.error || t("error.discardFailed")); }
    catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll]);

  if (selectedCommit && commitDetail) {
    return (<div className="file-panel"><div className="file-panel-header"><div className="file-tab active">{t("files.filesIn")} {selectedCommit.substring(0, 7)}</div></div><div className="file-list">{commitDetail.files.map((f) => { const isSel = selectedDiffFile?.path === f && selectedDiffFile?.commitHash === selectedCommit; return (<div key={f} className={`file-item${isSel ? " selected" : ""}`} onClick={() => setSelectedDiffFile({ path: f, isStaged: false, commitHash: selectedCommit })}><span className="file-name">{f}</span></div>); })}{commitDetail.files.length === 0 && <div className="empty-state">{t("files.noChanged")}</div>}</div></div>);
  }

  const currentFiles = activeTab === "unstaged" ? unstagedFiles : stagedFiles;

  return (<div className="file-panel"><div className="file-panel-header">
    <div className={`file-tab${activeTab==="unstaged"?" active":""}`} onClick={()=>setActiveTab("unstaged")}>{t("files.unstaged")} <span className="count">{unstagedFiles.length}</span></div>
    <div className={`file-tab${activeTab==="staged"?" active":""}`} onClick={()=>setActiveTab("staged")}>{t("files.staged")} <span className="count">{stagedFiles.length}</span></div>
  </div><div className="file-list">
    {currentFiles.map((file) => { const sl = statLabel(file.status); const isSel = selectedDiffFile?.path === file.path && selectedDiffFile?.isStaged === (activeTab==="staged"); return (
      <div key={file.path} className={`file-item${isSel?" selected":""}`} onClick={()=>setSelectedDiffFile({path:file.path,isStaged:activeTab==="staged"})}>
        <span className={`file-status ${sl}`}>{statIcon(sl)}</span><span className="file-name" title={file.path}>{file.path}</span>
        <span className="file-actions" onClick={(e)=>e.stopPropagation()}>
          {activeTab==="unstaged" ? <button className="file-action-btn" onClick={()=>handleStage(file.path)}>{t("files.stage")}</button> : <button className="file-action-btn" onClick={()=>handleUnstage(file.path)}>{t("files.unstage")}</button>}
          <button className="file-action-btn danger" onClick={()=>handleDiscard(file.path)}>{t("files.discard")}</button>
        </span>
      </div>
    );})}
    {currentFiles.length===0 && <div className="empty-state">{activeTab==="unstaged"?t("files.noUnstaged"):t("files.noStaged")}</div>}
  </div></div>);
}
