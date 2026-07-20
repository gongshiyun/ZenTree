import { useState, useCallback, useMemo } from "react";
import { useRepoStore } from "../stores/repoStore";
import DiffViewer from "./DiffViewer";

type FileTab = "unstaged" | "staged";

interface FileEntry {
  path: string;
  status: string;
}

function getFileStatusLabel(status: string): string {
  if (status === "not_added" || status === "??") return "untracked";
  if (status === "modified" || status === "M") return "modified";
  if (status === "created" || status === "A") return "added";
  if (status === "deleted" || status === "D") return "deleted";
  if (status === "renamed") return "renamed";
  return "modified";
}

function getFileStatusIcon(status: string): string {
  switch (status) {
    case "untracked": return "?";
    case "modified": return "M";
    case "added": return "A";
    case "deleted": return "D";
    case "renamed": return "R";
    default: return "M";
  }
}

export default function FilePanel() {
  const [activeTab, setActiveTab] = useState<FileTab>("unstaged");
  const [selectedFile, setSelectedFile] = useState<{ path: string; isStaged: boolean } | null>(null);

  const status = useRepoStore((s) => s.status);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const commitDetail = useRepoStore((s) => s.commitDetail);
  const selectedCommit = useRepoStore((s) => s.selectedCommit);

  const unstagedFiles = useMemo((): FileEntry[] => {
    if (!status) return [];
    const entries: FileEntry[] = [];
    for (const f of status.not_added || []) entries.push({ path: f, status: "untracked" });
    for (const f of status.modified || []) entries.push({ path: f, status: "modified" });
    for (const f of status.deleted || []) entries.push({ path: f, status: "deleted" });
    for (const r of status.renamed || []) entries.push({ path: `${r.from} \u2192 ${r.to}`, status: "renamed" });
    return entries;
  }, [status]);

  const stagedFiles = useMemo((): FileEntry[] => {
    if (!status) return [];
    const entries: FileEntry[] = [];
    for (const f of status.staged || []) {
      if (!status.deleted.includes(f)) entries.push({ path: f, status: "modified" });
    }
    for (const f of status.created || []) entries.push({ path: f, status: "added" });
    return entries;
  }, [status]);

  const handleStage = useCallback(async (file: string) => {
    if (!currentRepo) return;
    setLoading(true, `Staging ${file}...`);
    try {
      const result = await window.gitAPI.stage(currentRepo, [file]);
      if (result.success) await refreshAll();
      else setError(result.error || "Failed to stage file");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll]);

  const handleUnstage = useCallback(async (file: string) => {
    if (!currentRepo) return;
    setLoading(true, `Unstaging ${file}...`);
    try {
      const result = await window.gitAPI.unstage(currentRepo, [file]);
      if (result.success) await refreshAll();
      else setError(result.error || "Failed to unstage file");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll]);

  const handleDiscard = useCallback(async (file: string) => {
    if (!currentRepo) return;
    const confirmed = window.confirm(`Discard all changes to "${file}"? This cannot be undone.`);
    if (!confirmed) return;
    setLoading(true, `Discarding ${file}...`);
    try {
      const result = await window.gitAPI.discard(currentRepo, [file]);
      if (result.success) await refreshAll();
      else setError(result.error || "Failed to discard changes");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll]);

  // Show diff viewer for selected file
  if (selectedFile) {
    return (
      <div className="file-panel">
        <DiffViewer
          filePath={selectedFile.path}
          isStaged={selectedFile.isStaged}
          onClose={() => { setSelectedFile(null); refreshAll(); }}
        />
      </div>
    );
  }

  // Show commit detail if a commit is selected
  if (selectedCommit && commitDetail) {
    return (
      <div className="file-panel">
        <div className="file-panel-header">
          <div className="file-tab active">Files in {selectedCommit.substring(0, 7)}</div>
        </div>
        <div className="file-list">
          {commitDetail.files.map((file) => (
            <div key={file} className="file-item"><span className="file-name">{file}</span></div>
          ))}
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
          const statusLabel = getFileStatusLabel(file.status);
          return (
            <div key={file.path} className="file-item" onClick={() => setSelectedFile({ path: file.path, isStaged: activeTab === "staged" })}>
              <span className={`file-status ${statusLabel}`}>{getFileStatusIcon(statusLabel)}</span>
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
          <div className="empty-state">
            {activeTab === "unstaged" ? "No unstaged changes" : "No staged changes — stage files to commit"}
          </div>
        )}
      </div>
    </div>
  );
}
