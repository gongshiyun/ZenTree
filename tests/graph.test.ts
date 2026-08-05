import { describe, it, expect } from "vitest";
import { hashToColor, BRANCH_COLORS } from "../src/domain/graph/colors";
import { buildGraphData, GRAPH_ROW_HEIGHT, GRAPH_LANE_WIDTH } from "../src/domain/graph/layout";
import type { CommitLogEntry } from "../src/types";

function entry(hash: string, parents: string[]): CommitLogEntry {
  return { hash, shortHash: hash.slice(0, 7), parents, author: "A", email: "a@b.c", timestamp: 0, subject: hash };
}

describe("hashToColor", () => {
  it("is deterministic for the same hash", () => {
    expect(hashToColor("abc123")).toBe(hashToColor("abc123"));
  });

  it("always returns a color from the palette", () => {
    for (let i = 0; i < 50; i++) {
      const hash = `commit-${i}-${i * 7}`;
      expect(BRANCH_COLORS).toContain(hashToColor(hash));
    }
  });

  it("respects a custom palette", () => {
    expect(hashToColor("whatever", ["#000000"])).toBe("#000000");
  });
});

describe("buildGraphData layout", () => {
  it("places a linear history on a single lane with regular coordinates", () => {
    const entries = [entry("c3", ["c2"]), entry("c2", ["c1"]), entry("c1", [])];
    const g = buildGraphData(entries);
    expect(g.maxLane).toBe(1);
    g.nodes.forEach((node, i) => {
      expect(node.lane).toBe(0);
      expect(node.x).toBe(GRAPH_LANE_WIDTH);
      expect(node.y).toBe(i * GRAPH_ROW_HEIGHT + GRAPH_ROW_HEIGHT / 2);
    });
    // one edge per in-log parent link, same lane => straight vertical line
    expect(g.edges).toHaveLength(2);
    for (const edge of g.edges) {
      expect(edge.fromX).toBe(edge.toX);
      expect(edge.toY).toBeGreaterThan(edge.fromY);
    }
  });

  it("opens a second lane for divergent branches", () => {
    // head and feat are independent tips sharing parent a
    const entries = [entry("head", ["a"]), entry("feat", ["a"]), entry("a", [])];
    const g = buildGraphData(entries);
    expect(g.maxLane).toBe(2);
    expect(g.nodes[0].lane).not.toBe(g.nodes[1].lane);
    expect(g.edges).toHaveLength(2);
  });

  it("ignores parents outside the loaded log window", () => {
    // root's parent is not part of the log (pagination) => no edge for it
    const entries = [entry("tip", ["root"]), entry("root", ["outside"])];
    const g = buildGraphData(entries);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].color).toBe(g.nodes[0].color);
  });

  it("colors edges after the child node", () => {
    const entries = [entry("m", ["b", "c"]), entry("b", []), entry("c", [])];
    const g = buildGraphData(entries);
    const childColor = g.nodes[0].color;
    for (const edge of g.edges) expect(edge.color).toBe(childColor);
  });

  it("keeps node metadata intact and defaults body to empty string", () => {
    const e = entry("c1", []);
    const g = buildGraphData([e]);
    expect(g.nodes[0]).toMatchObject({ hash: "c1", shortHash: "c1", author: "A", body: "", isSelected: false });
  });
});
