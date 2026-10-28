import { useState, useEffect, useCallback, useRef } from "react";
import { useRepoStore, THEME_PRESETS } from "../application/repoStore";
import { useT, getGlobalLocale } from "../i18n";
import { gitApi } from "../infrastructure/gitBridge";
import type { SubmoduleInfo, UpdateState } from "../types";

export default function SettingsDialog() {
  const showSettings = useRepoStore((s) => s.showSettings);
  const setShowSettings = useRepoStore((s) => s.setShowSettings);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const themePreset = useRepoStore((s) => s.themePreset);
  const setThemePreset = useRepoStore((s) => s.setThemePreset);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const t = useT();
  const [gitPath, setGitPath] = useState("git");
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
    const [activeTab, setActiveTab] = useState<"general" | "appearance" | "git" | "shortcuts" | "about">("general");
  const [language, setLanguageLocal] = useState(getGlobalLocale());
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [showGitignore, setShowGitignore] = useState(false);
  const [gitignoreText, setGitignoreText] = useState("");
  const [templateText, setTemplateText] = useState("");
  const [diffToolText, setDiffToolText] = useState("");
  const [signCommits, setSignCommits] = useState(false);
  const [submodules, setSubmodules] = useState<SubmoduleInfo[]>([]);
  const [submoduleUrl, setSubmoduleUrl] = useState("");
  const [submodulePath, setSubmodulePath] = useState("");
  const [busy, setBusy] = useState(false);
  // Identity (user.name/user.email) is only written back after the user edits
  // the Git tab — an accidental Save on any tab must never persist empty values.
  const [identityDirty, setIdentityDirty] = useState(false);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const identityDirtyRef = useRef(false);

  const markIdentityDirty = useCallback(() => {
    identityDirtyRef.current = true;
    setIdentityDirty(true);
  }, []);

  const loadGitTools = useCallback(async () => {
    if (!currentRepo) return;
    const [tpl, dt, sg, subs] = await Promise.all([
      gitApi().getCommitTemplate(currentRepo),
      gitApi().getDiffTool(currentRepo),
      gitApi().getSignCommits(currentRepo),
      gitApi().submoduleList(currentRepo),
    ]);
    if (tpl.success && tpl.data !== undefined) setTemplateText(tpl.data);
    if (dt.success && dt.data !== undefined) setDiffToolText(dt.data);
    if (sg.success && sg.data !== undefined) setSignCommits(sg.data);
    if (subs.success && subs.data) setSubmodules(subs.data);
  }, [currentRepo]);

  useEffect(() => {
    if (showSettings && activeTab === "git" && currentRepo) loadGitTools();
  }, [showSettings, activeTab, currentRepo, loadGitTools]);

  const runTool = useCallback(async (op: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true);
    try {
      const r = await op();
      if (!r.success) setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  }, [setError, t]);

  useEffect(() => {
    if (!showSettings) return;
    let cancelled = false;
    // The identity fields are only trustworthy after getConfig resolves; until
    // then the user has not "edited" them and Save must not write them back.
    identityDirtyRef.current = false;
    setIdentityDirty(false);
    setIdentityLoaded(false);
    (async () => {
      try {
        const settings = await gitApi().getSettings();
        if (cancelled) return;
        if (settings?.gitPath) setGitPath(settings.gitPath);
        if (settings?.language) setLanguageLocal(settings.language);
        if (currentRepo) {
          const config = await gitApi().getConfig(currentRepo);
          if (cancelled) return;
          if (config.success && config.data && !identityDirtyRef.current) {
            setUserName(config.data.userName ?? "");
            setUserEmail(config.data.userEmail ?? "");
          }
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setIdentityLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [showSettings, currentRepo]);
  useEffect(() => {
    if (!showSettings) return;
    let cancelled = false;
    const unsubscribe = gitApi().onUpdateEvent((state) => { if (!cancelled) setUpdateState(state); });
    gitApi().getUpdateState()
      .then((res) => { if (!cancelled && res.success) setUpdateState(res.data ?? null); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; unsubscribe(); };
  }, [showSettings]);

  const handleSave = useCallback(async () => {
    setLoading(true, t("settings.saving"));
    try {
      await gitApi().setSetting("gitPath", gitPath);
      // Only persist an identity the user actually edited, and never write an
      // empty user.name/user.email: that would override a global identity and
      // break later commits (M14).
      if (currentRepo && identityDirty) {
        const name = userName.trim();
        const email = userEmail.trim();
        if (name) await gitApi().setConfig(currentRepo, "user.name", name);
        if (email) await gitApi().setConfig(currentRepo, "user.email", email);
      }
      useRepoStore.getState().setLanguage(language);
      setShowSettings(false);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [gitPath, userName, userEmail, language, currentRepo, identityDirty, setShowSettings, setLoading, setError, t]);

  const handleCheckUpdates = useCallback(async () => {
    try {
      const res = await gitApi().checkForUpdates();
      if (res.success && res.data) setUpdateState(res.data);
      else setError(res.error ?? t("settings.checkFailed"));
    } catch (err: any) { setError(err.message); }
  }, [setError, t]);

  const handleDownloadUpdate = useCallback(async () => {
    try {
      const res = await gitApi().downloadUpdate();
      if (res.success && res.data) setUpdateState(res.data);
      else setError(res.error ?? t("settings.updateError", "download"));
    } catch (err: any) { setError(err.message); }
  }, [setError, t]);

  const handleInstallUpdate = useCallback(() => {
    gitApi().installUpdate();
  }, []);

  const handleLoadGitignore = useCallback(async () => {
    if (!currentRepo) return;
    const r = await gitApi().readGitignore(currentRepo);
    if (r.success) { setGitignoreText(r.data ?? ""); setShowGitignore(true); }
    else setError(r.error || t("settings.gitignoreFailed"));
  }, [currentRepo, setError, t]);

  const handleSaveGitignore = useCallback(async () => {
    if (!currentRepo) return;
    setLoading(true, t("settings.gitignoreSaving"));
    try {
      const r = await gitApi().writeGitignore(currentRepo, gitignoreText);
      if (r.success) { setShowGitignore(false); await useRepoStore.getState().refreshAll(); }
      else setError(r.error || t("settings.gitignoreFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, gitignoreText, setLoading, setError, t]);

  if (!showSettings) return null;

  const SETTINGS_TABS = [
    ["general", t("settings.general")],
    ["appearance", t("settings.appearance")],
    ["git", t("settings.gitConfig")],
    ["shortcuts", t("settings.shortcuts")],
    ["about", t("settings.about")],
  ] as const;

  return (
    <div className="settings-overlay" onClick={() => setShowSettings(false)}>
      <div className="settings-dialog settings-dialog-lg" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 id="settings-title">{t("settings.title")}</h2>
          <button type="button" className="settings-close" aria-label={t("settings.cancel")} title={t("settings.cancel")} onClick={() => setShowSettings(false)}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5"/><line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-tabs" role="tablist" aria-label={t("settings.title")}>
            {SETTINGS_TABS.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={activeTab === id} className={`settings-tab${activeTab === id ? " active" : ""}`} onClick={() => setActiveTab(id)}>{label}</button>
            ))}
          </div>
          <div className="settings-content">
            {activeTab === "general" && <div className="settings-section">
              <div className="setting-row"><label>{t("settings.gitPath")}</label>
                <input className="dialog-input" type="text" value={gitPath} onChange={(e) => setGitPath(e.target.value)} placeholder="git"/>
                <span className="setting-hint">{t("settings.gitPathHint")}</span>
              </div>
              <div className="setting-row"><label>{t("settings.language")}</label>
                <select className="dialog-input settings-select" value={language} onChange={(e) => setLanguageLocal(e.target.value as "en" | "zh")}>
                  <option value="en">English</option><option value="zh">中文</option>
                </select>
              </div>
            </div>}
            {activeTab === "appearance" && <div className="settings-section">
              <label className="section-label">{t("settings.colorTheme")}</label>
              {/* Preview swatches use the preset palette itself (not the active
                  tokens) so all four themes can be compared side by side. */}
              <div className="theme-grid" role="radiogroup" aria-label={t("settings.colorTheme")}>
                {THEME_PRESETS.map((preset) => (
                  <div
                    key={preset.name}
                    className={`theme-card${themePreset === preset.name ? " selected" : ""}`}
                    role="radio"
                    aria-checked={themePreset === preset.name}
                    tabIndex={0}
                    title={preset.label}
                    onClick={() => setThemePreset(preset.name)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setThemePreset(preset.name); } }}
                  >
                    <div className="theme-preview" style={{ background: preset.colors["--bg-primary"], borderColor: preset.colors["--border-color"] }}>
                      <div className="theme-preview-bar" style={{ background: preset.colors["--bg-secondary"], borderBottomColor: preset.colors["--border-color"] }}>
                        <span className="theme-preview-mark" style={{ color: preset.colors["--accent"] }}>&#10035;</span>
                        <span className="theme-preview-bar-line" style={{ background: preset.colors["--border-strong"] }}/>
                        <span className="theme-preview-bar-line" style={{ background: preset.colors["--border-color"], width: 16 }}/>
                      </div>
                      <div className="theme-preview-body">
                        <div className="theme-preview-sidebar" style={{ background: preset.colors["--bg-tertiary"], borderRightColor: preset.colors["--border-color"] }}>
                          <span className="theme-preview-line" style={{ background: preset.colors["--border-strong"] }}/>
                          <span className="theme-preview-line short" style={{ background: preset.colors["--border-strong"] }}/>
                          <span className="theme-preview-line short" style={{ background: preset.colors["--border-strong"] }}/>
                        </div>
                        <div className="theme-preview-main">
                          <span className="theme-preview-line wide" style={{ background: preset.colors["--border-strong"] }}/>
                          <span className="theme-preview-line" style={{ background: preset.colors["--border-color"], width: "48%" }}/>
                          <span className="theme-preview-line" style={{ background: preset.colors["--border-color"], width: "62%" }}/>
                          <span className="theme-preview-pill" style={{ background: preset.colors["--accent"] }}/>
                        </div>
                      </div>
                    </div>
                    <span className="theme-name">{preset.label}</span>
                    {themePreset === preset.name && <span className="theme-check" aria-hidden="true">&#10003;</span>}
                  </div>
                ))}
              </div>
            </div>}
            {activeTab === "git" && <div className="settings-section">
              {currentRepo ? <>
                <div className="setting-row"><label>{t("settings.userName")}</label><input className="dialog-input" type="text" value={userName} onChange={(e) => { markIdentityDirty(); setUserName(e.target.value); }} placeholder="Your name"/></div>
                <div className="setting-row"><label>{t("settings.userEmail")}</label><input className="dialog-input" type="text" value={userEmail} onChange={(e) => { markIdentityDirty(); setUserEmail(e.target.value); }} placeholder="your@email.com"/></div>
                {identityLoaded && !userName.trim() && !userEmail.trim() && (
                  <span className="setting-hint" role="status">{t("settings.identityMissing")}</span>
                )}
                <span className="setting-hint">{t("settings.gitHint")}</span>
                <div className="setting-divider" />
                <div className="setting-row-inline">
                  <label>{t("settings.gitignore")}</label>
                  <button type="button" className="settings-btn secondary" onClick={handleLoadGitignore}>{t("settings.gitignoreEdit")}</button>
                </div>
                {showGitignore && <>
                  <textarea className="gitignore-editor dialog-input" value={gitignoreText} onChange={(e) => setGitignoreText(e.target.value)} spellCheck={false} />
                  <div className="setting-actions">
                    <button type="button" className="settings-btn primary" onClick={handleSaveGitignore}>{t("settings.gitignoreSave")}</button>
                    <button type="button" className="settings-btn secondary" onClick={() => setShowGitignore(false)}>{t("settings.gitignoreCancel")}</button>
                  </div>
                </>}
                <div className="setting-divider" />
                <div className="setting-row"><label>{t("settings.commitTemplate")}</label>
                  <textarea className="gitignore-editor dialog-input" value={templateText} onChange={(e) => setTemplateText(e.target.value)} placeholder={t("settings.commitTemplatePlaceholder")} spellCheck={false} />
                </div>
                <div className="setting-actions">
                  <button type="button" className="settings-btn primary" disabled={busy} onClick={() => runTool(async () => { const r = await gitApi().setCommitTemplate(currentRepo!, templateText); if (r.success) setError(null); return r; })}>{t("settings.commitTemplateSave")}</button>
                </div>
                <div className="setting-divider" />
                <label className="amend-check">
                  <input type="checkbox" checked={signCommits} disabled={busy}
                    onChange={async (e) => { const v = e.target.checked; setSignCommits(v); await runTool(() => gitApi().setSignCommits(currentRepo!, v)); }} />
                  {t("settings.gpgSign")}
                </label>
                <div className="setting-divider" />
                <div className="setting-row"><label>{t("settings.diffTool")}</label>
                  <input className="dialog-input" type="text" value={diffToolText} onChange={(e) => setDiffToolText(e.target.value)} placeholder="vimdiff" />
                </div>
                <div className="setting-actions">
                  <button type="button" className="settings-btn primary" disabled={busy} onClick={() => runTool(() => gitApi().setDiffTool(currentRepo!, diffToolText.trim()))}>{t("settings.diffToolSave")}</button>
                </div>
                <div className="setting-divider" />
                <div className="setting-row-inline">
                  <label>{t("settings.submodules")}</label>
                  <button type="button" className="settings-btn secondary" disabled={busy} onClick={async () => { await runTool(() => gitApi().submoduleUpdate(currentRepo!)); await loadGitTools(); }}>{t("settings.submoduleUpdate")}</button>
                </div>
                {submodules.map((s) => (
                  <div key={s.path} className="setting-row-inline">
                    <span className="setting-hint setting-grow">{s.path} <span className="setting-url">({s.url})</span></span>
                    <button type="button" className="settings-btn secondary" disabled={busy} onClick={async () => { await runTool(() => gitApi().submoduleDeinit(currentRepo!, s.path)); await loadGitTools(); }}>{t("settings.submoduleRemove")}</button>
                  </div>
                ))}
                <div className="setting-row"><label>{t("settings.submoduleUrl")}</label>
                  <input className="dialog-input" type="text" value={submoduleUrl} onChange={(e) => setSubmoduleUrl(e.target.value)} placeholder="https://github.com/org/repo.git" />
                </div>
                <div className="setting-row"><label>{t("settings.submodulePath")}</label>
                  <input className="dialog-input" type="text" value={submodulePath} onChange={(e) => setSubmodulePath(e.target.value)} placeholder="libs/mylib" />
                </div>
                <div className="setting-actions">
                  <button type="button" className="settings-btn primary" disabled={busy || !submoduleUrl.trim() || !submodulePath.trim()} onClick={async () => {
                    await runTool(() => gitApi().submoduleAdd(currentRepo!, submoduleUrl.trim(), submodulePath.trim()));
                    setSubmoduleUrl(""); setSubmodulePath(""); await loadGitTools();
                  }}>{t("settings.submoduleAdd")}</button>
                </div>
              </> : <p className="setting-hint">{t("settings.noRepoHint")}</p>}
            </div>}
            {activeTab === "shortcuts" && <div className="settings-section">
                          <label className="section-label">{t("settings.shortcuts")}</label>
                          <div className="shortcut-list">
                            {[
                              ["F5", t("settings.shortcut.refresh")],
                              ["Ctrl+Enter", t("settings.shortcut.commit")],
                              ["Ctrl+F", t("settings.shortcut.search")],
                              ["Ctrl+K", t("settings.shortcut.palette")],
                              ["Ctrl+P", t("settings.shortcut.tabPicker")],
                              ["Ctrl+Tab", t("settings.shortcut.nextTab")],
                              ["Ctrl+Shift+Tab", t("settings.shortcut.prevTab")],
                              ["Ctrl+Shift+W", t("settings.shortcut.closeTab")],
                              ["Ctrl+Shift+S", t("settings.shortcut.stageAll")],
                              ["Ctrl+Shift+U", t("settings.shortcut.unstageAll")],
                              ["Delete", t("settings.shortcut.discard")],
                              ["Esc", t("settings.shortcut.dismiss")],
                            ].map(([keys, desc]) => (
                              <div key={keys} className="shortcut-row"><kbd className="shortcut-keys">{keys}</kbd><span>{desc}</span></div>
                            ))}
                          </div>
                        </div>}
            {activeTab === "about" && <div className="settings-section">
              <div className="about-hero">
                <span className="about-mark" aria-hidden="true">&#10035;</span>
                <div>
                  <span className="about-name">ZenTree</span>
                </div>
              </div>
              <div className="setting-row"><label>{t("settings.version")}</label>
                <span className="setting-hint">{updateState?.currentVersion ? `ZenTree v${updateState.currentVersion}` : "ZenTree"}</span>
              </div>
              <div className="setting-row"><label>{t("settings.updates")}</label>
                <div className="setting-actions">
                  <button type="button" className="settings-btn secondary" onClick={handleCheckUpdates} disabled={updateState?.phase === "checking" || updateState?.phase === "downloading"}>
                    {t("settings.checkUpdates")}
                  </button>
                </div>
              </div>
              {updateState?.phase === "checking" && <span className="setting-hint">{t("settings.checking")}</span>}
              {updateState?.phase === "not-available" && <span className="setting-hint">{t("settings.upToDate", updateState.version ?? updateState.currentVersion)}</span>}
              {updateState?.phase === "available" && <>
                <span className="setting-hint">{t("settings.updateAvailable", updateState.version ?? "")}</span>
                {updateState.releaseNotes ? <div className="update-notes">{updateState.releaseNotes}</div> : null}
                <div className="setting-actions">
                  <button type="button" className="settings-btn primary" onClick={handleDownloadUpdate}>{t("settings.download")}</button>
                </div>
              </>}
              {updateState?.phase === "downloading" && <>
                <div className="update-progress"><div className="update-progress-bar" style={{ width: `${updateState.progress?.percent ?? 0}%` }}/></div>
                <span className="setting-hint">{t("settings.downloading", String(Math.round(updateState.progress?.percent ?? 0)))}</span>
              </>}
              {updateState?.phase === "downloaded" && <>
                <span className="setting-hint">{t("settings.downloaded")}</span>
                <div className="setting-actions">
                  <button type="button" className="settings-btn primary" onClick={handleInstallUpdate}>{t("settings.installNow")}</button>
                </div>
              </>}
              {updateState?.phase === "error" && <span className="setting-hint update-error">{t("settings.updateError", updateState.error ?? "")}</span>}
              {updateState?.phase === "unsupported" && <span className="setting-hint">{updateState.reason === "portable" ? t("settings.unsupportedPortable") : t("settings.unsupportedDev")}</span>}
              {(!updateState || updateState.phase === "idle") && <span className="setting-hint">{t("settings.updateHint")}</span>}
            </div>}
          </div>
        </div>
        <div className="settings-footer">
          <button type="button" className="settings-btn secondary" onClick={() => setShowSettings(false)}>{t("settings.cancel")}</button>
          <button type="button" className="settings-btn primary" onClick={handleSave}>{t("settings.save")}</button>
        </div>
      </div>
    </div>
  );
}
