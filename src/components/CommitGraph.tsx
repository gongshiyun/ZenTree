import { useEffect, useRef, useState, useCallback } from "react";
import { useRepoStore } from "../stores/repoStore";
import { GraphRenderer } from "../renderer/canvasRenderer";
import type { GraphNode } from "../types";

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

export default function CommitGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const graphData = useRepoStore((s) => s.graphData);
  const isDark = useRepoStore((s) => s.isDark);
  const selectedCommit = useRepoStore((s) => s.selectedCommit);
  const selectCommit = useRepoStore((s) => s.selectCommit);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setCommitDetail = useRepoStore((s) => s.setCommitDetail);

  const [tooltip, setTooltip] = useState<{ node: GraphNode; x: number; y: number } | null>(null);
  const mousePosRef = useRef({ x: 0, y: 0 });

  // Initialize renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    if (rendererRef.current) rendererRef.current.destroy();

    try {
      const renderer = new GraphRenderer(canvas);
      renderer.setTheme(isDark ? "dark" : "light");
      renderer.setData(graphData);
      renderer.setSelected(selectedCommit);

      renderer.setCallbacks({
        onHover: (node) => {
          if (node) {
            const pos = mousePosRef.current;
            setTooltip({ node, x: pos.x + 14, y: pos.y - 8 });
          } else {
            setTooltip(null);
          }
        },
        onClick: async (node) => {
          selectCommit(node.hash);
          if (currentRepo) {
            const result = await window.gitAPI.show(currentRepo, node.hash);
            if (result.success && result.data) {
              setCommitDetail(result.data);
            }
          }
        },
      });

      rendererRef.current = renderer;

      const observer = new ResizeObserver(() => renderer.handleResize());
      observer.observe(container);
      return () => {
        observer.disconnect();
        renderer.destroy();
      };
    } catch (e) {
      console.error("Failed to initialize graph renderer:", e);
    }
  }, []);

  // Update data
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setData(graphData);
      rendererRef.current.setSelected(selectedCommit);
    }
  }, [graphData]);

  // Update theme
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setTheme(isDark ? "dark" : "light");
    }
  }, [isDark]);

  // Update selected commit
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setSelected(selectedCommit);
    }
  }, [selectedCommit]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      mousePosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (tooltip) {
        setTooltip((prev) =>
          prev ? { ...prev, x: mousePosRef.current.x + 14, y: mousePosRef.current.y - 8 } : null
        );
      }
    }
  }, [tooltip]);

  return (
    <div className="graph-container" ref={containerRef} onMouseMove={handleMouseMove}>
      <canvas ref={canvasRef} />
      {tooltip && (
        <div
          className="graph-tooltip"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translateY(-100%)" }}
        >
          <div className="tt-subject">{tooltip.node.subject}</div>
          {tooltip.node.body && (
            <div className="tt-body">{tooltip.node.body}</div>
          )}
          <div className="tt-hash">{tooltip.node.hash}</div>
          <div className="tt-meta">
            {tooltip.node.author} &lt;{tooltip.node.email}&gt; &middot;{" "}
            {formatDate(tooltip.node.timestamp)}
          </div>
        </div>
      )}
    </div>
  );
}
