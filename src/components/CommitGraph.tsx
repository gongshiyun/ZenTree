import { useEffect, useRef, useState, useCallback } from "react";
import { useRepoStore } from "../stores/repoStore";
import { GraphRenderer } from "../renderer/canvasRenderer";
import { useT } from "../i18n";
import type { GraphNode } from "../types";

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

export default function CommitGraph() {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const graphData = useRepoStore((s) => s.graphData);
  const isDark = useRepoStore((s) => s.isDark);
  const selectedCommit = useRepoStore((s) => s.selectedCommit);
  const selectCommit = useRepoStore((s) => s.selectCommit);
  const currentRepo = useRepoStore((s) => s.currentRepo);
  const setCommitDetail = useRepoStore((s) => s.setCommitDetail);
  const setLoading = useRepoStore((s) => s.setLoading);
  const setError = useRepoStore((s) => s.setError);
  const refreshAll = useRepoStore((s) => s.refreshAll);

  const [tooltip, setTooltip] = useState<{ node: GraphNode; x: number; y: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: GraphNode } | null>(null);
  const mousePosRef = useRef({ x: 0, y: 0 });

  useEffect(() => { const h = () => setCtxMenu(null); window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, []);

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
        onContextMenu: (node, x, y) => {
          setCtxMenu({ x, y, node });
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

  const handleReset = useCallback(async (mode: "soft" | "mixed" | "hard") => {
    if (!ctxMenu || !currentRepo) return;
    const hash = ctxMenu.node.hash;
    const label = mode === "hard" ? t("graph.confirmResetHard") : t("graph.confirmReset").replace("{0}", mode);
    if (!window.confirm(label)) { setCtxMenu(null); return; }
    setCtxMenu(null);
    setLoading(true, t("graph.resetting").replace("{0}", mode));
    try {
      const r = await window.gitAPI.reset(currentRepo, hash, mode);
      if (r.success) await refreshAll();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
  }, [ctxMenu, currentRepo, setLoading, setError, refreshAll]);

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
      {ctxMenu && (
        <div className="context-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <div className="context-menu-item" onClick={() => handleReset("soft")}>{t("graph.resetSoft")}</div>
          <div className="context-menu-item" onClick={() => handleReset("mixed")}>{t("graph.resetMixed")}</div>
          <div className="context-menu-item danger" onClick={() => handleReset("hard")}>{t("graph.resetHard")}</div>
          <div className="context-menu-divider" />
          <div className="context-menu-item" onClick={async () => { await navigator.clipboard.writeText(ctxMenu.node.hash); setCtxMenu(null); }}>{t("graph.copyHash")}</div>
        </div>
      )}
    </div>
  );
}
