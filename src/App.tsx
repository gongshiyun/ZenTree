import { useEffect, useCallback } from "react";
import { useRepoStore } from "./application/repoStore";
import { useT } from "./i18n";
import { gitApi } from "./infrastructure/gitBridge";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import CommitGraph from "./components/CommitGraph";
import FilePanel from "./components/FilePanel";
import CommitBar from "./components/CommitBar";
import StatusBar from "./components/StatusBar";
import SettingsDialog from "./components/SettingsDialog";
import DiffPanel from "./components/DiffPanel";

function Welcome() {
  const t = useT();
  const handleOpen = async () => {
    const path = await gitApi().openDirectory();
    if (path) {
      const nm = path.split(/[/\\]/).pop() || path;
      const store = useRepoStore.getState();
      store.addRepo(path, nm);
      store.setCurrentRepo(path);
      store.refreshAll(path);
    }
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    const dp = (files[0] as File & { path?: string }).path || "";
    if (!dp) return;
    const r = await gitApi().isRepo(dp);
    if (r.success && r.data) {
      const nm = dp.split(/[/\\]/).pop() || dp;
      const store = useRepoStore.getState();
      store.addRepo(dp, nm);
      store.setCurrentRepo(dp);
      store.refreshAll(dp);
    } else {
      useRepoStore.getState().setError(`"${dp}" ${t("app.invalidRepo")}`);
    }
  };
  return (
    <div className="welcome" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "link"; }} onDrop={handleDrop}>
      <h1>ZenTree</h1>
      <p>{t("app.welcome")}</p>
      <button className="open-btn" onClick={handleOpen}>{t("app.openRepo")}</button>
      <p style={{ marginTop: 16, fontSize: 11, color: "var(--text-muted)" }}>{t("app.dragHint")}</p>
    </div>
  );
}

export default function App() {
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const selectedDiffFile = useRepoStore((s) => s.selectedDiffFile);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const setError = useRepoStore((s) => s.setError);

  // Restore language, theme, saved repos and the last opened repository.
  useEffect(() => {
    useRepoStore.getState().initFromSettings();
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "F5") { e.preventDefault(); if (currentRepo) refreshAll(); }
    if (e.key === "Escape") setError(null);
  }, [currentRepo, refreshAll, setError]);

  useEffect(() => { window.addEventListener("keydown", handleKeyDown); return () => window.removeEventListener("keydown", handleKeyDown); }, [handleKeyDown]);

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
      ) : (<Welcome />)}
      <SettingsDialog />
    </div>
  );
}
