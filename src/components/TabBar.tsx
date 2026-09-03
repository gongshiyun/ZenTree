import { useCallback, useEffect, useRef, useState } from "react";
import { useRepoStore, visibleTabs } from "../application/repoStore";
import { useT } from "../i18n";
import { gitApi } from "../infrastructure/gitBridge";
import { repoDisplayName } from "../domain/tabs/displayName";

/**
 * Repository tab strip, one row below the top bar.
 *
 * Tabs are decoupled from the known-repository list: a tab is a bare path and
 * its label is derived at render time (RepoInfo.name when the repository is
 * known, else the path's last segment), so repo-group members that were never
 * "opened" still get a sensible name.
 *
 * The window is frameless, so there is no native tab strip to hook into: this is
 * plain renderer DOM in its own row, kept out of the draggable top bar so every
 * pixel of it stays clickable.
 */
export default function TabBar() {
  const t = useT();
  const repos = useRepoStore((s) => s.repos);
  const customTabs = useRepoStore((s) => s.customTabs);
  const groupView = useRepoStore((s) => s.groupView);
  const repoGroups = useRepoStore((s) => s.repoGroups);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const activateTab = useRepoStore((s) => s.activateTab);
  const closeTab = useRepoStore((s) => s.closeTab);
  const reorderTabs = useRepoStore((s) => s.reorderTabs);
  const enterGroupView = useRepoStore((s) => s.enterGroupView);
  const exitGroupView = useRepoStore((s) => s.exitGroupView);
  const setShowTabPicker = useRepoStore((s) => s.setShowTabPicker);
  const setError = useRepoStore((s) => s.setError);

  const tabs = visibleTabs({ groupView, customTabs });
  const listRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Close the group menu on an outside click (same pattern as the TopBar dropdowns).
  useEffect(() => {
    if (!showGroupMenu) return;
    const handler = (e: MouseEvent) => { if (groupRef.current && !groupRef.current.contains(e.target as Node)) setShowGroupMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showGroupMenu]);

  // The strip hides its scrollbar, so keep the active tab in view by hand.
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(".repo-tab.active");
    active?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [currentRepo, tabs]);

  const labelOf = useCallback(
    (path: string) => repos.find((r) => r.path === path)?.name ?? repoDisplayName(path),
    [repos],
  );

  const handleAdd = useCallback(async () => {
    const path = await gitApi().openDirectory();
    if (!path) return;
    const result = await gitApi().isRepo(path);
    if (result.success && result.data) {
      const store = useRepoStore.getState();
      store.addRepo(path, repoDisplayName(path));
      store.openTab(path);
    } else {
      setError(`"${path}" ` + t("app.invalidRepo"));
    }
  }, [setError, t]);

  // The strip only scrolls horizontally; translate vertical wheel deltas into it.
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const el = listRef.current;
    if (el && e.deltaY !== 0) el.scrollLeft += e.deltaY;
  }, []);

  const chooseGroup = useCallback((name: string | null) => {
    setShowGroupMenu(false);
    if (name === null) exitGroupView();
    else enterGroupView(name);
  }, [enterGroupView, exitGroupView]);

  return (
    <div className="tab-bar">
      <div className="tab-list" ref={listRef} onWheel={handleWheel}>
        {tabs.map((path, i) => (
          <div
            key={path}
            className={`repo-tab${path === currentRepo ? " active" : ""}${dragIndex === i ? " dragging" : ""}`}
            title={path}
            draggable
            onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) reorderTabs(dragIndex, i); setDragIndex(null); }}
            onDragEnd={() => setDragIndex(null)}
            onClick={() => { activateTab(path); }}
            onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(path); } }}
          >
            <span className="repo-tab-name">{labelOf(path)}</span>
            <button
              className="repo-tab-close"
              title={t("tabs.close")}
              onClick={(e) => { e.stopPropagation(); closeTab(path); }}
            >&times;</button>
          </div>
        ))}
        {tabs.length === 0 && <div className="tab-empty">{t("tabs.empty")}</div>}
      </div>
      <div className="tab-bar-actions">
        {groupView && (
          <button className="tab-action-btn back" onClick={() => { exitGroupView(); }} title={t("tabs.exitGroupTip")}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 2.5L3.5 6L7 9.5" />
            </svg>
            {t("tabs.exitGroup")}
          </button>
        )}
        <div className="tab-group-wrap" ref={groupRef}>
          <button className="tab-action-btn" onClick={() => setShowGroupMenu(!showGroupMenu)} title={t("tabs.groupTip")}>
            <span className="tab-group-label">{groupView ? groupView.name : t("tabs.custom")}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {showGroupMenu && (
            <div className="tab-group-menu">
              <div className={`tab-group-item${groupView ? "" : " active"}`} onClick={() => chooseGroup(null)}>
                <span className="tab-group-item-name">{t("tabs.custom")}</span>
                <span className="tab-group-item-count">{customTabs.length}</span>
              </div>
              {repoGroups.map((g) => (
                <div key={g.name} className={`tab-group-item${groupView?.name === g.name ? " active" : ""}`} onClick={() => chooseGroup(g.name)}>
                  <span className="tab-group-item-name">{g.name}</span>
                  <span className="tab-group-item-count">{g.repos.length}</span>
                </div>
              ))}
              {repoGroups.length === 0 && <div className="tab-group-empty">{t("tabs.noGroups")}</div>}
            </div>
          )}
        </div>
        <button className="tab-action-btn icon-only" onClick={() => setShowTabPicker(true)} title={t("tabs.searchTip")}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="7" cy="7" r="4.2" />
            <path d="M10.2 10.2L14 14" />
          </svg>
        </button>
        <button className="tab-action-btn icon-only" onClick={handleAdd} title={t("tabs.addTip")}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </div>
    </div>
  );
}
