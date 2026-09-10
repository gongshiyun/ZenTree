import type { CommitLogEntry, GraphData, GraphEdge, GraphNode } from "../../types";
import { hashToColor } from "./colors";

/** Vertical spacing between commit rows in world coordinates. */
export const GRAPH_ROW_HEIGHT = 30;
/** Horizontal spacing between lanes in world coordinates. */
export const GRAPH_LANE_WIDTH = 22;

/**
 * Pure layout algorithm: converts the linear commit log into a DAG graph
 * with lane assignment (O(n) via a pre-built child map).
 */
export function buildGraphData(logEntries: CommitLogEntry[]): GraphData {
  if (logEntries.length === 0) return { nodes: [], edges: [], maxLane: 0 };
  const n = logEntries.length;
  const hashToIndex = new Map<string, number>();
  const loadedHashes = new Set<string>();
  for (let i = 0; i < n; i++) {
    hashToIndex.set(logEntries[i].hash, i);
    loadedHashes.add(logEntries[i].hash);
  }

  // Each lane is waiting for the next commit expected on that branch. A commit
  // may be referenced by multiple children; when it is reached, those lanes
  // converge and the duplicate lanes become free again.
  const activeColumns: (string | null)[] = [];
  const nodeLanes: number[] = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const commit = logEntries[i];
    let lane = activeColumns.indexOf(commit.hash);
    if (lane === -1) {
      lane = activeColumns.indexOf(null);
      if (lane === -1) { lane = activeColumns.length; activeColumns.push(null); }
    }
    nodeLanes[i] = lane;

    // All other lanes waiting for this commit converge into the chosen lane.
    for (let j = 0; j < activeColumns.length; j++) {
      if (j !== lane && activeColumns[j] === commit.hash) activeColumns[j] = null;
    }

    const parents = commit.parents.filter((parent) => loadedHashes.has(parent));
    activeColumns[lane] = parents[0] ?? null;
    for (const parent of parents.slice(1)) {
      if (activeColumns.includes(parent)) continue;
      let parentLane = activeColumns.indexOf(null);
      if (parentLane === -1) {
        parentLane = activeColumns.length;
        activeColumns.push(null);
      }
      activeColumns[parentLane] = parent;
    }
  }

  const nodes: GraphNode[] = logEntries.map((entry, i) => ({
    hash: entry.hash, shortHash: entry.shortHash, parents: entry.parents,
    author: entry.author, email: entry.email, timestamp: entry.timestamp, subject: entry.subject, body: entry.body || "",
    x: nodeLanes[i] * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH, y: i * GRAPH_ROW_HEIGHT + GRAPH_ROW_HEIGHT / 2,
    color: hashToColor(entry.hash), lane: nodeLanes[i], isSelected: false,
  }));

  const edges: GraphEdge[] = [];
  for (let i = 0; i < n; i++) {
    const node = logEntries[i];
    for (const parentHash of node.parents) {
      const parentIdx = hashToIndex.get(parentHash);
      if (parentIdx !== undefined) {
        edges.push({
          fromX: nodeLanes[i] * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH, fromY: nodes[i].y,
          toX: nodeLanes[parentIdx] * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH, toY: nodes[parentIdx].y,
          color: nodes[i].color,
        });
      }
    }
  }
  return { nodes, edges, maxLane: Math.max(0, ...nodeLanes) + 1 };
}
