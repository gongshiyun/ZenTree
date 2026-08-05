import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRepoStore, THEME_PRESETS } from "../application/repoStore";
import { useT } from "../i18n";
import { gitApi } from "../infrastructure/gitBridge";

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

/**
 * Ctrl+K command palette: fuzzy-ish substring search over repositories,
 * local branches and fixed commands. Deliberately dependency-free.
 */
export default function CommandPalette() {
  const t = useT();
  const show = useRepoStore((s) => s.showCommandPalette);
  const setShow = useRepoStore((s) => s.setShowCommandPalette);
  const repos = useRepoStore((s) => s.repos);
  const branches = useRepoStore((s) => s.branches);
  const currentBranch = useRepoStore((s) => s.currentBranch);
  const refreshAll = useRepoStore((s) => s.refreshAll);
  const checkoutBranch = useRepoStore((s) => s.checkoutBranch);
  const setThemePreset = useRepoStore((s) => s.setThemePreset);
  const setLanguage = useRepoStore((s) => s.setLanguage);
  const setShowSettings = useRepoStore((s) => s.setShowSettings);

  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (show) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [show]);

  const commands = useMemo((): CommandItem[] => {
    const items: CommandItem[] = [];
    for (const r of repos) {
      items.push({ id: "repo:" + r.path, label: r.name, hint: r.path, run: () => {
        const store = useRepoStore.getState();
        store.setCurrentRepo(r.path);
        store.refreshAll(r.path);
      } });
    }
    for (const b of branches) {
      if (b === currentBranch) continue;
      items.push({ id: "branch:" + b, label: b, hint: t("palette.checkoutBranch"), run: () => { checkoutBranch(b); } });
    }
    const fixed: CommandItem[] = [
      { id: "cmd:refresh", label: t("palette.refresh"), run: () => { refreshAll(); } },
      { id: "cmd:stage-all", label: t("palette.stageAll"), run: () => {
        const repo = useRepoStore.getState().currentRepo;
        if (!repo) return;
        gitApi().stageAll(repo).then(() => refreshAll());
      } },
      { id: "cmd:unstage-all", label: t("palette.unstageAll"), run: () => {
        const repo = useRepoStore.getState().currentRepo;
        if (!repo) return;
        gitApi().unstageAll(repo).then(() => refreshAll());
      } },
      { id: "cmd:settings", label: t("palette.settings"), run: () => { setShowSettings(true); } },
      { id: "cmd:theme", label: t("palette.toggleTheme"), run: () => {
        const store = useRepoStore.getState();
        const idx = THEME_PRESETS.findIndex((p) => p.name === store.themePreset);
        const target = THEME_PRESETS[(idx + 1) % THEME_PRESETS.length];
        setThemePreset(target.name);
      } },
      { id: "cmd:language", label: t("palette.toggleLanguage"), run: () => {
        setLanguage(useRepoStore.getState().language === "zh" ? "en" : "zh");
      } },
    ];
    return [...items, ...fixed];
  }, [repos, branches, currentBranch, t, refreshAll, checkoutBranch, setThemePreset, setLanguage, setShowSettings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 50);
    return commands.filter((c) => c.label.toLowerCase().includes(q) || (c.hint ?? "").toLowerCase().includes(q)).slice(0, 50);
  }, [commands, query]);

  const execute = useCallback((item: CommandItem) => {
    setShow(false);
    item.run();
  }, [setShow]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { if (filtered[index]) execute(filtered[index]); }
    else if (e.key === "Escape") { setShow(false); }
  }, [filtered, index, execute, setShow]);

  if (!show) return null;

  return (
    <div className="settings-overlay palette-overlay" onClick={() => setShow(false)}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <input
          ref={inputRef}
          type="text"
          className="palette-input"
          placeholder={t("palette.placeholder")}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
        />
        <div className="palette-list">
          {filtered.map((item, i) => (
            <div
              key={item.id}
              className={`palette-item${i === index ? " active" : ""}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => execute(item)}
            >
              <span className="palette-label">{item.label}</span>
              {item.hint && <span className="palette-hint">{item.hint}</span>}
            </div>
          ))}
          {filtered.length === 0 && <div className="palette-empty">{t("palette.noResults")}</div>}
        </div>
      </div>
    </div>
  );
}
