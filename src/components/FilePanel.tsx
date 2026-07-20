import { useState, useCallback, useMemo } from "react";
import { useRepoStore } from "../stores/repoStore";

type FileTab = "unstaged" | "staged";

interface FileEntry { path: string; status: string; }

function getFileStatusLabel(status: string): string {
  if (status === "not_added" || status === "??") return "untracked";
  if (status === "modified" || status === "M") return "modified";
  if (status === "created" || status === "A") return "added";
  if (status === "deleted" || status === "D") return "deleted";
  if (status === "renamed") return "renamed";
  return "modified";
}

function getFileStatusIcon(status: string): string {
  switch (status) { case "untracked": return "?"; case "modified": return "M"; case "added": return "A"; case "deleted": return "D"; case "renamed": return "R"; default: return "M"; }
}

export default function FilePanel() {
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
    if (!currentRepo) return;
    setLoading(true, `Staging ${file}...`);
    try { const r = await window.gitAPI.stage(currentRepo, [file]); if (r.success) await refreshAll(); else setError(r.error || "Failed"); }
    catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll]);

  const handleUnstage = useCallback(async (file: string) => {
    if (!currentRepo) return;
    setLoading(true, `Unstaging ${file}...`);
    try { const r = await window.gitAPI.unstage(currentRepo, [file]); if (r.success) await refreshAll(); else setError(r.error || "Failed"); }
    catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll]);

  const handleDiscard = useCallback(async (file: string) => {
    if (!currentRepo) return;
    if (!window.confirm(`Discard all changes to "${file}"?`)) return;
    setLoading(true, `Discarding ${file}...`);
    try { const r = await window.gitAPI.discard(currentRepo, [file]); if (r.success) await refreshAll(); else setError(r.error || "Failed"); }
    catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll]);

  // Commit detail
  if (selectedCommit && commitDetail) {
    return (
      <div className="file-panel">
        <div className="file-panel-header">
          <div className="file-tab active">Files in {selectedCommit.substring(0, 7)}</div>
        </div>
        <div className="file-list">
          {commitDetail.files.map((f) => <div key={f} className="file-item"><span className="file-name">{f}</span></div>)}
          {commitDetail.files.length === 0 && <div className="empty-state">No files changed</div>}
        </div>
      </div>
    );
  }

  const currentFiles = activeTab === "unstaged" ? unstagedFiles : stagedFiles;

  return (
    <div className="file-panel">
      <div className="file-panel-header">
        <div className={`file-tab${activeTab === "unstaged" ? " active" : ""}`} onClick={() => setActiveTab("unstaged")}>
          Unstaged <span className="count">{unstagedFiles.length}</span>
        </div>
        <div className={`file-tab${activeTab === "staged" ? " active" : ""}`} onClick={() => setActiveTab("staged")}>
          Staged <span className="count">{stagedFiles.length}</span>
        </div>
      </div>
      <div className="file-list">
        {currentFiles.map((file) => {
          const sl = getFileStatusLabel(file.status);
          const isSel = selectedDiffFile?.path === file.path && selectedDiffFile?.isStaged === (activeTab === "staged");
          return (
            <div
              key={file.path}
              className={`file-item${isSel ? " selected" : ""}`}
              onClick={() => setSelectedDiffFile({ path: file.path, isStaged: activeTab === "staged" })}
            >
              <span className={`file-status ${sl}`}>{getFileStatusIcon(sl)}</span>
              <span className="file-name" title={file.path}>{file.path}</span>
              <span className="file-actions" onClick={(e) => e.stopPropagation()}>
                {activeTab === "unstaged" ? (
                  <button className="file-action-btn" onClick={() => handleStage(file.path)}>Stage</button>
                ) : (
                  <button className="file-action-btn" onClick={() => handleUnstage(file.path)}>Unstage</button>
                )}
                <button className="file-action-btn danger" onClick={() => handleDiscard(file.path)}>Discard</button>
              </span>
            </div>
          );
        })}
        {currentFiles.length === 0 && (
          <div className="empty-state">{activeTab === "unstaged" ? "No unstaged changes" : "No staged changes"}</div>
        )}
      </div>
    </div>
  );
}
