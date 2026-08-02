import { useState, useCallback, useEffect } from "react";
import { useRepoStore } from "../application/repoStore";
import { useT } from "../i18n";
import { gitApi } from "../infrastructure/gitBridge";
import type { BatchRepoResult } from "../types";

export default function RepoGroupDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const groups = useRepoStore((s) => s.repoGroups);
  const addRepoGroup = useRepoStore((s) => s.addRepoGroup);
  const removeRepoGroup = useRepoStore((s) => s.removeRepoGroup);
  const updateRepoGroupRepos = useRepoStore((s) => s.updateRepoGroupRepos);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const repos = useRepoStore((s) => s.repos);

  const [selectedGroup, setSelectedGroup] = useState<string | null>(groups[0]?.name ?? null);
  const [newGroupName, setNewGroupName] = useState("");
  const [branch, setBranch] = useState("");
  const [opts, setOpts] = useState({ fetch: true, pull: true, stash: true });
  const [results, setResults] = useState<BatchRepoResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [scanDir, setScanDir] = useState("");
  const [scanResults, setScanResults] = useState<{ path: string; name: string }[]>([]);
  const [selectedScan, setSelectedScan] = useState<Set<string>>(new Set());
  const [repoPathInput, setRepoPathInput] = useState("");

  useEffect(() => {
    if (!selectedGroup && groups.length > 0) setSelectedGroup(groups[0].name);
  }, [groups, selectedGroup]);

  const group = groups.find((g) => g.name === selectedGroup) ?? null;

  const handleCreateGroup = useCallback(() => {
    const name = newGroupName.trim();
    if (!name) return;
    addRepoGroup(name, []);
    setNewGroupName("");
    setSelectedGroup(name);
  }, [newGroupName, addRepoGroup]);

  const handleScan = useCallback(async () => {
    if (!scanDir.trim()) return;
    setLoading(true, t("repoGroups.scanning"));
    try {
      const r = await gitApi().scanRepos(scanDir.trim());
      if (r.success && r.data) {
        setScanResults(r.data);
        setSelectedScan(new Set());
      } else setError(r.error || t("repoGroups.scanFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [scanDir, setLoading, setError, t]);

  const handleAddScan = useCallback(() => {
    if (!group) return;
    const added = scanResults.filter((s) => selectedScan.has(s.path)).map((s) => s.path);
    if (added.length === 0) return;
    updateRepoGroupRepos(group.name, [...new Set([...group.repos, ...added])]);
  }, [group, scanResults, selectedScan, updateRepoGroupRepos]);

  const handleAddManual = useCallback(() => {
    if (!group || !repoPathInput.trim()) return;
    updateRepoGroupRepos(group.name, [...new Set([...group.repos, repoPathInput.trim()])]);
    setRepoPathInput("");
  }, [group, repoPathInput, updateRepoGroupRepos]);

  const handleBrowseRepo = useCallback(async () => {
    const dir = await gitApi().openDirectory();
    if (dir) setRepoPathInput(dir);
  }, []);

  const handleBrowseScan = useCallback(async () => {
    const dir = await gitApi().openDirectory();
    if (dir) setScanDir(dir);
  }, []);

  const handleAddFromKnown = useCallback((path: string) => {
    if (!group) return;
    updateRepoGroupRepos(group.name, [...new Set([...group.repos, path])]);
  }, [group, updateRepoGroupRepos]);

  const handleRemoveRepo = useCallback((repo: string) => {
    if (!group) return;
    updateRepoGroupRepos(group.name, group.repos.filter((r) => r !== repo));
  }, [group, updateRepoGroupRepos]);

  const handleRun = useCallback(async () => {
    if (!group || !branch.trim() || group.repos.length === 0) return;
    setBusy(true);
    setResults([]);
    for (const repo of group.repos) {
      const r = await gitApi().batchCheckout(repo, branch.trim(), opts);
      setResults((prev) => [...prev, r.data ?? { repo, ok: false, error: r.error, branchBefore: "", branchAfter: "", stashed: false, restored: false, actions: [] }]);
    }
    setBusy(false);
  }, [group, branch, opts]);

  return (
    <div className="settings-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-dialog repogroup-dialog">
        <div className="settings-header">
          <h2>{t("repoGroups.title")}</h2>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>
        <div className="repogroup-body">
          <div className="repogroup-side">
            <div className="setting-row"><label>{t("repoGroups.newGroup")}</label></div>
            <div className="repogroup-inline">
              <input type="text" value={newGroupName} placeholder={t("repoGroups.groupNamePlaceholder")}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateGroup(); }} />
              <button className="settings-btn primary" onClick={handleCreateGroup} disabled={!newGroupName.trim()}>{t("repoGroups.addGroup")}</button>
            </div>
            <div className="repogroup-group-list">
              {groups.map((g) => (
                <div key={g.name} className={`repogroup-group-item${g.name === selectedGroup ? " active" : ""}`} onClick={() => setSelectedGroup(g.name)}>
                  <span className="repogroup-group-name">{g.name}</span>
                  <span className="repogroup-group-count">{g.repos.length}</span>
                  <button className="repogroup-remove" title={t("repoGroups.deleteGroup")} onClick={(e) => { e.stopPropagation(); removeRepoGroup(g.name); setSelectedGroup(null); }}>&times;</button>
                </div>
              ))}
              {groups.length === 0 && <div className="empty-state">{t("repoGroups.empty")}</div>}
            </div>
          </div>
          <div className="repogroup-main">
            {!group ? (
              <div className="empty-state">{t("repoGroups.selectGroup")}</div>
            ) : (
              <>
                <div className="settings-section">
                  <div className="setting-row"><label>{t("repoGroups.repos")} ({group.repos.length})</label></div>
                  <div className="repogroup-repo-list">
                    {group.repos.map((r) => (
                      <div key={r} className="repogroup-repo-item">
                        <span className="repo-item-name">{r.split(/[/\\]/).pop()}</span>
                        <span className="repo-item-path">{r}</span>
                        <button className="settings-btn secondary" onClick={() => handleRemoveRepo(r)}>{t("repoGroups.removeRepo")}</button>
                      </div>
                    ))}
                    {group.repos.length === 0 && <div className="empty-state">{t("repoGroups.noRepos")}</div>}
                  </div>
                  <div className="repogroup-inline">
                    <input type="text" value={repoPathInput} placeholder={t("repoGroups.addRepoPlaceholder")}
                      onChange={(e) => setRepoPathInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddManual(); }} />
                    <button className="settings-btn secondary" onClick={handleBrowseRepo}>{t("repoGroups.browse")}</button>
                    <button className="settings-btn primary" onClick={handleAddManual} disabled={!repoPathInput.trim()}>{t("repoGroups.addRepo")}</button>
                  </div>
                  <div className="repogroup-known">
                    {repos.filter((r) => !group.repos.includes(r.path)).map((r) => (
                      <button key={r.path} className="file-action-btn" onClick={() => handleAddFromKnown(r.path)} title={r.path}>+ {r.name}</button>
                    ))}
                    {repos.length === 0 && <span className="setting-hint">{t("repoGroups.noKnown")}</span>}
                  </div>
                  <div className="setting-divider" />
                  <div className="setting-row"><label>{t("repoGroups.scanDir")}</label></div>
                  <div className="repogroup-inline">
                    <input type="text" value={scanDir} placeholder={t("repoGroups.scanDirPlaceholder")}
                      onChange={(e) => setScanDir(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleScan(); }} />
                    <button className="settings-btn secondary" onClick={handleBrowseScan}>{t("repoGroups.browse")}</button>
                    <button className="settings-btn secondary" onClick={handleScan}>{t("repoGroups.scan")}</button>
                  </div>
                  {scanResults.length > 0 && (
                    <div className="repogroup-scan">
                      <div className="setting-hint">{t("repoGroups.scanResult")}</div>
                      {scanResults.map((s) => (
                        <label key={s.path} className="repogroup-scan-item">
                          <input type="checkbox" checked={selectedScan.has(s.path)}
                            onChange={(e) => setSelectedScan((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(s.path); else next.delete(s.path);
                              return next;
                            })} />
                          <span>{s.name}</span>
                          <span className="repo-item-path">{s.path}</span>
                        </label>
                      ))}
                      <button className="settings-btn primary" onClick={handleAddScan} disabled={selectedScan.size === 0}>{t("repoGroups.addSelected")}</button>
                    </div>
                  )}
                </div>
                <div className="setting-divider" />
                <div className="settings-section">
                  <div className="setting-row"><label>{t("repoGroups.runTitle")}</label></div>
                  <div className="repogroup-inline">
                    <input type="text" value={branch} placeholder={t("repoGroups.branchPlaceholder")}
                      onChange={(e) => setBranch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !busy) handleRun(); }} />
                    <button className="settings-btn primary" onClick={handleRun} disabled={busy || !branch.trim() || group.repos.length === 0}>
                      {busy ? t("repoGroups.running") : t("repoGroups.run")}
                    </button>
                  </div>
                  <div className="repogroup-opts">
                    <label className="amend-check"><input type="checkbox" checked={opts.fetch} onChange={(e) => setOpts({ ...opts, fetch: e.target.checked })} />{t("repoGroups.optFetch")}</label>
                    <label className="amend-check"><input type="checkbox" checked={opts.pull} onChange={(e) => setOpts({ ...opts, pull: e.target.checked })} />{t("repoGroups.optPull")}</label>
                    <label className="amend-check"><input type="checkbox" checked={opts.stash} onChange={(e) => setOpts({ ...opts, stash: e.target.checked })} />{t("repoGroups.optStash")}</label>
                  </div>
                </div>
                {results.length > 0 && (
                  <div className="settings-section">
                    <div className="setting-row"><label>{t("repoGroups.results")}</label></div>
                    <div className="repogroup-results">
                      {results.map((r) => (
                        <div key={r.repo} className={`repogroup-result ${r.ok ? "ok" : "fail"}`}>
                          <span className="repo-item-name">{r.repo.split(/[/\\]/).pop()}</span>
                          <span className="repogroup-result-branches">{r.branchBefore || "?"} &#8594; {r.branchAfter || "?"}</span>
                          <span className="repogroup-result-actions">{r.actions.join(", ")}</span>
                          <span className="repogroup-result-status">
                            {r.skipped ? t("repoGroups.skipped") : r.ok ? t("repoGroups.ok") : t("repoGroups.failed")}
                          </span>
                          {r.error && <span className="repogroup-result-error" title={r.error}>{r.error}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
