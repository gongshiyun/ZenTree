import { useState, useCallback, useEffect, useRef } from "react";
import { useRepoStore } from "../stores/repoStore";

export default function CommitBar() {
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const status = useRepoStore((s) => s.status);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const refreshAll = useRepoStore((s) => s.refreshAll);

  // Track the "real" user message separate from what Amend fills in
  const userMessageRef = useRef("");
  const [lastCommitMsg, setLastCommitMsg] = useState("");

  const stagedCount = status
    ? (status.staged?.length || 0) + (status.created?.length || 0)
    : 0;

  const canCommit = stagedCount > 0 || amend;

  // When amend is toggled, fetch the last commit message and fill/restore
  useEffect(() => {
    if (!currentRepo) return;

    if (amend) {
      // Save current user text, then fetch last commit message
      userMessageRef.current = message;
      (async () => {
        try {
          const result = await window.gitAPI.lastMessage(currentRepo);
          if (result.success && result.data) {
            setLastCommitMsg(result.data);
            setMessage(result.data);
          }
        } catch {
          // Silently fail — just don't fill
        }
      })();
    } else {
      // Restore user's original message
      setMessage(userMessageRef.current);
      setLastCommitMsg("");
    }
  }, [amend, currentRepo]);

  const handleCommit = useCallback(async () => {
    if (!currentRepo) return;
    setLoading(true, amend ? "Amending commit..." : "Committing...");
    try {
      const result = await window.gitAPI.commit(currentRepo, message.trim(), amend);
      if (result.success) {
        setMessage("");
        setAmend(false);
        userMessageRef.current = "";
        setLastCommitMsg("");
        await refreshAll();
      } else {
        setError(result.error || "Commit failed");
      }
    } catch (err: any) {
      setError(err.message || "Commit failed");
    } finally {
      setLoading(false, "");
    }
  }, [currentRepo, message, amend, setLoading, setError, refreshAll]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleCommit();
    }
  }, [handleCommit]);

  const handleMessageChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    if (!amend) {
      userMessageRef.current = e.target.value;
    }
  }, [amend]);

  return (
    <div className="commit-bar">
      <textarea
        placeholder={
          canCommit
            ? "Commit message... (Ctrl+Enter to commit)"
            : "No staged changes — stage files first"
        }
        value={message}
        onChange={handleMessageChange}
        onKeyDown={handleKeyDown}
      />
      <div className="commit-options">
        <label className="amend-check">
          <input
            type="checkbox"
            checked={amend}
            onChange={(e) => setAmend(e.target.checked)}
          />
          Amend
        </label>
        <button
          className="commit-btn"
          disabled={!canCommit}
          onClick={handleCommit}
          title={amend ? "Amend last commit" : stagedCount === 0 ? "No staged changes" : `Commit ${stagedCount} staged file(s)`}
        >
          Commit
        </button>
      </div>
    </div>
  );
}
