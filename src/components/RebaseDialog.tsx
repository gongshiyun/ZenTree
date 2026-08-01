import { useState, useEffect, useCallback } from "react";
import { useRepoStore } from "../application/repoStore";
import { useT } from "../i18n";
import { gitApi } from "../infrastructure/gitBridge";
import type { RebaseTodoEntry } from "../types";

type Action = RebaseTodoEntry["action"];

interface Row {
  hash: string;
  subject: string;
  action: Action;
  rewordMessage: string;
}

export default function RebaseDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const base = useRepoStore((s) => s.showRebase);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!currentRepo || !base) return;
    (async () => {
      const r = await gitApi().logRange(currentRepo, base, "HEAD");
      if (r.success && r.data) {
        // Display newest first (like the commit graph); the todo is reversed later.
        setRows(r.data.map((c) => ({ hash: c.hash, subject: c.subject, action: "pick" as Action, rewordMessage: c.subject })));
      } else {
        setLoadError(r.error || t("error.opFailed"));
      }
    })();
  }, [currentRepo, base]);

  const updateRow = useCallback((index: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }, []);

  const moveRow = useCallback((index: number, delta: -1 | 1) => {
    setRows((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const handleStart = useCallback(async () => {
    if (!currentRepo || !base) return;
    const todo: RebaseTodoEntry[] = [...rows]
      .reverse()
      .map((r) => ({
        action: r.action,
        hash: r.hash,
        subject: r.subject,
        rewordMessage: r.action === "reword" ? r.rewordMessage : undefined,
      }));
    const active = todo.filter((e) => e.action !== "drop").length;
    if (active === 0) { setError(t("rebase.noCommits")); return; }
    if (!window.confirm(t("rebase.confirm").replace("{0}", String(active)))) return;
    setBusy(true);
    setLoading(true, t("rebase.running"));
    try {
      const r = await gitApi().rebaseInteractive(currentRepo, base, todo);
      if (r.success) { await refreshAll(); onClose(); }
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); setBusy(false); }
  }, [currentRepo, base, rows, refreshAll, setLoading, setError, t, onClose]);

  return (
    <div className="settings-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="settings-dialog rebase-dialog">
        <div className="settings-header">
          <h2>{t("rebase.title")}</h2>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>
        <div className="rebase-body">
          <p className="setting-hint">{t("rebase.baseHint").replace("{0}", base || "")}</p>
          {loadError && <div className="dialog-error">{loadError}</div>}
          {rows.length === 0 && !loadError && <div className="empty-state">{t("rebase.noCommits")}</div>}
          <div className="rebase-list">
            {rows.map((row, i) => (
              <div key={row.hash} className="rebase-row">
                <span className="rebase-index">{i + 1}</span>
                <select className="rebase-action" value={row.action} onChange={(e) => updateRow(i, { action: e.target.value as Action })}>
                  <option value="pick">{t("rebase.pick")}</option>
                  <option value="reword">{t("rebase.reword")}</option>
                  <option value="squash">{t("rebase.squash")}</option>
                  <option value="fixup">{t("rebase.fixup")}</option>
                  <option value="drop">{t("rebase.drop")}</option>
                </select>
                <div className="rebase-info">
                  <span className="rebase-subject">{row.subject}</span>
                  <span className="rebase-hash">{row.hash.substring(0, 7)}</span>
                </div>
                {row.action === "reword" && (
                  <input className="rebase-reword" type="text" value={row.rewordMessage}
                    placeholder={t("rebase.rewordPlaceholder")}
                    onChange={(e) => updateRow(i, { rewordMessage: e.target.value })} />
                )}
                <div className="rebase-move">
                  <button className="file-action-btn" onClick={() => moveRow(i, -1)} disabled={i === 0} title={t("rebase.moveUp")}>&#9650;</button>
                  <button className="file-action-btn" onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1} title={t("rebase.moveDown")}>&#9660;</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rebase-footer">
          <button className="settings-btn secondary" onClick={onClose} disabled={busy}>{t("rebase.cancel")}</button>
          <button className="settings-btn primary" onClick={handleStart} disabled={busy || rows.length === 0}>{t("rebase.start")}</button>
        </div>
      </div>
    </div>
  );
}
