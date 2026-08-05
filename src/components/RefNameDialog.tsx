import { useState, useRef, useEffect } from "react";
import { useT } from "../i18n";

interface Props {
  title: string;
  placeholder: string;
  defaultValue?: string;
  confirmLabel: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

/**
 * Shared single-field ref name dialog, used by the graph context menu
 * (create branch / create tag at a commit) and the sidebar.
 */
export default function RefNameDialog({ title, placeholder, defaultValue = "", confirmLabel, onSubmit, onClose }: Props) {
  const t = useT();
  const [name, setName] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    const value = name.trim();
    if (!value) return;
    onSubmit(value);
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog ref-name-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{title}</h2>
          <button className="settings-close" onClick={onClose} title={t("refName.cancel")}>
            <svg width="14" height="14" viewBox="0 0 14 14"><line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5"/><line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.5"/></svg>
          </button>
        </div>
        <div className="settings-body">
          <input
            ref={inputRef}
            type="text"
            className="ref-name-input"
            value={name}
            placeholder={placeholder}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onClose();
            }}
          />
        </div>
        <div className="settings-footer">
          <button className="settings-btn secondary" onClick={onClose}>{t("refName.cancel")}</button>
          <button className="settings-btn primary" disabled={!name.trim()} onClick={submit}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
