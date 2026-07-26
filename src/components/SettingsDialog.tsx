import { useState, useEffect, useCallback } from "react";
import { useRepoStore, THEME_PRESETS } from "../stores/repoStore";
import { useT, getGlobalLocale } from "../i18n";

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
  const [activeTab, setActiveTab] = useState<"general" | "appearance" | "git">("general");
  const [language, setLanguageLocal] = useState(getGlobalLocale());

  useEffect(() => {
    (async () => {
      const settings = await window.gitAPI.getSettings();
      if (settings?.gitPath) setGitPath(settings.gitPath);
      if (settings?.themePreset && settings.themePreset !== themePreset) setThemePreset(settings.themePreset);
      if (settings?.language) setLanguageLocal(settings.language);
      if (currentRepo) {
        const config = await window.gitAPI.getConfig(currentRepo);
        if (config.success && config.data) { setUserName(config.data.userName); setUserEmail(config.data.userEmail); }
      }
    })();
  }, [showSettings]);

  const handleSave = useCallback(async () => {
    setLoading(true, t("settings.saving"));
    try {
      await window.gitAPI.setSetting("gitPath", gitPath);
      if (currentRepo) {
        await window.gitAPI.setConfig(currentRepo, "user.name", userName);
        await window.gitAPI.setConfig(currentRepo, "user.email", userEmail);
      }
      useRepoStore.getState().setLanguage(language);
      setShowSettings(false);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [gitPath, userName, userEmail, language, currentRepo, setShowSettings, setLoading, setError]);

  if (!showSettings) return null;

  return (
    <div className="settings-overlay" onClick={() => setShowSettings(false)}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header"><h2>{t("settings.title")}</h2>
          <button className="settings-close" onClick={() => setShowSettings(false)}>
            <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5"/><line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-tabs">
            <button className={`settings-tab${activeTab==="general"?" active":""}`} onClick={()=>setActiveTab("general")}>{t("settings.general")}</button>
            <button className={`settings-tab${activeTab==="appearance"?" active":""}`} onClick={()=>setActiveTab("appearance")}>{t("settings.appearance")}</button>
            <button className={`settings-tab${activeTab==="git"?" active":""}`} onClick={()=>setActiveTab("git")}>{t("settings.gitConfig")}</button>
          </div>
          <div className="settings-content">
            {activeTab==="general"&&<div className="settings-section">
              <div className="setting-row"><label>{t("settings.gitPath")}</label>
                <input type="text" value={gitPath} onChange={(e)=>setGitPath(e.target.value)} placeholder="git"/>
                <span className="setting-hint">{t("settings.gitPathHint")}</span>
              </div>
              <div className="setting-row"><label>{t("settings.language")}</label>
                <select value={language} onChange={(e)=>{const v=e.target.value as "en"|"zh";setLanguageLocal(v);}} style={{height:30,padding:'0 8px',border:'1px solid var(--border-color)',borderRadius:'var(--radius)',background:'var(--bg-tertiary)',color:'var(--text-primary)',fontSize:12,outline:'none'}}>
                  <option value="en">English</option><option value="zh">中文</option>
                </select>
              </div>
            </div>}
            {activeTab==="appearance"&&<div className="settings-section">
              <label className="section-label">{t("settings.colorTheme")}</label>
              <div className="theme-grid">{THEME_PRESETS.map((preset)=>(
                <div key={preset.name} className={`theme-card${themePreset===preset.name?" selected":""}`} onClick={()=>setThemePreset(preset.name)}>
                  <div className="theme-preview" style={{background:preset.colors["--bg-primary"]}}>
                    <div className="theme-preview-bar" style={{background:preset.colors["--bg-secondary"]}}/>
                    <div className="theme-preview-body"><div className="theme-preview-sidebar" style={{background:preset.colors["--bg-tertiary"]}}/>
                      <div className="theme-preview-main"><div className="theme-preview-dot" style={{background:preset.colors["--accent"]}}/><div className="theme-preview-dot" style={{background:preset.colors["--success"]}}/><div className="theme-preview-dot" style={{background:preset.colors["--warning"]}}/></div>
                    </div>
                  </div>
                  <span className="theme-name">{preset.label}</span>
                  {themePreset===preset.name&&<span className="theme-check">&#10003;</span>}
                </div>
              ))}</div>
            </div>}
            {activeTab==="git"&&<div className="settings-section">
              {currentRepo?<>
                <div className="setting-row"><label>{t("settings.userName")}</label><input type="text" value={userName} onChange={(e)=>setUserName(e.target.value)} placeholder="Your name"/></div>
                <div className="setting-row"><label>{t("settings.userEmail")}</label><input type="text" value={userEmail} onChange={(e)=>setUserEmail(e.target.value)} placeholder="your@email.com"/></div>
                <span className="setting-hint">{t("settings.gitHint")}</span>
              </>:<p className="setting-hint">{t("settings.noRepoHint")}</p>}
            </div>}
          </div>
        </div>
        <div className="settings-footer">
          <button className="settings-btn secondary" onClick={()=>setShowSettings(false)}>{t("settings.cancel")}</button>
          <button className="settings-btn primary" onClick={handleSave}>{t("settings.save")}</button>
        </div>
      </div>
    </div>
  );
}
