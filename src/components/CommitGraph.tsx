import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRepoStore } from "../application/repoStore";
import { GraphRenderer } from "../renderer/canvasRenderer";
import { useT, getGlobalLocale } from "../i18n";
import { gitApi } from "../infrastructure/gitBridge";
import RefNameDialog from "./RefNameDialog";
import type { GraphNode } from "../types";

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

type NodeMenuAction =
  | "create-branch" | "create-tag" | "checkout" | "compare"
  | "cherry-pick" | "revert"
  | "reset-soft" | "reset-mixed" | "reset-hard" | "copy-hash";

export default function CommitGraph() {
  const t = useT();
  const locale = getGlobalLocale();
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
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
  const reloadMeta = useRepoStore((s) => s.reloadMeta);
  const viewRef = useRepoStore((s) => s.viewRef);
  const setViewRef = useRepoStore((s) => s.setViewRef);
  const setCompareBase = useRepoStore((s) => s.setCompareBase);
  const setShowCompare = useRepoStore((s) => s.setShowCompare);

  const [tooltip, setTooltip] = useState<{ node: GraphNode; x: number; y: number } | null>(null);
  // Clamped tooltip position inside the graph viewport (never clipped/overlapping chrome).
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: GraphNode } | null>(null);
  const [refDialog, setRefDialog] = useState<{ kind: "branch" | "tag"; hash: string } | null>(null);
  const [searchText, setSearchText] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const h = () => setCtxMenu(null); window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, []);

  // Search matches
  const matches = useMemo(() => {
    if (!searchText.trim()) return [];
    const q = searchText.toLowerCase();
    return graphData.nodes.filter((n) =>
      n.subject.toLowerCase().includes(q) ||
      n.author.toLowerCase().includes(q) ||
      n.hash.toLowerCase().startsWith(q)
    );
  }, [searchText, graphData]);

  // Update highlights when matches change
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setHighlights(new Set(matches.map((n) => n.hash)));
    }
  }, [matches]);

  // Navigate to current match
  useEffect(() => {
    if (matches.length > 0 && rendererRef.current) {
      const idx = Math.min(matchIndex, matches.length - 1);
      rendererRef.current.scrollToNode(matches[idx].hash);
    }
  }, [matchIndex, matches]);

  const openSearch = useCallback(() => {
    setShowSearch(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  // Ctrl+F to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openSearch]);

  // Initialize renderer on the stacked base/overlay canvases
  useEffect(() => {
    const base = baseCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    const container = containerRef.current;
    if (!base || !overlay || !container) return;

    if (rendererRef.current) rendererRef.current.destroy();

    try {
      const renderer = new GraphRenderer(base, overlay);
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
          const repo = useRepoStore.getState().currentRepo;
          selectCommit(node.hash);
          if (!repo) return;
          const result = await gitApi().show(repo, node.hash);
          // Drop stale responses: the user may have changed repositories or
          // clicked another commit while show() was in flight.
          const state = useRepoStore.getState();
          if (state.currentRepo !== repo || state.selectedCommit !== node.hash) return;
          if (result.success && result.data) {
            setCommitDetail(result.data);
          }
        },
        onNearBottom: () => useRepoStore.getState().loadMoreCommits(),
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

  // Reset the camera when the active repository changes. Cached tab switches
  // swap graph data synchronously, so the renderer's own identity check is not
  // enough — mirror the store's repo change explicitly.
  useEffect(() => {
    rendererRef.current?.resetCamera();
  }, [currentRepo]);

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

  // Repaint when the language changes: the canvas commit-count suffix is i18n.
  useEffect(() => {
    rendererRef.current?.refresh();
  }, [locale]);

  // Clamp the hover tooltip inside the graph viewport: flip it below the cursor
  // for the top rows and keep it clear of the edges and the chrome strip.
  useLayoutEffect(() => {
    if (!tooltip) {
      setTooltipPos(null);
      return;
    }
    const tip = tooltipRef.current;
    const container = containerRef.current;
    if (!tip || !container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const tw = tip.offsetWidth || 300;
    const th = tip.offsetHeight || 96;
    // tooltip.x/y carry the raw cursor position plus a small offset.
    const mouseX = tooltip.x - 14;
    const mouseY = tooltip.y + 8;
    const margin = 10;
    // The top strip holds the zoom/search capsule and view-ref banner.
    const topEdge = 44;

    let left = mouseX + 16;
    if (left + tw > cw - margin) left = mouseX - tw - 16;
    left = Math.max(margin, Math.min(left, Math.max(margin, cw - tw - margin)));

    let top = mouseY - th - 12;
    if (top < topEdge) top = mouseY + 22; // top rows: show below the cursor
    top = Math.max(topEdge, Math.min(top, Math.max(topEdge, ch - th - margin)));

    setTooltipPos((prev) =>
      prev && Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5
        ? prev
        : { left, top }
    );
  }, [tooltip]);

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

  const runNodeOp = useCallback(async (op: () => Promise<{ success: boolean; error?: string }>, label: string) => {
    if (!currentRepo) return;
    setLoading(true, label);
    try {
      const r = await op();
      if (r.success) await refreshAll();
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [currentRepo, setLoading, setError, refreshAll, t]);

  const handleNodeAction = useCallback(async (action: NodeMenuAction) => {
    if (!ctxMenu || !currentRepo) return;
    const hash = ctxMenu.node.hash;
    const short = hash.substring(0, 7);
    setCtxMenu(null);
    switch (action) {
      case "create-branch":
        setRefDialog({ kind: "branch", hash });
        break;
      case "create-tag":
        setRefDialog({ kind: "tag", hash });
        break;
      case "checkout": {
        if (!window.confirm(t("graph.confirmCheckout").replace("{0}", short))) return;
        // batch-checkout auto-stashes/restores a dirty working tree (ADR #7)
        await runNodeOp(() => gitApi().batchCheckout(currentRepo, hash, { stash: true }), t("status.checkingOut").replace("{0}", short));
        break;
      }
      case "compare":
        setCompareBase(hash);
        setShowCompare(true);
        break;
      case "cherry-pick": {
        if (!window.confirm(t("commit.confirmCherryPick").replace("{0}", short))) return;
        await runNodeOp(() => gitApi().cherryPick(currentRepo, hash), t("commit.cherryPicking"));
        break;
      }
      case "revert": {
        if (!window.confirm(t("commit.confirmRevert").replace("{0}", short))) return;
        await runNodeOp(() => gitApi().revertCommit(currentRepo, hash), t("commit.reverting"));
        break;
      }
      case "reset-soft":
      case "reset-mixed":
      case "reset-hard": {
        const mode = action.replace("reset-", "");
        const label = mode === "hard" ? t("graph.confirmResetHard") : t("graph.confirmReset").replace("{0}", mode);
        if (!window.confirm(label)) return;
        setLoading(true, t("graph.resetting").replace("{0}", mode));
        try {
          const r = await gitApi().reset(currentRepo, hash, mode as "soft" | "mixed" | "hard");
          if (r.success) await refreshAll();
          else setError(r.error || t("error.opFailed"));
        } catch (err: any) { setError(err.message); } finally { setLoading(false, ""); }
        break;
      }
      case "copy-hash":
        await navigator.clipboard.writeText(hash);
        break;
    }
  }, [ctxMenu, currentRepo, t, runNodeOp, setCompareBase, setShowCompare, setLoading, setError, refreshAll]);

  const handleRefDialogSubmit = useCallback(async (name: string) => {
    if (!refDialog || !currentRepo) return;
    const { kind, hash } = refDialog;
    setRefDialog(null);
    const label = kind === "branch" ? t("sidebar.creatingBranch").replace("{0}", name) : t("tags.creating").replace("{0}", name);
    setLoading(true, label);
    try {
      const r = kind === "branch"
        ? await gitApi().createBranch(currentRepo, name, false)
        : await gitApi().createTag(currentRepo, name, hash);
      if (r.success) { await refreshAll(); await reloadMeta(); }
      else setError(r.error || t("error.opFailed"));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false, ""); }
  }, [refDialog, currentRepo, t, setLoading, setError, refreshAll, reloadMeta]);

  const handleZoom = useCallback((factor: number) => {
    rendererRef.current?.zoomBy(factor);
    setZoom(Math.round((rendererRef.current?.getScale() ?? 1) * 100));
  }, []);

  const handleZoomReset = useCallback(() => {
    rendererRef.current?.resetZoom();
    setZoom(100);
  }, []);

  return (
    <div className="graph-container" ref={containerRef} onMouseMove={handleMouseMove}>
      {viewRef && (
        <div className="graph-view-ref">
          <span className="graph-view-ref-dot" aria-hidden="true" />
          <span className="graph-view-ref-label">{t("graph.viewingRef").replace("{0}", viewRef)}</span>
          <button className="graph-view-ref-close" onClick={() => setViewRef(null)} title={t("graph.backToCurrent")} aria-label={t("graph.backToCurrent")}>&times;</button>
        </div>
      )}
      {!showSearch && (
        <div className="graph-zoom-controls">
          <button className="graph-zoom-btn" onClick={() => handleZoom(1 / 1.2)} title={t("graph.zoomOut")} aria-label={t("graph.zoomOut")}>&minus;</button>
          <span className="graph-zoom-label">{zoom}%</span>
          <button className="graph-zoom-btn" onClick={() => handleZoom(1.2)} title={t("graph.zoomIn")} aria-label={t("graph.zoomIn")}>+</button>
          <span className="graph-toolbar-separator" aria-hidden="true" />
          <button className="graph-zoom-btn" onClick={handleZoomReset} title={t("graph.zoomReset")}>1:1</button>
          <span className="graph-toolbar-separator" aria-hidden="true" />
          <button className="graph-zoom-btn graph-search-toggle" onClick={openSearch} title={t("graph.searchPlaceholder")} aria-label={t("graph.searchPlaceholder")}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.5" />
              <line x1="9.2" y1="9.2" x2="12.5" y2="12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
      {showSearch && (
        <div className="graph-search-bar">
          <svg className="graph-search-icon" width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.5" />
            <line x1="9.2" y1="9.2" x2="12.5" y2="12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            value={searchText}
            placeholder={t("graph.searchPlaceholder")}
            onChange={(e) => { setSearchText(e.target.value); setMatchIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setMatchIndex((i) => (i + 1) % Math.max(1, matches.length)); }
              if (e.key === "Escape") { setShowSearch(false); setSearchText(""); }
            }}
          />
          <span className="graph-search-count">{searchText ? `${matches.length}` : ""}</span>
          <button className="graph-search-close" onClick={() => { setShowSearch(false); setSearchText(""); }} aria-label={t("topbar.filterClear")}>&times;</button>
        </div>
      )}
      <canvas ref={baseCanvasRef} className="graph-canvas graph-canvas-base" />
      <canvas ref={overlayCanvasRef} className="graph-canvas graph-canvas-overlay" />
      {tooltip && (
        <div
          ref={tooltipRef}
          className="graph-tooltip"
          style={
            tooltipPos
              ? { left: tooltipPos.left, top: tooltipPos.top }
              : { left: tooltip.x, top: tooltip.y, transform: "translateY(-100%)" }
          }
        >
          <div className="tt-subject">{tooltip.node.subject}</div>
          {tooltip.node.body && (
            <div className="tt-body">{tooltip.node.body}</div>
          )}
          <div className="tt-meta">
            <span className="tt-hash" title={tooltip.node.hash}>{tooltip.node.shortHash}</span>
            <span className="tt-author">{tooltip.node.author}</span>
            <span className="tt-time">{formatDate(tooltip.node.timestamp)}</span>
          </div>
        </div>
      )}
      {ctxMenu && (
        <div className="context-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <div className="context-menu-item" onClick={() => handleNodeAction("create-branch")}>{t("graph.createBranchHere")}</div>
          <div className="context-menu-item" onClick={() => handleNodeAction("create-tag")}>{t("graph.createTagHere")}</div>
          <div className="context-menu-divider" />
          <div className="context-menu-item" onClick={() => handleNodeAction("checkout")}>{t("graph.checkoutHere")}</div>
          <div className="context-menu-item" onClick={() => handleNodeAction("compare")}>{t("graph.compareFromHere")}</div>
          <div className="context-menu-divider" />
          <div className="context-menu-item" onClick={() => handleNodeAction("cherry-pick")}>{t("graph.cherryPick")}</div>
          <div className="context-menu-item" onClick={() => handleNodeAction("revert")}>{t("graph.revertCommit")}</div>
          <div className="context-menu-divider" />
          <div className="context-menu-item" onClick={() => handleNodeAction("reset-soft")}>{t("graph.resetSoft")}</div>
          <div className="context-menu-item" onClick={() => handleNodeAction("reset-mixed")}>{t("graph.resetMixed")}</div>
          <div className="context-menu-item danger" onClick={() => handleNodeAction("reset-hard")}>{t("graph.resetHard")}</div>
          <div className="context-menu-divider" />
          <div className="context-menu-item" onClick={() => handleNodeAction("copy-hash")}>{t("graph.copyHash")}</div>
        </div>
      )}
      {refDialog && (
        <RefNameDialog
          title={t(refDialog.kind === "branch" ? "graph.createBranchHere" : "graph.createTagHere")}
          placeholder={t("sidebar.branchNamePlaceholder")}
          confirmLabel={t(refDialog.kind === "branch" ? "sidebar.create" : "tags.create")}
          onSubmit={handleRefDialogSubmit}
          onClose={() => setRefDialog(null)}
        />
      )}
    </div>
  );
}
