import { useCallback, useRef, useState } from "react";
import { useRepoStore } from "../stores/repoStore";

export default function TopBar() {
  const repos = useRepoStore((s) => s.repos);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setCurrentRepo = useRepoStore((s) => s.setCurrentRepo);
  const theme = useRepoStore((s) => s.themePreset);
  const isDark = useRepoStore((s) => s.isDark);
  const setThemePreset = useRepoStore((s) => s.setThemePreset);
  const setShowSettings = useRepoStore((s) => s.setShowSettings);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const loading = useRepoStore((s) => s.loading);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const [searchText, setSearchText] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredRepos = repos.filter(
    (r) => r.name.toLowerCase().includes(searchText.toLowerCase()) ||
           r.path.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleRepoChange = useCallback((path: string) => {
    setCurrentRepo(path);
    useRepoStore.getState().refreshAll(path);
    setShowDropdown(false);
    setSearchText("");
  }, [setCurrentRepo]);

  const handleAddRepo = useCallback(async () => {
    const api = window.gitAPI;
    if (!api) return;
    const path = await api.openDirectory();
    if (!path) return;
    const result = await api.isRepo(path);
    if (result.success && result.data) {
      const name = path.split(/[/\\]/).pop() || path;
      useRepoStore.getState().addRepo(path, name);
      useRepoStore.getState().setCurrentRepo(path);
      useRepoStore.getState().refreshAll(path);
    } else {
      setError(`"${path}" is not a valid Git repository.`);
    }
  }, [setError]);

  const runAsync = useCallback(async (fn: () => Promise<any>, label: string) => {
    const state = useRepoStore.getState();
    if (!state.currentRepo) return;
    setLoading(true, label);
    try { await fn(); await state.refreshAll(); }
    catch (err: any) { setError(err.message || `${label} failed`); }
  }, [setLoading, setError]);

  const handleFetch = () => runAsync(() => window.gitAPI.fetch(currentRepo!), "Fetching...");
  const handlePull = () => runAsync(() => window.gitAPI.pull(currentRepo!), "Pulling...");
  const handlePush = () => runAsync(() => window.gitAPI.push(currentRepo!), "Pushing...");
  const handleRefresh = () => useRepoStore.getState().refreshAll();

  const handleGitBash = useCallback(async () => {
    if (!currentRepo) return;
    setLoading(true, "Opening Git Bash...");
    try {
      const result = await window.gitAPI.openGitBash(currentRepo);
      if (!result.success) setError(result.error || "Failed to open Git Bash");
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError]);

  const handleMinimize = () => window.gitAPI?.minimizeWindow();
  const handleMaximize = () => window.gitAPI?.maximizeWindow();
  const handleClose = () => window.gitAPI?.closeWindow();

  const currentRepoName = repos.find((r) => r.path === currentRepo)?.name || "";

  return (
    <div className="top-bar" style={{ WebkitAppRegion: "drag" as any }}>
      <span className="window-title">ZenTree</span>

      <div className="repo-selector" style={{ WebkitAppRegion: "no-drag" as any }}>
        <div className="repo-selector-trigger" onClick={() => setShowDropdown(!showDropdown)}>
          <span className="repo-name">
            {currentRepoName || (repos.length === 0 ? "No repositories" : "Select repository...")}
          </span>
          <span className="dropdown-arrow">{showDropdown ? "\u25B2" : "\u25BC"}</span>
        </div>
        {showDropdown && (
          <div className="repo-dropdown">
            <div className="repo-search-box">
              <input type="text" placeholder="Search repositories..." value={searchText}
                onChange={(e) => setSearchText(e.target.value)} autoFocus onClick={(e) => e.stopPropagation()} />
            </div>
            <div className="repo-dropdown-list">
              {filteredRepos.map((r) => (
                <div key={r.path} className={`repo-dropdown-item${r.path === currentRepo ? " active" : ""}`}
                  onClick={() => handleRepoChange(r.path)}>
                  <span className="repo-item-name">{r.name}</span>
                  <span className="repo-item-path">{r.path}</span>
                </div>
              ))}
              {filteredRepos.length === 0 && (
                <div className="repo-dropdown-empty">{searchText ? "No matching repositories" : "No repositories added"}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {currentRepo && (
        <div className="toolbar-group" style={{ WebkitAppRegion: "no-drag" as any }}>
          <button className="toolbar-btn" onClick={handleFetch} disabled={loading} title="Fetch from remote">Fetch</button>
          <button className="toolbar-btn" onClick={handlePull} disabled={loading} title="Pull from remote">Pull</button>
          <button className="toolbar-btn" onClick={handlePush} disabled={loading} title="Push to remote">Push</button>
          <button className="toolbar-btn" onClick={handleRefresh} disabled={loading} title="Refresh (F5)">Refresh</button>
          <span className="toolbar-separator" />
          <button className="toolbar-btn" onClick={handleGitBash} disabled={loading} title="Open Git Bash">Bash</button>
        </div>
      )}

      <div className="top-bar-spacer" />

      <div className="top-bar-right" style={{ WebkitAppRegion: "no-drag" as any }}>
        <button className="toolbar-btn add-repo" onClick={handleAddRepo} title="Add repository">+ Add</button>
        <button className="toolbar-btn icon-only" onClick={() => setThemePreset(isDark ? "catppuccin-latte" : "catppuccin-mocha")}
          title="Toggle theme">{isDark ? "\u2600" : "\u263E"}</button>
        <button className="toolbar-btn icon-only" onClick={() => setShowSettings(true)} title="Settings">&#9881;</button>
        <span className="window-controls-sep" />
        <button className="window-control-btn" onClick={handleMinimize} title="Minimize">
          <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1" fill="currentColor"/></svg>
        </button>
        <button className="window-control-btn" onClick={handleMaximize} title="Maximize">
          <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" fill="none" strokeWidth="1"/></svg>
        </button>
        <button className="window-control-btn close" onClick={handleClose} title="Close">
          <svg width="12" height="12" viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5"/><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5"/></svg>
        </button>
      </div>
    </div>
  );
}
