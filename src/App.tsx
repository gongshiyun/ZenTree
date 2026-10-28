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
import TabBar from "./components/TabBar";
import TabPicker from "./components/TabPicker";
import { repoDisplayName } from "./domain/tabs/displayName";

function Welcome() {
  const t = useT();
  const handleOpen = async () => {
    const path = await gitApi().openDirectory();
    if (path) {
      const store = useRepoStore.getState();
      store.addRepo(path, repoDisplayName(path));
      store.openTab(path);
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
      const store = useRepoStore.getState();
      store.addRepo(dp, repoDisplayName(dp));
      store.openTab(dp);
    } else {
      useRepoStore.getState().setError(`"${dp}" ${t("app.invalidRepo")}`);
    }
  };
  return (
    <div className="welcome" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "link"; }} onDrop={handleDrop}>
      <span className="welcome-mark" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M10 2.4v15.2" />
          <path d="M3.4 6.2 16.6 13.8" />
          <path d="M16.6 6.2 3.4 13.8" />
        </svg>
      </span>
      <h1>ZenTree</h1>
      <p className="welcome-desc">{t("app.welcome")}</p>
      <div className="welcome-actions">
        <button className="open-btn" onClick={handleOpen} type="button">{t("app.openRepo")}</button>
        <button className="open-btn secondary" onClick={() => useRepoStore.getState().setShowClone(true)} type="button">{t("app.cloneRepo")}</button>
      </div>
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
  const customTabs = useRepoStore((s) => s.customTabs);
  const groupView = useRepoStore((s) => s.groupView);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const setError = useRepoStore((s) => s.setError);

  // Restore language, theme, saved repos and the last opened repository.
  useEffect(() => {
    useRepoStore.getState().initFromSettings();
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "F5") { e.preventDefault(); if (currentRepo) refreshAll(); }
    if (e.key === "Escape") {
      setError(null);
      // Esc dismisses any modal surface, not just the error banner.
      const s = useRepoStore.getState();
      if (s.showCommandPalette) s.setShowCommandPalette(false);
      if (s.showTabPicker) s.setShowTabPicker(false);
      if (s.showSettings) s.setShowSettings(false);
      if (s.showClone) s.setShowClone(false);
      if (s.showCompare) s.setShowCompare(false);
      if (s.showRebase) s.setShowRebase(null);
      if (s.showRepoGroups) s.setShowRepoGroups(false);
    }
    // Shortcuts below must not fire while typing in an input.
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
      e.preventDefault();
      if (currentRepo) {
        gitApi().stageAll(currentRepo)
          .then((r) => { if (!r.success) setError(r.error || t("error.stageFailed")); return refreshAll(); });
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "U") {
      e.preventDefault();
      if (currentRepo) {
        gitApi().unstageAll(currentRepo)
          .then((r) => { if (!r.success) setError(r.error || t("error.unstageFailed")); return refreshAll(); });
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      useRepoStore.getState().setShowCommandPalette(!useRepoStore.getState().showCommandPalette);
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "p") {
      e.preventDefault();
      const store = useRepoStore.getState();
      store.setShowTabPicker(!store.showTabPicker);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Tab") {
      e.preventDefault();
      useRepoStore.getState().cycleTab(e.shiftKey ? -1 : 1);
    }
    // Close tab on Ctrl+Shift+W, not the expected Ctrl+W: the shortcut set is
    // documented and stable, and on Windows Electron would otherwise consume
    // Ctrl+W at the application-menu level before the renderer sees it.
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "w") {
      e.preventDefault();
      const store = useRepoStore.getState();
      if (store.currentRepo) store.closeTab(store.currentRepo);
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
      {/* The tab strip is repository chrome: on the welcome screen it is pure
          noise, so it only renders once at least one tab is open. */}
      {(currentRepo || customTabs.length > 0 || groupView) && <TabBar />}
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
      <TabPicker />
      {showRebase && <RebaseDialog onClose={() => useRepoStore.getState().setShowRebase(null)} />}
      {showRepoGroups && <RepoGroupDialog onClose={() => useRepoStore.getState().setShowRepoGroups(false)} />}
    </div>
  );
}
