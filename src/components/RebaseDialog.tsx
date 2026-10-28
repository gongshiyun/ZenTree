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
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!currentRepo || !base) return;
    (async () => {
      const r = await gitApi().logRange(currentRepo, base, "HEAD");
      if (r.success && r.data) {
        // logRange returns commits oldest-first (git log --reverse); that is
        // also the order git replays a rebase todo list. Keep the rows in this
        // order for both display and submission — do not reverse them.
        setRows(r.data.map((c) => ({ hash: c.hash, subject: c.subject, action: "pick" as Action, rewordMessage: c.subject })));
      } else {
        setLoadError(r.error || t("error.opFailed"));
      }
    })();
  }, [currentRepo, base]);

  const firstActiveIndex = rows.findIndex((row) => row.action !== "drop");

  const updateRow = useCallback((index: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setActionError("");
  }, []);

  const moveRow = useCallback((index: number, delta: -1 | 1) => {
    setRows((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setActionError("");
  }, []);

  const handleStart = useCallback(async () => {
    if (!currentRepo || !base) return;
    // The first commit git replays must be a pick/reword: squash/fixup need a
    // previous commit to combine with, and git aborts leaving the repo
    // mid-rebase. Validate before asking for confirmation (E3).
    const activeIndex = rows.findIndex((r) => r.action !== "drop");
    if (activeIndex === -1) { setError(t("rebase.noCommits")); return; }
    const firstAction = rows[activeIndex].action;
    if (firstAction === "squash" || firstAction === "fixup") {
      setActionError(t("rebase.firstActionInvalid"));
      return;
    }
    setActionError("");
    // Rows are oldest-first, the order a rebase todo list is replayed in (H1);
    // send them unchanged. `drop` entries are filtered out by the backend.
    const todo: RebaseTodoEntry[] = rows.map((r) => ({
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
      <div className="settings-dialog rebase-dialog" role="dialog" aria-modal="true" aria-labelledby="rebase-title">
        <div className="settings-header">
          <h2 id="rebase-title">{t("rebase.title")}</h2>
          <button type="button" className="settings-close" aria-label={t("rebase.cancel")} title={t("rebase.cancel")} onClick={onClose}>&times;</button>
        </div>
        <div className="rebase-body">
          <p className="rebase-base-hint">{t("rebase.baseHint").replace("{0}", base || "")}</p>
          {loadError && <div className="dialog-error">{loadError}</div>}
          {actionError && <div className="dialog-error" role="alert">{actionError}</div>}
          {rows.length === 0 && !loadError && <div className="empty-state">{t("rebase.noCommits")}</div>}
          <div className="rebase-list">
            {rows.map((row, i) => (
              <div key={row.hash} className="rebase-row">
                <span className="rebase-index">{i + 1}</span>
                <select className="dialog-input rebase-action" value={row.action} onChange={(e) => updateRow(i, { action: e.target.value as Action })}>
                  <option value="pick">{t("rebase.pick")}</option>
                  <option value="reword">{t("rebase.reword")}</option>
                  <option value="squash" disabled={i === firstActiveIndex}>{t("rebase.squash")}</option>
                  <option value="fixup" disabled={i === firstActiveIndex}>{t("rebase.fixup")}</option>
                  <option value="drop">{t("rebase.drop")}</option>
                </select>
                <div className="rebase-info">
                  <span className="rebase-subject">{row.subject}</span>
                  <span className="rebase-hash">{row.hash.substring(0, 7)}</span>
                </div>
                {row.action === "reword" && (
                  <input className="dialog-input rebase-reword" type="text" value={row.rewordMessage}
                    placeholder={t("rebase.rewordPlaceholder")}
                    onChange={(e) => updateRow(i, { rewordMessage: e.target.value })} />
                )}
                <div className="rebase-move">
                  <button type="button" className="file-action-btn" onClick={() => moveRow(i, -1)} disabled={i === 0} title={t("rebase.moveUp")}>&#9650;</button>
                  <button type="button" className="file-action-btn" onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1} title={t("rebase.moveDown")}>&#9660;</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rebase-footer">
          <button type="button" className="settings-btn secondary" onClick={onClose} disabled={busy}>{t("rebase.cancel")}</button>
          <button type="button" className="settings-btn primary" onClick={handleStart} disabled={busy || rows.length === 0}>{t("rebase.start")}</button>
        </div>
      </div>
    </div>
  );
}
