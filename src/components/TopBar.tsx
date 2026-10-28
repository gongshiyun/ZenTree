import { useCallback, useRef, useState, useEffect } from "react";
import { useRepoStore } from "../application/repoStore";
import { useT } from "../i18n";
import { gitApi } from "../infrastructure/gitBridge";
import { repoDisplayName } from "../domain/tabs/displayName";
import DatePicker from "./DatePicker";

/* Inline 16px icon set: 1.5px stroke, currentColor (design-spec §4.1). */
function Icon({ children, size = 15 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function FetchIcon() {
  return (
    <Icon>
      <path d="M4.5 12a3 3 0 0 1-.4-6 4.2 4.2 0 0 1 8.1.2A2.6 2.6 0 0 1 12 12" />
      <path d="M8 7.4v4.4" />
      <path d="m6.2 10 1.8 1.9L9.8 10" />
    </Icon>
  );
}

function PullIcon() {
  return (
    <Icon>
      <path d="M8 3v7" />
      <path d="m5.2 7.4 2.8 2.8 2.8-2.8" />
      <path d="M3.5 12.5h9" />
    </Icon>
  );
}

function PushIcon() {
  return (
    <Icon>
      <path d="M8 11V3.8" />
      <path d="m5.2 6.8 2.8-2.8 2.8 2.8" />
      <path d="M3.5 12.5h9" />
    </Icon>
  );
}

function RefreshIcon() {
  return (
    <Icon>
      <path d="M13 8a5 5 0 1 1-1.5-3.6" />
      <path d="M13.5 2.6v3.3h-3.3" />
    </Icon>
  );
}

function CompareIcon() {
  return (
    <Icon>
      <path d="M3 5h7" />
      <path d="m7.6 2.6 2.4 2.4-2.4 2.4" />
      <path d="M13 11H6" />
      <path d="m8.4 8.6-2.4 2.4 2.4 2.4" />
    </Icon>
  );
}

function GroupsIcon() {
  return (
    <Icon>
      <path d="m8 2 5.5 3L8 8 2.5 5 8 2Z" />
      <path d="m2.5 8 5.5 3 5.5-3" />
      <path d="m2.5 11 5.5 3 5.5-3" />
    </Icon>
  );
}

function HostingIcon() {
  return (
    <Icon>
      <path d="M9.5 2.5h4v4" />
      <path d="m13.5 2.5-5.8 5.8" />
      <path d="M12 9.4v2.8a1.3 1.3 0 0 1-1.3 1.3H3.8a1.3 1.3 0 0 1-1.3-1.3V5.3A1.3 1.3 0 0 1 3.8 4h2.8" />
    </Icon>
  );
}

function BashIcon() {
  return (
    <Icon>
      <path d="m3.5 4.5 3.4 3.1-3.4 3.1" />
      <path d="M8.5 11.8h4" />
    </Icon>
  );
}

function ThemeIcon({ isDark }: { isDark: boolean }) {
  return isDark ? (
    <Icon>
      <circle cx="8" cy="8" r="3.1" />
      <path d="M8 1.4v1.5M8 13.1v1.5M1.4 8h1.5M13.1 8h1.5M3.3 3.3l1.1 1.1M11.6 11.6l1.1 1.1M3.3 12.7l1.1-1.1M11.6 4.4l1.1-1.1" />
    </Icon>
  ) : (
    <Icon>
      <path d="M13.2 9.1A5.8 5.8 0 0 1 6.9 2.8a5.9 5.9 0 1 0 6.3 6.3Z" />
    </Icon>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function BrandMark() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M10 2.6v14.8" />
      <path d="M3.6 6.3 16.4 13.7" />
      <path d="M16.4 6.3 3.6 13.7" />
    </svg>
  );
}

export default function TopBar() {
  const t = useT();
  const repos = useRepoStore((s) => s.repos);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const isDark = useRepoStore((s) => s.isDark);
  const language = useRepoStore((s) => s.language);
  const setThemePreset = useRepoStore((s) => s.setThemePreset);
  const setShowSettings = useRepoStore((s) => s.setShowSettings);
  const setShowClone = useRepoStore((s) => s.setShowClone);
  const setShowCompare = useRepoStore((s) => s.setShowCompare);
  const setShowRepoGroups = useRepoStore((s) => s.setShowRepoGroups);
  const setLogFilters = useRepoStore((s) => s.setLogFilters);
  const remotes = useRepoStore((s) => s.remotes);
  const loading = useRepoStore((s) => s.loading);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPullMenu, setShowPullMenu] = useState(false);
  const [fQuery, setFQuery] = useState("");
  const [fAuthor, setFAuthor] = useState("");
  const [fSince, setFSince] = useState("");
  const selectorRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown) return;
    const h = (e: MouseEvent) => { if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) setShowDropdown(false); };
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

  const handleAddRepo = useCallback(async () => {
    setShowDropdown(false);
    const path = await gitApi().openDirectory();
    if (!path) return;
    const result = await gitApi().isRepo(path);
    if (result.success && result.data) {
      const store = useRepoStore.getState();
      store.addRepo(path, repoDisplayName(path));
      store.openTab(path);
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
      <button className="brand no-drag" onClick={() => setShowSettings(true)} type="button">
        <span className="brand-mark" aria-hidden="true"><BrandMark /></span>
        <span className="window-title">ZenTree</span>
      </button>
      <span className="top-bar-divider" aria-hidden="true" />
      <div className="repo-selector no-drag">
        <div className="repo-selector-trigger" title={currentRepo ?? undefined}>
          <span className={`repo-status-dot${currentRepo ? "" : " idle"}`} aria-hidden="true" />
          <span className="repo-name">{currentRepoName || (repos.length === 0 ? t("topbar.noRepos") : t("topbar.selectRepo"))}</span>
        </div>
        {/* Switching repositories now lives in the tab strip and the Ctrl+P picker,
            which is why this dropdown only offers the two ways to add one. */}
        <div className="repo-add-wrap" ref={selectorRef}>
          <button className="toolbar-btn icon-only add-repo" onClick={() => setShowDropdown(!showDropdown)} title={t("topbar.addRepo")} type="button" aria-label={t("topbar.addRepo")}>
            <Icon><path d="M8 3v10M3 8h10" /></Icon>
          </button>
          {showDropdown && (
            <div className="repo-dropdown repo-add-menu">
              <div className="repo-dropdown-item" onClick={handleAddRepo}><span className="repo-item-name">{t("topbar.addLocalRepo")}</span></div>
              <div className="repo-dropdown-item" onClick={() => { setShowClone(true); setShowDropdown(false); }}><span className="repo-item-name">{t("topbar.clone")}</span></div>
            </div>
          )}
        </div>
      </div>
      {currentRepo && (<div className="toolbar-group no-drag">
        <button className="toolbar-btn icon-only" onClick={handleFetch} disabled={loading} title={t("topbar.fetchTip")} type="button" aria-label={t("topbar.fetchTip")}><FetchIcon /></button>
        <div className="pull-wrap no-drag" ref={pullRef}>
          <button className="toolbar-btn icon-only" onClick={handlePull} disabled={loading} title={t("topbar.pullTip")} type="button" aria-label={t("topbar.pullTip")}><PullIcon /></button>
          <button className="toolbar-btn pull-caret" onClick={() => setShowPullMenu(!showPullMenu)} disabled={loading} title={t("topbar.pullOptions")} type="button" aria-label={t("topbar.pullOptions")}>
            <Icon size={11}><path d="M4 6.2 8 10l4-3.8" /></Icon>
          </button>
          {showPullMenu && (
            <div className="pull-menu">
              <div className="pull-menu-item" onClick={() => handlePullStrategy("merge")}>{t("topbar.pullMerge")}</div>
              <div className="pull-menu-item" onClick={() => handlePullStrategy("rebase")}>{t("topbar.pullRebase")}</div>
              <div className="pull-menu-item" onClick={() => handlePullStrategy("ff-only")}>{t("topbar.pullFF")}</div>
            </div>
          )}
        </div>
        <button className="toolbar-btn icon-only" onClick={handlePush} disabled={loading} title={t("topbar.pushTip")} type="button" aria-label={t("topbar.pushTip")}><PushIcon /></button>
        <button className="toolbar-btn icon-only" onClick={handleRefresh} disabled={loading} title={t("topbar.refreshTip")} type="button" aria-label={t("topbar.refreshTip")}><RefreshIcon /></button>
        <button className="toolbar-btn icon-only" onClick={() => setShowCompare(true)} disabled={loading} title={t("topbar.compareTip")} type="button" aria-label={t("topbar.compareTip")}><CompareIcon /></button>
        <button className="toolbar-btn icon-only" onClick={() => setShowRepoGroups(true)} disabled={loading} title={t("topbar.repoGroupsTip")} type="button" aria-label={t("topbar.repoGroupsTip")}><GroupsIcon /></button>
        <span className="toolbar-separator" aria-hidden="true" />
        <button className="toolbar-btn icon-only" onClick={handleOpenOnHosting} disabled={!hasRemote || loading} title={t("topbar.hostingTip")} type="button" aria-label={t("topbar.hostingTip")}><HostingIcon /></button>
        <button className="toolbar-btn icon-only" onClick={handleGitBash} disabled={loading} title={t("topbar.bashTip")} type="button" aria-label={t("topbar.bashTip")}><BashIcon /></button>
      </div>)}
      <div className="top-bar-spacer" />
      <div className="top-bar-right no-drag">
        <button className="toolbar-btn icon-only" onClick={() => setThemePreset(isDark ? "claude" : "claude-dark")} title={t("topbar.toggleTheme")} type="button" aria-label={t("topbar.toggleTheme")}><ThemeIcon isDark={isDark} /></button>
        <button className="toolbar-btn lang-btn" onClick={() => useRepoStore.getState().setLanguage(language === "zh" ? "en" : "zh")} title={t("palette.toggleLanguage")} type="button">{language === "zh" ? "\u4E2D" : "EN"}</button>
        <button className="toolbar-btn icon-only" onClick={() => setShowSettings(true)} title={t("topbar.settings")} type="button" aria-label={t("topbar.settings")}><SettingsIcon /></button>
        <span className="window-controls-sep" aria-hidden="true" />
        <button className="window-control-btn" onClick={() => gitApi().minimizeWindow()} title={t("topbar.minimize")} type="button" aria-label={t("topbar.minimize")}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="5.5" width="10" height="1" fill="currentColor" /></svg></button>
        <button className="window-control-btn" onClick={() => gitApi().maximizeWindow()} title={t("topbar.maximize")} type="button" aria-label={t("topbar.maximize")}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" fill="none" strokeWidth="1" /></svg></button>
        <button className="window-control-btn close" onClick={() => gitApi().closeWindow()} title={t("topbar.close")} type="button" aria-label={t("topbar.close")}><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" /><line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.5" /></svg></button>
      </div>
    </div>
    {currentRepo && (
      <div className="filter-bar no-drag">
        <div className="filter-field filter-search">
          <svg className="filter-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4.2" />
            <path d="M10.2 10.2 14 14" />
          </svg>
          <input className="filter-input filter-query" type="text" placeholder={t("topbar.filterQuery")} aria-label={t("topbar.filterQuery")} value={fQuery} onChange={(e) => setFQuery(e.target.value)} />
        </div>
        <div className="filter-field filter-author-field">
          <svg className="filter-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="5.2" r="2.6" />
            <path d="M3.2 13.2a4.8 4.8 0 0 1 9.6 0" />
          </svg>
          <input className="filter-input filter-author" type="text" placeholder={t("topbar.filterAuthor")} aria-label={t("topbar.filterAuthor")} value={fAuthor} onChange={(e) => setFAuthor(e.target.value)} />
        </div>
        <span className="filter-label">{t("topbar.filterSince")}</span>
        <DatePicker value={fSince} onChange={setFSince} />
        {(fQuery || fAuthor || fSince) && (
          <button className="filter-clear" onClick={() => { setFQuery(""); setFAuthor(""); setFSince(""); }} type="button">{t("topbar.filterClear")}</button>
        )}
      </div>
    )}
  </>);
}
