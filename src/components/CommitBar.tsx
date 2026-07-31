import { useState, useCallback, useEffect, useRef } from "react";
import { useRepoStore } from "../application/repoStore";
import { gitApi } from "../infrastructure/gitBridge";
import { useT } from "../i18n";

export default function CommitBar() {
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const status = useRepoStore((s) => s.status);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const refreshAll = useRepoStore((s) => s.refreshAll);

  const t = useT();

  const userMessageRef = useRef("");
  const [lastCommitMsg, setLastCommitMsg] = useState("");
  const [textareaH, setTextareaH] = useState(72);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isResizingRef = useRef(false);

  const stagedCount = status ? (status.staged?.length || 0) + (status.created?.length || 0) : 0;
  const canCommit = stagedCount > 0 || amend;

  useEffect(() => {
    if (!currentRepo) return;
    if (amend) {
      userMessageRef.current = message;
      (async () => {
        try {
          const r = await gitApi().lastMessage(currentRepo);
          if (r.success && r.data) { setLastCommitMsg(r.data); setMessage(r.data); }
        } catch { /* */ }
      })();
    } else {
      setMessage(userMessageRef.current);
      setLastCommitMsg("");
    }
  }, [amend, currentRepo, message]);

  const handleCommit = useCallback(async () => {
    if (!currentRepo) return;
    setLoading(true, amend ? t("commit.amending") : t("commit.committing"));
    try {
      const r = await gitApi().commit(currentRepo, message.trim(), amend);
      if (r.success) { setMessage(""); setAmend(false); userMessageRef.current = ""; setLastCommitMsg(""); await refreshAll(); }
      else setError(r.error || t("error.commitFailed"));
    } catch (err: any) { setError(err.message || t("error.commitFailed")); }
    finally { setLoading(false, ""); }
  }, [currentRepo, message, amend, setLoading, setError, refreshAll, t]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleCommit(); }
  }, [handleCommit]);

  const handleMsgChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    if (!amend) userMessageRef.current = e.target.value;
  }, [amend]);

  // Custom top-edge resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    const startY = e.clientY;
    const startH = textareaH;
    const mm = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      setTextareaH(Math.max(54, Math.min(250, startH - (ev.clientY - startY))));
    };
    const mu = () => {
      isResizingRef.current = false;
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
    };
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
  }, [textareaH]);

  return (
    <div className="commit-bar">
      <div className="commit-textarea-wrap">
        <textarea
          ref={textareaRef}
          style={{ height: textareaH, resize: "none" }}
          placeholder={canCommit ? t("commit.placeholder") : t("commit.noStaged")}
          value={message}
          onChange={handleMsgChange}
          onKeyDown={handleKeyDown}
        />
        <div className="commit-resize-handle" onMouseDown={handleResizeStart} title="Drag to resize" />
      </div>
      <div className="commit-options">
        <label className="amend-check">
          <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} />
          {t("commit.amend")}
        </label>
        <button className="commit-btn" disabled={!canCommit} onClick={handleCommit}
          title={amend ? t("commit.amendTip") : (stagedCount === 0 ? t("commit.noStaged") : stagedCount + t("commit.commitTip"))}>
          {t("commit.commit")}
        </button>
      </div>
    </div>
  );
}
