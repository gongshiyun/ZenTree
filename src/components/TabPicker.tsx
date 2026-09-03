import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRepoStore, visibleTabs } from "../application/repoStore";
import { useT } from "../i18n";
import { filterTabs, type TabPickItem } from "../domain/tabs/filterTabs";
import { repoDisplayName } from "../domain/tabs/displayName";

/**
 * Ctrl+P tab picker: jump to an already-open tab, or open a known repository as
 * a new one. Covers both directions of "get me to a repository", which is why
 * the top bar's old searchable repo dropdown could be retired.
 *
 * Modelled on CommandPalette (overlay, dependency-free substring filter, arrow
 * key navigation) with its one flaw fixed: the highlighted row is scrolled into
 * view, so a long list stays navigable from the keyboard alone.
 */
export default function TabPicker() {
  const t = useT();
  const show = useRepoStore((s) => s.showTabPicker);
  const setShow = useRepoStore((s) => s.setShowTabPicker);
  const repos = useRepoStore((s) => s.repos);
  const customTabs = useRepoStore((s) => s.customTabs);
  const groupView = useRepoStore((s) => s.groupView);

  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show) return;
    setQuery("");
    setIndex(0);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [show]);

  const items = useMemo((): TabPickItem[] => {
    const tabs = visibleTabs({ groupView, customTabs });
    const list: TabPickItem[] = tabs.map((path) => ({
      path,
      label: repos.find((r) => r.path === path)?.name ?? repoDisplayName(path),
      hint: path,
      open: true,
    }));
    const seen = new Set(tabs);
    for (const r of repos) {
      if (seen.has(r.path)) continue;
      list.push({ path: r.path, label: r.name, hint: r.path, open: false });
    }
    return list;
  }, [repos, customTabs, groupView]);

  const filtered = useMemo(() => filterTabs(items, query), [items, query]);

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(".picker-item.active");
    row?.scrollIntoView?.({ block: "nearest" });
  }, [index, filtered.length, show]);

  const choose = useCallback((item: TabPickItem) => {
    setShow(false);
    const store = useRepoStore.getState();
    // An open tab is only activated; anything else becomes a tab first.
    if (item.open) store.activateTab(item.path);
    else store.openTab(item.path);
  }, [setShow]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { const item = filtered[index]; if (item) choose(item); }
    else if (e.key === "Escape") { setShow(false); }
  }, [filtered, index, choose, setShow]);

  if (!show) return null;

  return (
    <div className="settings-overlay palette-overlay" onClick={() => setShow(false)}>
      <div className="command-palette tab-picker" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <input
          ref={inputRef}
          type="text"
          className="palette-input"
          placeholder={t("tabs.placeholder")}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
        />
        <div className="palette-list" ref={listRef}>
          {filtered.map((item, i) => (
            <div
              key={item.path}
              className={`palette-item picker-item${i === index ? " active" : ""}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(item)}
            >
              <span className="palette-label">{item.label}</span>
              {item.open && <span className="picker-badge">{t("tabs.opened")}</span>}
              <span className="palette-hint">{item.hint}</span>
            </div>
          ))}
          {filtered.length === 0 && <div className="palette-empty">{t("tabs.noResults")}</div>}
        </div>
      </div>
    </div>
  );
}
