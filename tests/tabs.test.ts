import { describe, it, expect } from "vitest";
import { repoDisplayName } from "../src/domain/tabs/displayName";
import { filterTabs, type TabPickItem } from "../src/domain/tabs/filterTabs";

/**
 * Pure-function tests for the tab domain helpers (src/domain/tabs).
 * No git and no DOM involved: tab labels are derived from paths and the picker
 * filter is hand-rolled, so both are worth pinning down on their own.
 */

describe("repoDisplayName", () => {
  it("takes the last segment of a posix path", () => {
    expect(repoDisplayName("/home/u/repos/zentree")).toBe("zentree");
  });

  it("takes the last segment of a windows path", () => {
    expect(repoDisplayName("d:\\ai-code\\ZenTree")).toBe("ZenTree");
  });

  it("handles mixed separators", () => {
    expect(repoDisplayName("d:/ai-code\\ZenTree")).toBe("ZenTree");
  });

  it("ignores trailing separators", () => {
    expect(repoDisplayName("d:/ai-code/ZenTree/")).toBe("ZenTree");
    expect(repoDisplayName("d:\\ai-code\\ZenTree\\\\")).toBe("ZenTree");
  });

  it("keeps a UNC share's last segment", () => {
    expect(repoDisplayName("\\\\host\\share\\repo")).toBe("repo");
  });

  it("returns a bare name unchanged", () => {
    expect(repoDisplayName("zentree")).toBe("zentree");
  });

  it("never invents a label for degenerate paths", () => {
    expect(repoDisplayName("/")).toBe("/");
    expect(repoDisplayName("")).toBe("");
  });
});

function item(path: string, open: boolean, label?: string): TabPickItem {
  return { path, label: label ?? path, hint: path, open };
}

describe("filterTabs", () => {
  it("returns everything, open tabs first, for an empty query", () => {
    const items = [item("/r/a", false), item("/r/b", true), item("/r/c", false), item("/r/d", true)];
    expect(filterTabs(items, "").map((i) => i.path)).toEqual(["/r/b", "/r/d", "/r/a", "/r/c"]);
  });

  it("matches the label case-insensitively", () => {
    const items = [item("/r/1", false, "Alpha"), item("/r/2", false, "beta")];
    expect(filterTabs(items, "ALPHA").map((i) => i.label)).toEqual(["Alpha"]);
  });

  it("matches the hint path, so a folder name narrows same-named repos", () => {
    const items = [item("d:/work/app", false, "app"), item("d:/home/app", false, "app")];
    expect(filterTabs(items, "home").map((i) => i.path)).toEqual(["d:/home/app"]);
  });

  it("keeps open tabs ahead of closed ones after filtering", () => {
    const items = [item("/r/closed", false, "zentree"), item("/r/open", true, "zentree")];
    expect(filterTabs(items, "zen").map((i) => i.open)).toEqual([true, false]);
  });

  it("preserves insertion order inside each rank", () => {
    const items = [item("/r/b", false), item("/r/a", false), item("/r/d", true), item("/r/c", true)];
    expect(filterTabs(items, "r/").map((i) => i.path)).toEqual(["/r/d", "/r/c", "/r/b", "/r/a"]);
  });

  it("trims surrounding whitespace from the query", () => {
    expect(filterTabs([item("/r/a", false, "Alpha")], "  alpha  ")).toHaveLength(1);
  });

  it("returns nothing when no item matches", () => {
    expect(filterTabs([item("/r/a", false, "Alpha")], "zzz")).toEqual([]);
  });

  it("caps the result list", () => {
    const items = Array.from({ length: 250 }, (_, i) => item(`/r/${i}`, false, `repo-${i}`));
    expect(filterTabs(items, "repo-")).toHaveLength(100);
    expect(filterTabs(items, "repo-", 5)).toHaveLength(5);
  });
});
