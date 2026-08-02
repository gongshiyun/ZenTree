import { useCallback, useRef, useState, useEffect } from "react";
import { useRepoStore } from "../application/repoStore";
import { useT } from "../i18n";
import { gitApi } from "../infrastructure/gitBridge";
import DatePicker from "./DatePicker";

export default function TopBar() {
  const t = useT();
  const repos = useRepoStore((s) => s.repos);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setCurrentRepo = useRepoStore((s) => s.setCurrentRepo);
  const isDark = useRepoStore((s) => s.isDark);
  const language = useRepoStore((s) => s.language);
  const setThemePreset = useRepoStore((s) => s.setThemePreset);
  const setShowSettings = useRepoStore((s) => s.setShowSettings);
  const setShowClone = useRepoStore((s) => s.setShowClone);
  const setShowCompare = useRepoStore((s) => s.setShowCompare);
  const setLogFilters = useRepoStore((s) => s.setLogFilters);
  const remotes = useRepoStore((s) => s.remotes);
  const loading = useRepoStore((s) => s.loading);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const [searchText, setSearchText] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPullMenu, setShowPullMenu] = useState(false);
  const [fQuery, setFQuery] = useState("");
  const [fAuthor, setFAuthor] = useState("");
  const [fSince, setFSince] = useState("");
  const selectorRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown) return;
    const h = (e: MouseEvent) => { if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) { setShowDropdown(false); setSearchText(""); } };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [showDropdown]);

  useEffect(() => {
    if (!showPullMenu) return;
    const h = (e: MouseEvent) => { if (pullRef.current && !pullRef.current.contains(e.target as Node)) setShowPullMenu(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [showPullMenu]);

  // Debounced commit-log filters
  useEffect(() => {
    const timer = setTimeout(() => {
      setLogFilters({ query: fQuery.trim() || undefined, author: fAuthor.trim() || undefined, since: fSince || undefined });
    }, 400);
    return () => clearTimeout(timer);
  }, [fQuery, fAuthor, fSince, setLogFilters]);

  const filteredRepos = repos.filter((r) => r.name.toLowerCase().includes(searchText.toLowerCase()) || r.path.toLowerCase().includes(searchText.toLowerCase()));

  const handleRepoChange = useCallback((path: string) => { setCurrentRepo(path); useRepoStore.getState().refreshAll(path); setShowDropdown(false); setSearchText(""); }, [setCurrentRepo]);

  const handleAddRepo = useCallback(async () => {
    const path = await gitApi().openDirectory();
    if (!path) return;
    const result = await gitApi().isRepo(path);
    if (result.success && result.data) {
      const name = path.split(/[/\\]/).pop() || path;
      const store = useRepoStore.getState();
      store.addRepo(path, name);
      store.setCurrentRepo(path);
      store.refreshAll(path);
    } else {
      setError(`"${path}" ` + t("app.invalidRepo"));
    }
  }, [setError, t]);

  const runAsync = useCallback(async (fn: () => Promise<unknown>, label: string) => {
    const s = useRepoStore.getState();
    if (!s.currentRepo) return;
    setLoading(true, label);
    try {
      const result = await fn();
      if (result && typeof result === "object" && "success" in result && !(result as { success: boolean }).success) {
        setError((result as { error?: string }).error || `${label} failed`);
      } else {
        await s.refreshAll();
      }
    } catch (err: any) { setError(err.message || `${label} failed`); }
    finally { setLoading(false, ""); }
  }, [setLoading, setError]);

  const handleFetch = () => runAsync(() => gitApi().fetch(currentRepo!), t("topbar.fetching"));
  const handlePull = () => runAsync(() => gitApi().pull(currentRepo!), t("topbar.pulling"));
  const handlePush = () => runAsync(() => gitApi().push(currentRepo!), t("topbar.pushing"));
  const handlePullStrategy = (strategy: "merge" | "rebase" | "ff-only") => {
    setShowPullMenu(false);
    runAsync(() => gitApi().pull(currentRepo!, strategy), t("topbar.pulling"));
  };
  const handleRefresh = () => useRepoStore.getState().refreshAll();

  const handleOpenOnHosting = useCallback(async () => {
    if (!currentRepo) return;
    const r = await gitApi().hostingUrl(currentRepo);
    if (r.success && r.data) await gitApi().openExternal(r.data);
    else setError(r.error || t("topbar.noRemote"));
  }, [currentRepo, setError]);

  const handleGitBash = useCallback(async () => {
    if (!currentRepo) return;
    setLoading(true, t("topbar.bashOpen"));
    try {
      const r = await gitApi().openGitBash(currentRepo);
      if (!r.success) setError(r.error || t("topbar.bashFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, t]);

  const currentRepoName = repos.find((r) => r.path === currentRepo)?.name || "";
  const hasRemote = remotes.length > 0;

  return (<>
    <div className="top-bar drag-region">
      <span className="window-title no-drag" onClick={() => setShowSettings(true)}>ZenTree</span>
      <div className="repo-selector no-drag" ref={selectorRef}>
        <div className="repo-selector-trigger" onClick={() => setShowDropdown(!showDropdown)}>
          <span className="repo-name">{currentRepoName || (repos.length === 0 ? t("topbar.noRepos") : t("topbar.selectRepo"))}</span>
          <span className="dropdown-arrow">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
        {showDropdown && (
          <div className="repo-dropdown">
            <div className="repo-search-box"><input type="text" placeholder={t("topbar.searchRepos")} value={searchText} onChange={(e) => setSearchText(e.target.value)} autoFocus onClick={(e) => e.stopPropagation()} /></div>
            <div className="repo-dropdown-list">
              {filteredRepos.map((r) => (<div key={r.path} className={`repo-dropdown-item${r.path === currentRepo ? " active" : ""}`} onClick={() => handleRepoChange(r.path)}><span className="repo-item-name">{r.name}</span><span className="repo-item-path">{r.path}</span></div>))}
              {filteredRepos.length === 0 && <div className="repo-dropdown-empty">{searchText ? t("topbar.noMatch") : t("topbar.noAdded")}</div>}
            </div>
            <div className="repo-dropdown-footer">
              <button className="toolbar-btn add-repo" onClick={handleAddRepo} style={{ flex: 1, justifyContent: "center" }}>{t("topbar.add")}</button>
              <button className="toolbar-btn add-repo" onClick={() => { setShowClone(true); setShowDropdown(false); }} style={{ flex: 1, justifyContent: "center" }}>{t("topbar.clone")}</button>
            </div>
          </div>
        )}
      </div>
      {currentRepo && (<div className="toolbar-group no-drag">
        <button className="toolbar-btn" onClick={handleFetch} disabled={loading} title={t("topbar.fetchTip")}>{t("topbar.fetch")}</button>
        <div className="pull-wrap no-drag" ref={pullRef}>
          <button className="toolbar-btn" onClick={handlePull} disabled={loading} title={t("topbar.pullTip")}>{t("topbar.pull")}</button>
          <button className="toolbar-btn pull-caret" onClick={() => setShowPullMenu(!showPullMenu)} disabled={loading} title={t("topbar.pullOptions")}>&#9662;</button>
          {showPullMenu && (
            <div className="pull-menu">
              <div className="pull-menu-item" onClick={() => handlePullStrategy("merge")}>{t("topbar.pullMerge")}</div>
              <div className="pull-menu-item" onClick={() => handlePullStrategy("rebase")}>{t("topbar.pullRebase")}</div>
              <div className="pull-menu-item" onClick={() => handlePullStrategy("ff-only")}>{t("topbar.pullFF")}</div>
            </div>
          )}
        </div>
        <button className="toolbar-btn" onClick={handlePush} disabled={loading} title={t("topbar.pushTip")}>{t("topbar.push")}</button>
        <button className="toolbar-btn" onClick={handleRefresh} disabled={loading} title={t("topbar.refreshTip")}>{t("topbar.refresh")}</button>
        <button className="toolbar-btn" onClick={() => setShowCompare(true)} disabled={loading} title={t("topbar.compareTip")}>{t("topbar.compare")}</button>
        <span className="toolbar-separator" />
        <button className="toolbar-btn" onClick={handleOpenOnHosting} disabled={!hasRemote || loading} title={t("topbar.hostingTip")}>{t("topbar.hosting")}</button>
        <button className="toolbar-btn" onClick={handleGitBash} disabled={loading} title={t("topbar.bashTip")}>{t("topbar.bash")}</button>
      </div>)}
      <div className="top-bar-spacer" />
      <div className="top-bar-right no-drag">
        <button className="toolbar-btn add-repo" onClick={handleAddRepo} title={t("topbar.addRepo")}>{t("topbar.add")}</button>
        <button className="toolbar-btn icon-only" onClick={() => setThemePreset(isDark ? "catppuccin-latte" : "catppuccin-mocha")} title={t("topbar.toggleTheme")}>{isDark ? (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
              <circle cx="8" cy="8" r="3.2" />
              <path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13.5 9.2A6 6 0 0 1 6.8 2.5 6 6 0 1 0 13.5 9.2Z" />
            </svg>
          )}</button>
        <button className="toolbar-btn" onClick={() => useRepoStore.getState().setLanguage(language === "zh" ? "en" : "zh")} title={t("topbar.settings")} style={{ fontSize: 11, fontWeight: 600, padding: "0 8px" }}>{language === "zh" ? "\u4E2D" : "EN"}</button>
        <button className="toolbar-btn icon-only" onClick={() => setShowSettings(true)} title={t("topbar.settings")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <span className="window-controls-sep" />
        <button className="window-control-btn" onClick={() => gitApi().minimizeWindow()} title={t("topbar.minimize")}><svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1" fill="currentColor"/></svg></button>
        <button className="window-control-btn" onClick={() => gitApi().maximizeWindow()} title={t("topbar.maximize")}><svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" fill="none" strokeWidth="1"/></svg></button>
        <button className="window-control-btn close" onClick={() => gitApi().closeWindow()} title={t("topbar.close")}><svg width="12" height="12" viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5"/><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5"/></svg></button>
      </div>
    </div>
    {currentRepo && (
      <div className="filter-bar no-drag">
        <input className="filter-input filter-query" type="text" placeholder={t("topbar.filterQuery")} value={fQuery} onChange={(e) => setFQuery(e.target.value)} />
        <input className="filter-input filter-author" type="text" placeholder={t("topbar.filterAuthor")} value={fAuthor} onChange={(e) => setFAuthor(e.target.value)} />
        <span className="filter-label">{t("topbar.filterSince")}</span>
        <DatePicker value={fSince} onChange={setFSince} />
        {(fQuery || fAuthor || fSince) && <button className="filter-clear" onClick={() => { setFQuery(""); setFAuthor(""); setFSince(""); }}>{t("topbar.filterClear")}</button>}
      </div>
    )}
  </>);
}
