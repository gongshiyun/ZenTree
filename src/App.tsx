import { useEffect, useCallback } from "react";
import { useRepoStore } from "./stores/repoStore";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import CommitGraph from "./components/CommitGraph";
import FilePanel from "./components/FilePanel";
import CommitBar from "./components/CommitBar";
import StatusBar from "./components/StatusBar";
import SettingsDialog from "./components/SettingsDialog";
import DiffPanel from "./components/DiffPanel";

function Welcome() {
  const handleOpen = async () => {
    const api = window.gitAPI;
    if (!api) return;
    const path = await api.openDirectory();
    if (path) {
      const name = path.split(/[/\\]/).pop() || path;
      useRepoStore.getState().addRepo(path, name);
      useRepoStore.getState().setCurrentRepo(path);
      useRepoStore.getState().refreshAll(path);
    }
  };

  return (
    <div className="welcome" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "link"; }} onDrop={async (e) => {
      e.preventDefault(); const files = e.dataTransfer.files;
      if (files.length > 0) {
        const dp = files[0].path; const api = window.gitAPI; if (!api) return;
        const r = await api.isRepo(dp);
        if (r.success && r.data) { const nm = dp.split(/[/\\]/).pop() || dp; useRepoStore.getState().addRepo(dp, nm); useRepoStore.getState().setCurrentRepo(dp); useRepoStore.getState().refreshAll(dp); }
        else { useRepoStore.getState().setError(`"${dp}" is not a valid Git repository.`); }
      }
    }}>
      <h1>ZenTree</h1>
      <p>A lightweight Git GUI client. Open a repository to see your commit graph, stage files, and commit changes.</p>
      <button className="open-btn" onClick={handleOpen}>+ Open Repository</button>
      <p style={{ marginTop: 16, fontSize: 11, color: "var(--text-muted)" }}>Or drag and drop a Git repository folder here</p>
    </div>
  );
}

export default function App() {
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const selectedDiffFile = useRepoStore((s) => s.selectedDiffFile);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const setError = useRepoStore((s) => s.setError);

  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
    if (e.key === "F5") { e.preventDefault(); if (currentRepo) refreshAll(); }
    if (e.key === "Escape") setError(null);
  }, [currentRepo, refreshAll, setError]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="app-layout">
      <TopBar />
      {currentRepo ? (
        <>
          <div className="main-content">
            <Sidebar />
            <div className={`center-area${selectedDiffFile ? " has-diff" : ""}`}>
              <CommitGraph />
              <FilePanel />
            </div>
            <DiffPanel />
          </div>
          <CommitBar />
          <StatusBar />
        </>
      ) : (
        <Welcome />
      )}
      <SettingsDialog />
    </div>
  );
}
