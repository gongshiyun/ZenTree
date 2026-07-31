import { useCallback, useRef, useState, useEffect } from "react";
import { useRepoStore } from "../application/repoStore";
import { useT } from "../i18n";
import { gitApi } from "../infrastructure/gitBridge";

export default function TopBar() {
  const t = useT();
  const repos = useRepoStore((s) => s.repos);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setCurrentRepo = useRepoStore((s) => s.setCurrentRepo);
  const isDark = useRepoStore((s) => s.isDark);
  const language = useRepoStore((s) => s.language);
  const setThemePreset = useRepoStore((s) => s.setThemePreset);
  const setShowSettings = useRepoStore((s) => s.setShowSettings);
  const loading = useRepoStore((s) => s.loading);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const [searchText, setSearchText] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown) return;
    const h = (e: MouseEvent) => { if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) { setShowDropdown(false); setSearchText(""); } };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [showDropdown]);

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
  const handleRefresh = () => useRepoStore.getState().refreshAll();

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

  return (
    <div className="top-bar drag-region">
      <span className="window-title no-drag" onClick={() => setShowSettings(true)}>ZenTree</span>
      <div className="repo-selector no-drag" ref={selectorRef}>
        <div className="repo-selector-trigger" onClick={() => setShowDropdown(!showDropdown)}>
          <span className="repo-name">{currentRepoName || (repos.length === 0 ? t("topbar.noRepos") : t("topbar.selectRepo"))}</span>
          <span className="dropdown-arrow">{showDropdown ? "\u25B2" : "\u25BC"}</span>
        </div>
        {showDropdown && (
          <div className="repo-dropdown">
            <div className="repo-search-box"><input type="text" placeholder={t("topbar.searchRepos")} value={searchText} onChange={(e) => setSearchText(e.target.value)} autoFocus onClick={(e) => e.stopPropagation()} /></div>
            <div className="repo-dropdown-list">
              {filteredRepos.map((r) => (<div key={r.path} className={`repo-dropdown-item${r.path === currentRepo ? " active" : ""}`} onClick={() => handleRepoChange(r.path)}><span className="repo-item-name">{r.name}</span><span className="repo-item-path">{r.path}</span></div>))}
              {filteredRepos.length === 0 && <div className="repo-dropdown-empty">{searchText ? t("topbar.noMatch") : t("topbar.noAdded")}</div>}
            </div>
            <div className="repo-dropdown-footer"><button className="toolbar-btn add-repo" onClick={handleAddRepo} style={{ width: "100%", justifyContent: "center" }}>{t("topbar.add")}</button></div>
          </div>
        )}
      </div>
      {currentRepo && (<div className="toolbar-group no-drag">
        <button className="toolbar-btn" onClick={handleFetch} disabled={loading} title={t("topbar.fetchTip")}>{t("topbar.fetch")}</button>
        <button className="toolbar-btn" onClick={handlePull} disabled={loading} title={t("topbar.pullTip")}>{t("topbar.pull")}</button>
        <button className="toolbar-btn" onClick={handlePush} disabled={loading} title={t("topbar.pushTip")}>{t("topbar.push")}</button>
        <button className="toolbar-btn" onClick={handleRefresh} disabled={loading} title={t("topbar.refreshTip")}>{t("topbar.refresh")}</button>
        <span className="toolbar-separator" />
        <button className="toolbar-btn" onClick={handleGitBash} disabled={loading} title={t("topbar.bashTip")}>{t("topbar.bash")}</button>
      </div>)}
      <div className="top-bar-spacer" />
      <div className="top-bar-right no-drag">
        <button className="toolbar-btn add-repo" onClick={handleAddRepo} title={t("topbar.addRepo")}>{t("topbar.add")}</button>
        <button className="toolbar-btn icon-only" onClick={() => setThemePreset(isDark ? "catppuccin-latte" : "catppuccin-mocha")} title={t("topbar.toggleTheme")}>{isDark ? "\u2600" : "\u263E"}</button>
        <button className="toolbar-btn" onClick={() => useRepoStore.getState().setLanguage(language === "zh" ? "en" : "zh")} title={t("topbar.settings")} style={{ fontSize: 11, fontWeight: 600, padding: "0 8px" }}>{language === "zh" ? "\u4E2D" : "EN"}</button>
        <button className="toolbar-btn icon-only" onClick={() => setShowSettings(true)} title={t("topbar.settings")}>&#9881;</button>
        <span className="window-controls-sep" />
        <button className="window-control-btn" onClick={() => gitApi().minimizeWindow()} title={t("topbar.minimize")}><svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1" fill="currentColor"/></svg></button>
        <button className="window-control-btn" onClick={() => gitApi().maximizeWindow()} title={t("topbar.maximize")}><svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" fill="none" strokeWidth="1"/></svg></button>
        <button className="window-control-btn close" onClick={() => gitApi().closeWindow()} title={t("topbar.close")}><svg width="12" height="12" viewBox="0 0 12 12"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5"/><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5"/></svg></button>
      </div>
    </div>
  );
}
