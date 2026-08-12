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
import CloneDialog from "./components/CloneDialog";
import CompareDialog from "./components/CompareDialog";
import RebaseDialog from "./components/RebaseDialog";
import RepoGroupDialog from "./components/RepoGroupDialog";
import CommandPalette from "./components/CommandPalette";

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
      <button className="open-btn secondary" onClick={() => useRepoStore.getState().setShowClone(true)}>{t("app.cloneRepo")}</button>
      <p className="welcome-hint">{t("app.dragHint")}</p>
    </div>
  );
}

export default function App() {
  const t = useT();
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const selectedDiffFile = useRepoStore((s) => s.selectedDiffFile);
  const showRebase = useRepoStore((s) => s.showRebase);
  const showRepoGroups = useRepoStore((s) => s.showRepoGroups);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const setError = useRepoStore((s) => s.setError);

  // Restore language, theme, saved repos and the last opened repository.
  useEffect(() => {
    useRepoStore.getState().initFromSettings();
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "F5") { e.preventDefault(); if (currentRepo) refreshAll(); }
    if (e.key === "Escape") setError(null);
    // Shortcuts below must not fire while typing in an input.
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
      e.preventDefault();
      if (currentRepo) { gitApi().stageAll(currentRepo).then(() => refreshAll()); }
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "U") {
      e.preventDefault();
      if (currentRepo) { gitApi().unstageAll(currentRepo).then(() => refreshAll()); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      useRepoStore.getState().setShowCommandPalette(!useRepoStore.getState().showCommandPalette);
    }
    if (e.key === "Delete") {
      const store = useRepoStore.getState();
      if (store.currentRepo && store.selectedFiles.length > 0) {
        e.preventDefault();
        if (window.confirm(t("files.confirmDiscardSelected").replace("{0}", String(store.selectedFiles.length)))) {
          gitApi().discard(store.currentRepo, store.selectedFiles).then((r) => {
            store.setSelectedFiles([]);
            if (r.success) refreshAll();
            else setError(r.error || "");
          });
        }
      }
    }
  }, [currentRepo, refreshAll, setError, t]);

  // Wire the application-level keyboard shortcuts to the window.
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Incremental refresh: watch events drive silent short-circuited refreshes.
  useEffect(() => {
    const dispose = gitApi().onRepoChanged?.(() => { useRepoStore.getState().silentDiffRefresh(); });
    return () => { dispose?.(); };
  }, []);

  // Quiet auto-refresh fallback: every 30s and on window focus, detect external changes.
  useEffect(() => {
    const timer = setInterval(() => {
      if (useRepoStore.getState().currentRepo) useRepoStore.getState().silentDiffRefresh();
    }, 30000);
    const onFocus = () => {
      if (useRepoStore.getState().currentRepo) useRepoStore.getState().silentDiffRefresh();
    };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, []);

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
      <CloneDialog />
      <CompareDialog />
      <CommandPalette />
      {showRebase && <RebaseDialog onClose={() => useRepoStore.getState().setShowRebase(null)} />}
      {showRepoGroups && <RepoGroupDialog onClose={() => useRepoStore.getState().setShowRepoGroups(false)} />}
    </div>
  );
}
