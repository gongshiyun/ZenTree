import { useState, useCallback } from "react";
import { useRepoStore } from "../application/repoStore";
import { useT } from "../i18n";
import { gitApi } from "../infrastructure/gitBridge";

function defaultFolderName(url: string): string {
  const cleaned = url.trim().replace(/\.git$/, "").replace(/[\\/]+$/, "");
  const seg = cleaned.split(/[\\/:]/).filter(Boolean).pop();
  return (seg || "zentree-clone").replace(/[^\w.-]+/g, "-");
}

export default function CloneDialog() {
  const t = useT();
  const showClone = useRepoStore((s) => s.showClone);
  const setShowClone = useRepoStore((s) => s.setShowClone);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const [url, setUrl] = useState("");
  const [dir, setDir] = useState("");
  const [folder, setFolder] = useState("");
  const [branch, setBranch] = useState("");
  const [cloning, setCloning] = useState(false);
  const [formError, setFormError] = useState("");

  const handleUrlChange = useCallback((value: string) => {
    setUrl(value);
    if (!folder) setFolder(defaultFolderName(value));
  }, [folder]);

  const handleBrowse = useCallback(async () => {
    const dirPath = await gitApi().openDirectory();
    if (dirPath) setDir(dirPath);
  }, []);

  const handleClone = useCallback(async () => {
    if (!url.trim() || !dir.trim() || !folder.trim()) {
      setFormError(t("clone.fillAll"));
      return;
    }
    const destPath = dir.replace(/[\\/]+$/, "") + "\\" + folder.trim();
    setCloning(true);
    setFormError("");
    setLoading(true, t("clone.cloning"));
    try {
      const r = await gitApi().clone(url.trim(), destPath, branch.trim() || undefined);
      if (r.success) {
        const store = useRepoStore.getState();
        store.addRepo(destPath, folder.trim());
        store.setCurrentRepo(destPath);
        await store.refreshAll(destPath);
        setShowClone(false);
        setUrl(""); setDir(""); setFolder(""); setBranch("");
      } else {
        setFormError(r.error || t("clone.failed"));
      }
    } catch (err: any) {
      setFormError(err.message || t("clone.failed"));
    } finally {
      setCloning(false);
      setLoading(false, "");
    }
  }, [url, dir, folder, branch, setShowClone, setLoading, setFormError, t]);

  if (!showClone) return null;

  return (
    <div className="settings-overlay" onClick={() => setShowClone(false)}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{t("clone.title")}</h2>
          <button className="settings-close" onClick={() => setShowClone(false)}>
            <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5"/><line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-section">
            <div className="setting-row"><label>{t("clone.url")}</label>
              <input type="text" value={url} placeholder="https://github.com/user/repo.git" onChange={(e) => handleUrlChange(e.target.value)} />
            </div>
            <div className="setting-row"><label>{t("clone.directory")}</label>
              <div className="clone-dir-row">
                <input type="text" value={dir} placeholder="C:\\projects" onChange={(e) => setDir(e.target.value)} />
                <button className="settings-btn secondary" onClick={handleBrowse}>{t("clone.browse")}</button>
              </div>
            </div>
            <div className="setting-row"><label>{t("clone.folder")}</label>
              <input type="text" value={folder} onChange={(e) => setFolder(e.target.value)} />
            </div>
            <div className="setting-row"><label>{t("clone.branch")}</label>
              <input type="text" value={branch} placeholder={t("clone.branchPlaceholder")} onChange={(e) => setBranch(e.target.value)} />
            </div>
            {formError && <span className="setting-hint update-error">{formError}</span>}
            <span className="setting-hint">{t("clone.hint")}</span>
          </div>
        </div>
        <div className="settings-footer">
          <button className="settings-btn secondary" onClick={() => setShowClone(false)}>{t("clone.cancel")}</button>
          <button className="settings-btn primary" disabled={cloning} onClick={handleClone}>{cloning ? t("clone.cloning") : t("clone.clone")}</button>
        </div>
      </div>
    </div>
  );
}
