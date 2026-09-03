/** One row of the tab picker: an open tab, or a known repository that is not open yet. */
export interface TabPickItem {
  path: string;
  label: string;
  hint?: string;
  /** True when the path is already part of the visible tab set. */
  open: boolean;
}

/**
 * Tab picker filter, hand-rolled on purpose — the project bans new runtime
 * dependencies, so no fuzzy-match library here.
 *
 * Case-insensitive substring match over the label and the hint (the repository
 * path, so typing a folder name narrows repositories that share a display name).
 * Already-open tabs are ranked ahead of the rest; insertion order is preserved
 * inside each rank, so the caller decides the secondary ordering. An empty
 * query returns everything, still open-first.
 */
export function filterTabs<T extends TabPickItem>(items: T[], query: string, limit = 100): T[] {
  const q = query.trim().toLowerCase();
  const matched = q
    ? items.filter((item) => item.label.toLowerCase().includes(q) || (item.hint ?? "").toLowerCase().includes(q))
    : items;
  const open = matched.filter((item) => item.open);
  const closed = matched.filter((item) => !item.open);
  return [...open, ...closed].slice(0, limit);
}
